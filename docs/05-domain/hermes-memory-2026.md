# Hermes Agent 的记忆管理拆解（Nous Research）

> 调研时间：2026-11-08。来源以官方文档为主（`hermes-agent.nousresearch.com/docs`，**[一手]**），插件市场页为作者自述（**[厂商]**）。这是一份「读它、抄它、别抄它」的分析，不是产品评测。

## 0. 一句话结论

Hermes 的记忆不是「一个更大的知识库」，而是**三层分工**：一层**有硬上限、每回合常驻**的策展记忆（`MEMORY.md` / `USER.md`），一层**无限量、按需全文检索**的会话档案（SQLite FTS5），外加一层**可插拔的外部记忆 provider**（Honcho / Limbic / OpenViking / Mem0）。它把「记什么」交给模型自己维护、「记不下怎么办」变成一次强制的整理动作、「查历史」交给不花钱的全文索引。

对我们最有价值的不是它的存储格式，而是四个设计决定：**有界常驻集 + 超限即整理**、**常驻与档案分离**、**写入前安全扫描**、**provider 单活缝隙**。前三条都能在「文件即真相 + 人工审批」的约束内落地。

## 1. 三层记忆各是什么

| 层 | 载体 | 容量 | 何时进入上下文 | 谁维护 |
| --- | --- | --- | --- | --- |
| 策展记忆 | `~/.hermes/memories/MEMORY.md`（代理笔记）+ `USER.md`（用户画像） | **硬上限** 2,200 / 1,375 字符（约 800 / 500 token） | 会话开始时**冻结**注入系统提示 | 模型通过 `memory` 工具 add / patch / remove；人可手改文件 |
| 会话档案 | `~/.hermes/state.db`（SQLite + FTS5） | 无上限（所有 CLI / IM 会话） | 模型显式调用 `session_search`，**不自动注入** | 宿主自动落库，模型只读 |
| 外挂 provider | 插件（Honcho、Limbic、OpenViking、Mem0、RetainDB、ByteRover…） | 由 provider 决定 | 每回合 `prefetch` 预取 + 可选 `system_prompt_block` | provider 自己；内置记忆**始终**并行工作 |

关键点：**常驻层是有界的**。2,200 字符大约 8–15 条信息密度高的条目；它不追求「记住所有事」，只保证「下次开局就知道你是谁、项目在哪、哪些坑踩过」。其余全部下沉到可检索档案。这和我们「每回合预检注入紧凑包 + 按需 `memory_get`」是同一种预算思路，但 Hermes 把「永远要记得的」和「可能要用到的」分成了两种存储，而不是同一个库里的两种查询。

## 2. 写入路径：工具、上限、整理动作

### 2.1 `memory` 工具只有三个动作

`add` / `patch` / `remove`，每次调用必须带顶层 `target`（`memory` 或 `user`），支持一次提交多个 `operations`。

- **没有 `read` 动作**：内容已经在系统提示里，模型直接看得到。
- **`patch` / `remove` 用「唯一子串」定位**（`old_text`），不要求整条匹配；匹配到多条会报错要求更精确。
- 历史上曾有 `replace`，因为模型拿它当「查找替换」把多事实条目整条覆盖掉，已被移除；现在传 `replace` 会收到指向 `patch` 的错误。
- `patch` 只替换条目内部的一段，保留其余内容——这是「改一条里的一小部分」的正确粒度。

### 2.2 满了不是丢，而是报错并逼你整理

写入会超限时，工具**不写入**，返回一个可执行的错误：

```json
{
  "success": false,
  "error": "Memory at 2,100/2,200 chars; adding this entry (250 chars) would exceed the limit by 153 chars. Retry as ONE 'operations' batch that removes or shortens (patch) stale entries from current_entries below to free at least 153 chars AND adds this entry — the limit is checked only on the batch result.",
  "current_entries": ["..."],
  "usage": "2,100/2,200"
}
```

三个细节值得抄：

