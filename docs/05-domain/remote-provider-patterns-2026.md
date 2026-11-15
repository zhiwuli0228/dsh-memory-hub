# 远端记忆接入的工程模式（2026-11 全网调研）

> 调研日期 2026-11-14（Asia/Shanghai）。目的：回答"本地插件 + 远端托管记忆（腾讯优先，未来可换）"应该怎么接才不至于把自己焊死。
> 纪律：每条论断附来源；中文社区文章作为实践参考，一手代码/规范作为结论依据。

---

## 0. 结论先行

1. **可插拔记忆后端（Pluggable Memory Provider）是这个领域的成熟模式**，但成熟的是"读/写/预取"，**普遍缺失的是治理**——`forget`（删除）和 per-call `scope`（作用域）。这两项缺失比"接到哪家"更致命。
2. **接口的能力声明（capabilities）决定上限**：契约里没有的语义（删除、信任态、时效），后端再强也传不过边界；契约写宽了又会破实现者。所以宁可**声明能力 + 显式降级**，不要"猜测最弱后端"。
3. **镜像（mirror）必然产生两份独立生命周期的副本**，除非删除也镜像。Copy 写入是最容易的同步方式，也是最容易制造"两个库互相说谎"的方式。
4. **通常只允许挂一个 provider**（Hermes 的 `MemoryManager` 只挂一个外部 provider），目的是避免工具 schema 膨胀与后端互相冲突；**允许多个**的实现（Strands）用"并发 fan-out + 按注册顺序拼接、不做跨库排序"来换简单性，代价是注入上限被先注册的库吃掉。
5. **"代理层"是绕开宿主契约的另一条路**：TencentDB Agent Memory 本身是模型 API 的反向代理（把 `base_url` 指过去），因为它拥有流量而非宿主里的一个槽位，删除与作用域就成了它自己的定义（`atomic/delete`、`scenario/rm`、团队/用户/agent/task 组合进删除谓词）。
6. **中文社区的实践高度趋同**：*云上只放"人格/指针"，本体留在本地*；*事件日志而不是整包覆盖*；*哈希校验 + 原子写 + 幂等*；*冲突先标记再仲裁，不静默覆盖*。

---

## 1. 宿主侧契约：四组能力点