1. **错误里带当前状态和精确缺口**（`current_entries` + 差 153 字符），模型不需要先读一遍再算。
2. **批量只校验最终结果**：允许「删两条 + 加一条」作为一个原子批次，避免删完加不进去。
3. **80% 阈值提示**：系统提示头里显示 `[67% — 1,474/2,200 chars]`，模型能提前整理，而不是撞墙。

这比「静默丢弃最旧条目」或「自动摘要压缩」都更可控：丢失永远由模型显式选择，且同一回合内完成。

### 2.3 写入前过滤

- **精确重复**直接拒绝（返回 success + "no duplicate added"）。
- **安全扫描**：条目在进入系统提示前会过一遍注入 / 外泄模式（prompt injection、凭据外泄、SSH 后门）与**不可见 Unicode**；命中即拒绝。理由很直接：记忆会被注入系统提示，等于「持久的提示注入载体」。
- **密钥擦洗**：交给外部 provider 的所有内容（对话轮次、工具输出、检索查询、会话结束与压缩前的 transcript、镜像的记忆写入）都先过与聊天平台投递相同的 secret scrub，即使 `security.redact_secrets: false` 也生效。

### 2.4 审批：`write_approval` 与后台 staging

默认模型**自由写**。设 `memory.write_approval: true` 后：

- 交互式 CLI 前台写入：行内提示，人看全文后批准；
- 消息平台 / 脚本 / **后台自省复盘**：写入被 **staging** 到待审队列，用 `/memory pending`、`/memory approve <id|all>`、`/memory reject` 处理；
- 被 stage 的 `patch` / `remove` 会记录它针对的**完整原条目**；批准时如果条目已变化，写入被拒绝并留在待审（防止「批准的是旧文本」）。

这和我们 `memory_propose` → 人 `memory_commit` 的差别是**粒度与默认值**：Hermes 默认信任模型、用开关收紧；我们默认不信任、每条都审批。它的 staging 语义（记录目标原文、变化即拒绝）比我们现在的「候选文件 + version 校验」更细，值得对照。

## 3. 读取路径：冻结快照 + 全文检索

### 3.1 冻结快照（frozen snapshot）

会话开始时把两个文件渲染成一段系统提示块，条目用 `§` 分隔，带 `MEMORY (your personal notes) [67% — 1,474/2,200 chars]` 这样的头部。**本会话内不再变**：

- 写入立刻落盘，但**下次会话**才出现在系统提示里；工具返回的是实时状态。
- 官方明确说这是为了**保住 LLM 的 prefix cache**（前缀缓存），会话中途改系统提示会让整段缓存失效。

这是一个被低估的工程权衡：**记忆新鲜度 < 缓存命中率**。对我们的直接含义在 §8.4。

### 3.2 `session_search`：不花钱的「回忆」

- 所有会话存 SQLite（`state.db`），FTS5 全文索引；查询返回**真实消息原文**，不做 LLM 摘要、不截断；还能在命中的会话里前后滚动。
- 延迟量级：FTS5 查询 ~20ms、滚动 ~1ms，**零 LLM 成本**。
- 三种调用形态：发现（discovery）/ 滚动（scroll）/ 浏览（browse）。
- 明确的分工表：常驻记忆 ~1,300 token 固定成本、即时；session search 无上限、按需、仅查询时付费。

对照我们：`memory_reflect` 给的是**有损 digest**（用户诉求 + 助手结论 + 失败工具），能覆盖「补漏」，但**不能回答「当时到底怎么说的」**。DSH 宿主其实提供了 `sessionQuery.searchSessions / searchEvents`，我们目前只用了 `listSessions / readSession`。这是最直接的一个缺口（§8.1）。

### 3.3 「记忆需要会话边界」

官方专门写了一节：整套机制围绕**会话结束**设计；会话内部一切还在上下文里，记忆工具没什么可做的。所以建议在自然边界 `/new`；消息平台上的聊天是「一个永不结束的会话」，会导致压缩反复跑、`forget → recall → search` 的学习回路几乎不触发、新写的记忆因为冻结快照也看不见。这个观察对我们同样成立：**没有会话边界，回顾式萃取就没有素材，预检也没有「重新开局」的收益**。

## 4. 后台自省复盘（background review）

每回合结束后，Hermes fork 一个后台 agent 复盘这次对话，**自动**写记忆、写/改 skill：

- 通知：`💾 Memory updated` / `💾 Skill 'foo' patched`，`display.memory_notifications: off|on|verbose`。
- 成本控制：
  - 同模型复盘可复用父对话的 **warm prefix cache**，几乎只付 cache read；
  - 换便宜模型时无法复用缓存，改为回放**压缩 digest**（近期逐字 + 早期摘要），官方称记忆捕获率基本不变；
  - `auxiliary.background_review.max_input_tokens` 限制单次复盘累计输入；默认按模型上下文 75%（上限 600k）；
  - 本地 GPU 上默认 `defer: auto`：排队到空闲再跑，避免抢占下一次提问的显存。
- `skills.write_approval: true` 时，skill 写入总是 staging，`/skills diff` 看完整 diff 再批。

我们的对应物是**按工作区定时回顾**（`reflect:`，默认 04:30）+ 任务收尾的 `memory_close_task`。差别在**触发时机**：Hermes 在「刚说完」就复盘（上下文最热、细节最全），我们在「第二天凌晨」回顾（更省、更批量，但 digest 已经丢了中间过程）。我们的 digest 设计恰好和它「换模型时回放 digest」的做法同构。

## 5. Provider 缝隙：外挂记忆怎么接

内置记忆**永远在**，外部 provider **最多一个**，`memory.provider` 按名字激活。宿主在固定位置调用：

| 钩子 | 时机 | 用途 |
| --- | --- | --- |
| `initialize(session_id, **kwargs)` | 会话启动 | 连接、拿到 `hermes_home` / `cwd` / `platform` / `resumed` 等上下文 |
| `system_prompt_block()` | 组装系统提示 | 静态 provider 信息 |
| `prefetch(query)` | 每次 API 调用前 | 返回 recall 上下文 |
| `queue_prefetch(query)` | 每回合结束后 | 为下一回合预热（后台线程） |
| `sync_turn(user, assistant)` | 每回合完成 | 持久化对话 |
| `on_session_end(messages)` | 会话结束 | 最终抽取 / flush |
| `on_pre_compress(messages)` | 上下文压缩前 | 丢失前抢救（可 opt-in 成 fail-closed checkpoint） |
| `on_memory_write(action, target, content, metadata)` | 内置记忆被写 | 镜像到外部后端 |

四个治理细节：

1. **发现顺序与遮蔽**：bundled → user → project → package，**先出现的赢**（与普通插件相反），因为「按名字激活」被遮蔽会**悄悄换掉整个记忆后端**。
2. **只枚举不导入**：没被 `memory.provider` 选中前，provider 代码不执行。
3. **prefetch 超限 spill**：默认完整返回（保留 provider 的相关性排序），到 10× `hooks.output_spill.max_chars`（至少 100k 字符）才溢出到文件；`memory.prefetch_spill_enabled: true` 可提前换 head/tail 预览。
4. **配置面板**：provider 自带 `config_schema.py`，桌面「Capabilities → Tools → Memory」直接渲染；秘密字段进 `.env`，非秘密进 provider 自己的 JSON。

这套「单活 + 按名激活 + 固定钩子」的缝隙设计，比「允许多个记忆插件同时乱写系统提示」稳得多。我们的对应位置是 `KnowledgeStore` / 检索层；短期不需要插件化，但**「按名激活、防遮蔽」**这条原则对我们以后接外部索引仍然适用。

## 6. 生态里的四种「外挂记忆」

### 6.1 Honcho：用户建模 + 辩证推理