[agent-memory-atlas · Pluggable Memory Provider](https://github.com/neoneye/agent-memory-atlas/blob/21afbd103c6e6097db5df307921dfafad7b121e8/content/patterns/pluggable-memory-provider.md) 把宿主侧记忆接口拆成四组，并指出"happy path 接口回答了不了任何一个治理问题"：

```text
Lifecycle    initialize / shutdown / on_session_start / on_session_end
Read         prefetch(query, scope) -> context block
             system_prompt_block() -> static text
Write        sync_turn(user, assistant, scope)
             on_memory_write(action, target, content)      # 镜像宿主写入
Governance   forget(scope | id) -> result                  # <-- 通常缺失
             scope on EVERY call                           # <-- 通常缺失
             capabilities() -> 后端实际支持什么
```

对 13 个宿主契约的清点结论：

| 能力 | 声明了的 | 说明 |
| --- | --- | --- |
| per-call `scope` | 仅 2 个（ADK 必填 kwarg、MateClaw 成对重载） | 其余把 `session_id` 当作用域，等于"启动时学一次用户" |
| 定向删除 `delete(id)` | 仅 1 个（Pydantic AI Harness 的 Protocol） | 其余只有 `clear()` 或什么都没有 |
| 能力声明 | Strands 用"类型上有没有这个方法"探测，不需要人工维护 flag | 好处：宿主不必假设最弱后端 |

**通用观察**：`Agno` 是"契约弱但实现强"的例子——接口不要求 scope/删除，但同一批人写了 6 个实现，所以能力存在；代价是第三方 store 静默忽略 `user_id` 也无人察觉。

**唯一有失败词汇表的契约**是 Cosmonapse 的 `Engram`：`EngramTimeout` / `EngramCancelled` / `EngramNotBound` / `EngramOverloaded`，外加 `can_serve(query) -> bool` 让后端**主动拒答**（BM25 被要求向量检索时）。这是"检索可以合法返回空"唯一能被契约表达的地方。

**开放语义标准**：[OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai) 定义了 7 个记忆操作 `create_memory / search_memory / update_memory / upsert_memory / delete_memory / create_memory_store / delete_memory_store`，**两次点名删除、两种粒度**，但**完全不声明 scope**（只有 `gen_ai.memory.store.id`）。记忆记录 schema 只有 `content`（必填）、`id`、`score`、不透明 `metadata`——时效、信任态、provenance、supersede 全部落进 `metadata`，跨实现不可比。

> 对我们的直接含义：**接口必须写进 `scope` 与 `forget`，否则再接十家远端也补不回来。**

---

## 2. 远端"代理型"记忆：腾讯的做法

[TencentDB Agent Memory · Plandex 适配器](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/9742dfa3cb524bf52c82fe7b5fe9a1e45ec11d15/adapters/plandex/README_CN.md) 披露了它的接入形态：

```text
Plandex（自定义 provider）
   │ POST /proxy/<spaceId>/v1/chat/completions
   ▼
MemoryProxy :8096  ── 会话初始化 / 记忆注入 / 对话回流
   ├──► 上游 LLM（PROXY_UPSTREAM_MODEL）
   └──► MemoryCore :8420（L0/L1/L2/L3 记忆流水线）
```

要点：

- **接入方式 = 把任意 OpenAI 兼容客户端指向代理**，不依赖宿主有记忆接口。Plandex 之所以能接，是因为它支持"自定义 provider + 自定义 baseUrl"（且仅自托管模式）。
- 首次会话要**依次选 Team → Agent → Task**，把记忆挂到正确位置；之后自动绑定。这与我们每天看到的"重复弹窗选团队资产"是同一个机制。
- 配置面是**纯环境变量**：`TDAI_UPSTREAM_MODEL` / `TDAI_USER_KEY` / `TDAI_PROXY_BASE_URL` / `TDAI_CORE_BASE_URL` / `TDAI_SPACE_ID`；`check --probe` 走一次 1-token 对话做端到端探活。
- 删除与作用域是**它自己定义的**（`atomic/delete`、`scenario/rm`、团队/用户/agent/task 组合进删除谓词，写 `memory_audit`）。

**对我们的含义**：腾讯提供的是"代理 + 三层记忆流水线"，不是一个通用的记忆同步 API。所以桥接只能是**单向权威 + 通道语义**（我们现在的 pull/push），不能指望它做双向合并。

---

## 3. 中文社区的三条实践共识

### 3.1 云上只带"灵魂"，本体留在本地

[腾讯云开发者社区 · 把 AI 的"人格"塞进 20KB](https://cloud.tencent.com.cn/developer/article/2752069)：作者最初把 146KB 记忆库 + 7 个项目库全量上云，涨到 67 个分片 ≈ 400KB、manifest 62KB、整目录 1.2MB，彻底失控。重构后的规则：

- 上云的是**个人画像**，不是资料库/项目库；**硬顶 20KB**、单文档 + 8 个固定分区；
- 本地四库分层（画像 / 知识 / 资料 / 项目），**重要资料 100% 本地，云端只留指针**；
- **反分片靠接口层面堵死**：用固定 `file_id` 整体覆盖，而不是"同步后清理碎片"；
- 44 章 103KB 明细蒸馏成 **7 条根律 + 本地指针**。

踩坑里最有普适性的两条：**清单文件必须放在压缩包顶层**（某些导入器不递归）；**中文环境 PowerShell 5.1 按 GBK 误解码会秒关窗口**（脚本要 UTF-8 with BOM）。

### 3.2 事件日志而不是整包覆盖

[CSDN · 多 Agent 会话与技能集中同步](https://blog.csdn.net/weixin_42663213/article/details/170468476)：把会话与技能当"可版本化、可校验的数据资产"。

- 会话是**追加流**，整包同步必然丢上下文；同步的是**事件序列**（`event_id` + `parent_event_id` 因果链 + `source` + `created_at`）。
- 排序**不能按 `created_at`**——离线设备时钟偏差会颠倒顺序，要按因果链拓扑序。
- 游标 `cursor` 记录"本机同步到哪条事件"，增量拉 `after=cursor`。
- 冲突三策略：追加型 → 事件合并；属性型（summary 等）→ last-write-wins；**内容型文件冲突 → 双写保留 + 标记 + 人工仲裁**。"把所有冲突交给 LWW，短期省事，长期一定丢信息。"
- 技能分发：注册表 `content_hash` + 文件级 `sha256` + **暂存 → 备份 → 原子替换 → 记录部署**；哈希一致返回 `noop`（幂等）。
- 排查纪律：**"不要只验证命令退出码为 0。要对比哈希、数量和部署记录。"**

### 3.3 代理层绕开契约（知乎视角）

[知乎 · Agent as a Service](https://zhuanlan.zhihu.com/p/2096622852644644699)：个人场景"通过稳定身份延续会话与记忆，在本地和远端 Harness 之间交接工作"，企业场景"事件转成带输入版本和验收要求的任务"。

即：**记忆的连续性靠"稳定身份"而不是"同步完整状态"**——这与我们 `scope` 金字塔 + 引用生命周期的方向一致。

---

## 4. 通用记忆服务的接口形态（对照）

[tabellio · 宿主与接口](https://raw.githubusercontent.com/yffo/tabellio/refs/heads/main/docs/03-hosts-and-interfaces.md)（2026-10-17 调研，覆盖 MCP 现状 + 11 个宿主）给出的结论可直接抄：

- 对外**只暴露一个 MCP 服务器 + 一个 CLI**，宿主差异收敛成"配置片段 + 安装说明"；宿主有生命周期钩子时才加一层**薄适配器**（只映射时机，不改数据模型）。
- 判据不是"宿主支不支持 MCP"，而是"**有没有轮前注入点 + 轮末捕获点 + 来源 id**"，三者全有才值得写原生适配。
- 进程模型走**混合**：常驻本地核心（唯一写者，127.0.0.1 + bearer）+ 每宿主一个 stdio 薄壳（连不上核心就退化为只读）。
- 官方的 MCP memory server 已证明"每客户端一进程、共用一份文件"必须自己做锁：独占创建 + 15s 刷新 + 30s 判死 + 60s 抢不到报错 + **网络文件系统不安全**。
- 工具面 5±2 个、默认只读、大输出分页/落盘（Claude Code 默认 25k token / 50k 字符 / 16MiB 三道墙）。
- 写入闸门：agent 可以提议，**批准权不交给 agent**（`remember` 直写 vs `capture` 只写候选）。

---

## 5. 2026 年的记忆领域共识（写作路径）

[backlog-mcp ADR 0092.5](https://raw.githubusercontent.com/gkoreli/backlog-mcp/refs/heads/main/docs/adr/0092.5-agentic-memory-landscape-2026.md) 对 Hindsight / Mem0 / MemPalace / Letta / Zep 的一手调研，抽出与"本地 + 远端"直接相关的几条：

- **Mem0 反悔了**（2026-04）：放弃 LLM 调和的 ADD/UPDATE/DELETE/NOOP，改成 **ADD-only 不可变记录 + 检索期时间逻辑**——"调和很慢，而且正是上下文被毁掉的地方"。
- **Zep/Graphiti 双时间**：`valid_at` / `invalid_at`，**作废而不删除**；每条派生事实必须能追到原始 episode。
- **MemPalace**：本地优先、逐字存储、**核心零 LLM**，LongMemEval 96.6% R@5；"closet"层只提升排序、**永不过滤**；删除数据目录即永久停用捕获（kill switch）。
- **Letta sleep-time compute**：每个 agent 实际是两个——主 agent + 只在空闲时改写记忆的后台 agent；后台整理器**保有自己的游标/水位**。这就是"外部 cron 整理、服务端保持笨"的形态。
- **A-MEM**：候选生成确定性（embedding-kNN）、只有 link/merge 判断用 LLM——正好映射到"服务器/agent 边界"。
- 跨系统共识：**证据与推断结构分离，推断必须引用证据**；**永不破坏性**（supersede/invalidate/expire，保留历史）；**使用信号只加权、不门禁，且要有界**（Mem0 的 1.5×–0.3× 乘数）；**叙述式记忆优于原子碎片**；**服务器里放确定性、判断交给 agent**。
- 反面教训：MemPalace 的"矛盾检测"宣称 13 个月仍未上线 → **不要把矛盾消解放进写入路径**，只做确定性检测 + 人审。

---

## 6. 对我们（dsh-memory-hub）的 8 条可执行结论

| # | 结论 | 依据 |
| --- | --- | --- |
| 1 | 抽象层必须包含 **`scope` + `forget`**，否则远端能力传不过边界 | atlas §Governance |
| 2 | 每个 provider 必须 **声明 capabilities**，不支持就显式降级/拒答 | Strands / Cosmonapse `can_serve` |
| 3 | 默认 **单写者、本地权威**；远端按"角色"接入（feed / mirror / authority / index），不是按"厂商"接入 | 我们已验证的"借船不弃锚" |
| 4 | 冲突**不自动合并**：`local-wins` 或 `412 → 人审 diff` | CSDN §6、proposal-team-memory §7 |
| 5 | 同步走**事件游标 + outbox + 幂等键**；游标要能 `410 → 重拉快照` | CSDN §4、tabellio |
| 6 | **删除要跨边界传播**，并把"远端删不掉"记为显式孤儿状态（而不是假装成功） | atlas §Tradeoffs / 测试清单 |
| 7 | 多 provider **并发只读检索可以组合**，但结果必须带 source 标注、**不做跨库默认混排** | Strands 的代价 |
| 8 | 上云内容**设硬顶**（正文截断/只传摘要+指针），认证只走 env/credential ref | 腾讯云 20KB 实践 |

---

## 7. 未找到公开资料 / 待验证

- ChatGPT 桌面与连接器的记忆接入契约（官方文档在调研时不可直连）。
- 腾讯 MemoryCore 是否有"变更流/推送"能力：目前只有 `atomic/query` 这类拉取接口，**无推送**（我们 2026-11-13 实测与文档一致）。
- 各家（Mem0 / Zep / Letta）是否提供"双向同步"的官方端点：公开资料只看到读/写 API，没有原生 sync 协议，需要自建游标与 outbox。