- 每回合两层注入：**base context**（会话摘要 + 用户 representation + peer card + AI 自述）按 `contextCadence` 刷新；**dialectic supplement**（LLM 推理出「此刻最相关的用户状态」）按 `dialecticCadence` 刷新，`dialecticDepth` 1–3 轮（cold/warm prompt 自动切换、self-audit、reconciliation）。
- 三个**正交**成本旋钮：`contextCadence`（API 频率）、`dialecticCadence`（LLM 频率）、`dialecticDepth`（每次推理深度），外加 `contextTokens` 注入预算。
- `recallMode`：`hybrid`（自动注入 + 工具）/ `context`（只注入）/ `tools`（只工具，模型自己决定何时查）。
- `sessionStrategy`：`per-session` / `per-directory` / `per-repo` / `global`——「记忆挂在什么身份上」是一等配置。
- 多 peer：同一 workspace 下一个用户 peer + 每个 profile 一个 AI peer；observation 四开关决定「谁从谁的话里建模」。

值得抄的是**「谁在建模谁」的显式化**与**正交旋钮**：我们的 `local_boost` / `min_score` / `pack_tokens` 其实也是正交的，但没有「身份」这一维——我们的作用域是**工作区**，不是**人**。

### 6.2 Limbic：本地、无 LLM、信任衰减

- 单文件 SQLite + 自带 ONNX 向量模型（Arctic Embed 2.0 int8）+ NLI 交叉编码器；**不调用 LLM**。
- 三个工具：`remember` / `recall` / `forget`；`recall` 没把握时返回 `no_confident_match` **而不是猜**。
- 机制：新记忆「安静」起步，被用得多才更容易被召回；相似记忆竞争，新的取代旧的；**纠正只降旧事实的 trust，不改写原文**；recall 重置衰减时钟；后台 sweep 清掉衰减到零的记忆。
- 多用户：profile 硬隔离，或一个 profile 内按 `user_id` 分桶 + `users.yaml`（`guardians` 允许监护人写入被监护人 scope）。
- 删除：`forget` 先列候选、再由人指定 id；删除写 **hash-only tombstone**（只留 sha256 / 长度 / id），不留内容。

对我们的映射：我们的 `superseded_by` + `temporal` 已有「旧条目降权 + 指向新条目」，但没有「用一次就续命」的信号——我们记录 `memory_cite`，**引用数应该反向影响排序与 aging**。Limbic 的「纠正即生效、旧条渐变」比我们「只靠 `expires_at` 判 stale」更接近真实知识演化。

### 6.3 OpenViking：六类抽取 + 分层加载

- 会话提交时自动抽取 6 类：profile / preferences / entities / events / cases / patterns。
- 分层加载 L0（~100 token 摘要）→ L1（~2k 概览）→ L2（全文），用 `viking://` URI 做文件系统式浏览。
- 工具 6 个：search / read（分层）/ browse / remember / forget / add_resource。

分层加载和我们的 `memory_get`（默认摘要 → `section` → `full`）几乎一模一样，说明这个交互是收敛的。六类抽取则提示：**「用户画像 / 偏好」应该是一等类型**，而不是混在 `knowledge` 里。

### 6.4 Mem0：服务端抽取 + 去重

- 服务端 LLM 抽取、语义检索、rerank、自动去重；三种部署（云 / 自托管 dashboard / OSS 进程内）。
- 工具 4 个：search / add / update / delete。

它代表「把写侧完全外包」的路线。我们要的恰好相反（可审计、文件原生），但它的**自动去重**与我们刚落地的 `memory_duplicates` + `merge` 是同一问题的两种解法。

## 7. 逐项对照

| 维度 | Hermes Agent | dsh-memory-hub（现状） | 差异性质 |
| --- | --- | --- | --- |
| 常驻层 | 2 文件、硬上限 2.2k/1.4k 字符、冻结注入 | 每回合预检包 `pack_tokens`（默认 600），动态变化 | 它固定、我们动态 |
| 知识规模 | 常驻层刻意小，其余靠 session search | 知识库持续增长，靠 BM25 + 时效 + 维护 | 它把「档案」外包给会话库，我们没有原文检索 |
| 写入 | 模型直写，可选审批；超限即报错整理 | 模型 propose，人 commit；无容量上限 | 它靠容量压力，我们靠审批 |
| 整理 | 模型同回合删/改；后台 review | 夜间确定性维护 + merge + 定时蒸馏 | 我们离线，它在线 |
| 检索 | FTS5 原文（零成本）+ provider 语义 | CJK 分词 + BM25-lite + 时效降权 + 金字塔回退 | 我们中文强，它历史检索强 |
| 时效 | 无内建过期，靠外部 provider | `fresh/aging/stale/scheduled` 派生降权 | 我们更完整 |
| 安全 | 写入扫描注入/外泄 + secret scrub | 人工审批 + 门禁 + 面板同源校验 | 互补 |
| 多用户 | profile / peer / user bucket + guardian | 工作区 + 金字塔作用域 + admin | 维度不同（它按人，我们按项目） |
| 治理 | 会话库 + 待审队列 + skill ledger/rollback | 账本 + history/ + 面板审核 | 都有，粒度不同 |
| 成本控制 | cadence/depth/tokens/max_input_tokens/defer | pack_tokens/max_hits/min_score | 它更细 |

## 8. 值得抄的六件事（按优先级）

### 8.1 P0：会话「按需取证」，补上 digest 的盲区

我们现在只有 `memory_reflect` 的**有损 digest**。Hermes 的证据很直接：digest 适合「提炼结论」，不适合「回查原话」。

- 落点：`src/reflect.ts` 的 `SessionQueryLike` 增加 `searchSessions` / `searchEvents`（窄接口，宿主没有就降级）；新增只读工具 `memory_recall({ query, limit? })` 或在 `memory_reflect` 加 `query` 模式，返回命中消息原文 + 会话 id + 序号区间。
- 约束：只读、只搜本工作区 root 下会话、结果截断到固定字符数、`source_refs` 用 `session:<id>#<from>-<to>`。
- 收益：把「上周那个报错怎么解决的」从「重新试错」变成一次 ~20ms 查询。

### 8.2 P0：让引用数参与生命周期（Limbic curator 的可用部分）

我们有 `memory_cite` 账本，但引用只用于诊断。Hermes/Limbic 的共同结论是**使用即续命、不用即淘汰**。

- 落点：`maintenance` 增加「未被引用超过 N 天」的 issue；`temporal` 的 aging 计算引入 `last_cited_at`（有引用则视为 `last_verified` 的弱信号，不完全等价）；维护报告给出 `unused` 计数，只报告不自动写候选。
- 不做：不自动 archive（我们的硬规则不允许无审批降级）；归档只能是**人批准的 `deprecate` 候选**。

### 8.3 P0：写入前内容扫描

- 落点：`store.propose` 里加确定性扫描：不可见 Unicode（零宽、Bidi 控制符）、典型注入短语（"ignore previous instructions"）、凭据形态（`sk-…`、`ghp_…`、`AKIA…`）——命中时**不拒绝**，而是在候选 frontmatter 标 `risk: [injection|secret|invisible]`，面板与 `memory_commit` 提示需要额外确认。
- 理由：候选会进系统提示（预检包/`memory_get`），和 Hermes 的 threat model 完全一致；但我们的最终闸门是人，所以「标记 + 提示」比「静默拒绝」更合适。

### 8.4 P1：有界常驻集与「超限即整理」

我们每回合注入的包是动态的，好处是相关，坏处是**前缀缓存每回合都失效**，且没有任何「这条必须永远在」的机制。

- 可选设计：知识条目加 `pinned: true`（每工作区上限 N 条 / 总字符预算），预检时**先放 pinned、再放检索命中**；超预算时预检返回一条明确提示（「pinned 已占 80%，请合并或取消 pin」），而不是静默丢弃。
- 同时把「注入块稳定化」列为性能项：同一会话内若命中集合不变，复用同一段文本（甚至同一消息位置），减少 prefix 抖动。

### 8.5 P1：用户画像独立成维

Hermes 把 `USER.md` 与 `MEMORY.md` 分开，OpenViking 抽 `profile/preferences`，Honcho 建 peer card——三家都认为**「关于人」与「关于项目」不是一类东西**。

- 落点：新增知识类型 `preference`（或 `profile`），固定 `scope: "global"`、小预算、默认进预检包；与 `project:<id>` 的项目知识分开统计与淘汰。
- 注意：我们的金字塔作用域是按项目组织的，用户画像跨项目，必须显式放在 global 且控制体积。

### 8.6 P2：provider 缝隙与「按名激活」

短期不需要插件化存储，但可以先把检索层抽成接口（`Retriever`：`search(query, scope, budget)`），默认 BM25-lite，未来可接外部索引；**单活、按名激活、先出现的赢**这三条防遮蔽规则直接抄。**不抄**多 provider 并行注入系统提示。

## 9. 不该照抄的

| 做法 | 为什么不适合我们 |
| --- | --- |
| 模型直写、默认无审批 | 违反硬规则：权威知识必须人批准 |
| 2,200 字符硬上限 | 我们的价值在「可检索的项目知识」，硬砍会丢正文；用预算 + 检索控制注入即可 |
| SQLite 作为权威存储 | 我们的硬规则是 Markdown/YAML/JSONL 可读可 git；索引可以 SQLite，真相不行 |
| 向量/嵌入成为必需 | 中文场景 BM25 + 分词已够用；引入 1GB 模型与重排成本与「零联网依赖」冲突 |
| 后台自动 archive 知识 | 知识不是 skill，误归档的代价是「决策消失」；只生成 `deprecate` 候选 |
| 「冻结」到本会话完全不可见 | 我们每回合预检本来就要刷新；只借它的缓存意识，不借它的延迟 |

## 10. 建议的下一步

1. 先把 8.1 写成 OpenSpec 提案（`memory_recall` + `sessionQuery.searchEvents` 窄接口），它直接复用刚落地的 reflect 归属逻辑。
2. 8.3 写入扫描是纯增量、可单测、无迁移，适合与 8.1 同批做。
3. 8.2 引用生命周期需要先定义「什么算被引用」的语义（`memory_cite` 已有版本号，可复用），再进维护报告。
4. 8.4 / 8.5 涉及 frontmatter 与预检排序，放到 V0.8 统一评审。
5. 8.6 只记录原则，不排期。

## 11. 参考资料

- [Persistent Memory（官方）](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory) — 两文件、上限、工具动作、冻结快照、容量错误、安全扫描、`session_search`、`write_approval`、后台复盘与成本旋钮。
- [Memory Providers（官方）](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers) — 单活 provider、六个自动动作、prefetch spill、Honcho/OpenViking/Mem0 概览。
- [Honcho Memory（官方）](https://hermes-agent.nousresearch.com/docs/user-guide/features/honcho) — 两层注入、cadence/depth/tokens、recallMode、sessionStrategy、observation。
- [Building a Memory Provider Plugin（官方）](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin) — ABC、钩子表、发现顺序与防遮蔽、配置面板、fail-closed checkpoint。
- [Curator（官方）](https://hermes-agent.nousresearch.com/docs/user-guide/features/curator) — 使用遥测、`active → stale → archived`、pin/lock、ledger + rollback（skill 生命周期，非知识，但淘汰策略可借鉴）。
- [limbic（插件市场，作者自述）](https://hermes-agent.nousresearch.com/marketplace/limbic) — 本地 SQLite + ONNX 嵌入 + NLI、trust 衰减、supersede、`no_confident_match`、多用户分桶与 tombstone。
- [agentmemory（插件市场）](https://hermes-agent.nousresearch.com/marketplace/agentmemory) — 社区记忆插件，作为生态广度参考。
