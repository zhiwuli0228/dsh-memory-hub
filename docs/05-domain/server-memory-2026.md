# 服务端部署与三级管理：业界调研与我们的下一步

> 调研日期：2026-11-12 · 对应 `dsh-memory-hub@0.7.0`（单机、文件原生）
> 目的：为「从单机插件走向服务端部署 + 三级管理」奠定事实基础，不是立项文档。

---

## 0. 一句话结论

业界确实已经把「Agent 记忆」做成了**服务**，而且几乎都把「分层」放在**租户与可见性**上，而不是放在检索算法上：云厂商是 `账号 → 项目/应用 → 用户/会话`，SaaS 是 `organization → project → user/agent`，学术侧另有一套 `短期/中期/长期` 的**记忆分级**。两者经常被混称为「三级」。

对我们来说，真正的分水岭不是「要不要服务器」，而是**权威数据在哪**：

- 单机插件：权威在用户磁盘上的 Markdown，服务端最多是**同步与共享的中继**；
- 服务端产品：权威在服务端数据库，客户端只是视图。

这一步跨过去，`文件即真相` 与 `人审写入` 两条硬规则都要重新定义，而不是简单加一个 HTTP 层。**更关键的是：一旦权威数据可以被复制到客户端，强制性访问控制就不存在了**——GitLab 在自己的权限文档里就是这么说的（§7）。所以「三级管理」必须拆成两件事：**协作可见性**（文件原生也能做）与**强制隔离**（只有服务端权威才能做）。

---

## 1. 先把「三级管理」拆成三种不同的东西

「三级」在中文语境里至少指三种结构，混在一起讨论会得出互相矛盾的结论：

| 叫法 | 层级含义 | 解决的问题 | 典型来源 |
| --- | --- | --- | --- |
| **租户三级** | 组织 → 项目/应用 → 用户/Agent | 隔离：谁能看见谁的记忆 | Mem0 Platform、云厂商托管记忆服务 |
| **作用域三级** | 全局 → 领域/团队 → 项目/个人 | 复用：越往上越抽象、越少人写 | 本仓的 `global / domain / project`（金字塔） |
| **记忆分级** | 工作记忆 → 短期/会话 → 长期/档案 | 容量：上下文放不下时怎么压 | MemGPT 的 core/recall/archival、MemoryOS 的短/中/长期 |

三者可以叠加，但**不是同一层抽象**：租户决定「谁的」，作用域决定「多通用」，分级决定「放多久/多细」。服务端产品通常只做前两个；学术工作只做第三个。我们要做的是**三者同时存在时的边界**，这正是本仓金字塔作用域 + 服务端多租户的交叉点。

---

## 2. 我们现在的基线（对照组）

| 维度 | 现状（0.7.0） |
| --- | --- |
| 权威存储 | `<hub>/knowledge/<type>/<ID>.md`，一条一文件 |
| 派生物 | `records/index.sqlite`（≥3 万条才启用）、`reports/`、`records/reflect-state.json`，可删可重建 |
| 写入 | 模型只能 `memory_propose`；`memory_commit` 走 DSH 原生审批；面板「待审批」人工点击（`panel:human`） |
| 读 | 每回合预检注入紧凑索引；`memory_search` / `memory_get` 按需读正文 |
| 分层 | `global → domain:<id> → project:<id>`；核心工作区可沿 `workspaces[].core_id` 形成祖先链（金字塔） |
| 部署 | 单机、单用户；一个 Hub 根一个写者（`records/.writer.lock`） |
| 网络 | 零强制依赖、不联网；面板只走回环 + 同源校验 |
| 规模 | 实测 10 万条：检索 p50 399ms，索引磁盘 246MB |

明确写在 `project-brief.md` 里的非目标：**不是云端知识库或多端同步服务**。所以这次调研本质上是**重新审视这条非目标**，而不是在既定方向上做优化。

---

## 3. 评测维度（§8 的对照表按这七条对齐）

1. **权威位置**：服务端数据库 / 客户端文件 / 双写。
2. **层级模型**：几层、命名、包含还是并列、能否任意深度。
3. **隔离与继承**：靠什么隔离（账号/namespace/key），有没有跨层只读可见。
4. **写入路径**：自动抽取还是人审；谁有权改权威知识。
5. **检索**：向量 / 图 / 词法；是否跨层检索、如何排序。
6. **生命周期**：TTL、归纳（consolidation）在哪层做、谁触发、能否回滚。
7. **离线与迁移**：断网可用性、导出格式、锁定程度。

---

## 4. 云厂商托管记忆服务

### 4.1 AWS Bedrock AgentCore Memory（[一手](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html)）

**形态**：全托管，托管在 AWS 账号内；SDK/API 接入，不暴露存储。

**层级**（官方术语表，[一手](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-terminology.html)）：

```text
AgentCore Memory（顶层容器）
├── Memory strategy   处理规则：把短期事件变成长期记录
├── Namespace         长期记忆的结构化路径（检索 / 过滤 / 访问控制的单位）
│   └── Memory record 一条长期记忆
└── Session           一次连续交互（sessionId）
    └── Event         事件（actorId 归属，不可变、带时间戳）
```

关键设计：

- **短期 = 原始事件流**，长期 = 从事件里**抽取**出来的记录；两者不是同一份数据的不同视图，而是「原始 → 提炼」。
- 长期记忆是**异步生成**的：先 `CreateEvent` 写短期，后台跑 extraction + **consolidation**（把新抽取的信息与已有记录合并、compaction、reflection），再按 strategy 落到 namespace。
- **namespace 是路径**：默认形如 `/strategy/{strategyId}/actor/{actorId}/session/{sessionId}/`，也可以退化成 actor 级或全局级；`namespaceKeys` 允许自定义段，例如 `{orgname}/{teamname}`（≤ 5 个键）。**前缀检索天然就是"向上归纳/逐层放宽"**。
- **namespace 也是访问控制单位**：官方说它用于组织、检索、过滤与 access control；IAM 侧可按 `bedrock-agentcore:namespace` / `namespacePath` 条件键收窄。
- **前缀检索就是向上归纳**：用 `namespacePath` 查 `/summaries/{actorId}/` 能一次取到该用户所有 session 的摘要——这比"再建一个层级表"便宜得多。
- 生命周期：事件保留 7–365 天；配额（[一手](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html)）：每 Region 150 个 memory、每 memory 6 个 strategy、抽取 150k TPM、检索 30 TPS。
- 检索是语义检索（`RetrieveMemoryRecords`）。

**对我们的启示**：它把「分层」做成了**路径命名空间 + 归属 id（actor/session）**，而不是固定的三层表。这比硬编码三级更灵活，也更容易映射到我们现有的 `project:` / `domain:` 作用域写法；`namespaceKeys` 自定义段（组织/团队）说明**层级应该由调用方声明，而不是由产品枚举**。

### 4.2 Azure AI Foundry Agent Service — Memory（preview，[一手](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/what-is-memory)）

**层级**：`project → memory store → scope → memory item`。

- **store 是管理单元**（开哪几类记忆、默认 TTL），**scope 是唯一分区键**（与 thread 解耦）：默认 `{{$userId}}`，由 `x-memory-user-id` 头或 Entra 的 TID+OID 解析；低层 API 必须显式传 `scope`。
- 记忆按**种类**分三类，不是按层级：**user profile**（稳定偏好）、**chat summary**（对话摘要）、**procedural**（可复用的操作套路）。三类检索时机不同（profile 在对话早期取，summary 每轮取）。
- 生命周期参数也很具体：store 级 `default_ttl_seconds`（0 = 不过期）；`update_delay` 默认 **300 秒空闲**才触发抽取；后台跑 extraction → consolidation（LLM 合并、冲突消解）→ retrieval；另有 item 级 CRUD 与显式 remember / forget。
- 配额：**每 store ≤ 100 个 scope，每 scope ≤ 10,000 条记忆**，检索/更新各 1,000 QPM。
- 边界：不支持 VNet 集成；**共享 scope 等于跨用户共享**，官方建议慎用并对 `user_profile` 字段排敏；官方明确提示 LLM 抽取的记忆要防 prompt injection 与"记忆投毒"，建议内容安全 + 对抗测试。

**对我们的启示**：`store = 租户/应用`、`scope = 用户` 两级就够用，第三级（会话）交给编排框架；「300 秒空闲再抽取」是个值得抄的**批处理闸门**——比每条消息都抽取省一个数量级。

### 4.3 Google Vertex AI Memory Bank（[一手，来自 Google 自有仓库](https://raw.githubusercontent.com/google/adk-docs/main/docs/sessions/memory.md)）

官方文档站在本环境不可达（`fetch failed`），以下取自 Google 自己的 `adk-docs` 与 `adk-python` 源码：

- **层级**：`project / location → reasoningEngine（Agent Runtime）→ scope{app_name, user_id} → memory`；Session/events 另存，与 memory **并列**，没有 org 层。
- 检索：`memories.retrieve(similarity_search_params)` 语义检索；`retrieve_profiles` 按 scope 取结构化画像。
- 生命周期：`generate` 支持 `revision_ttl`、`disable_consolidation`、`generation_trigger_config{"generation_rule":{"idle_duration":"60s"}}`；`create` 支持 `ttl` / `expire_time`。默认 TTL、配额与价格未取到。

**对我们的启示**：与 Azure 同构（scope = app + user 二元键，抽取按空闲触发、可关），说明**"scope 键 + 可关的异步整固"已经是行业默认**。

### 4.4 阿里百炼记忆库（[一手](https://help.aliyun.com/zh/model-studio/memory/add-memory)）

- **层级**：`业务空间 → memory_library_id → project_id → user_id`（`user_id` 必填）；检索时可传 `project_ids` 数组**跨项目**取。
- 检索：语义 `top_k` + `min_score`，Pro 档带 Rerank。
- 计费（[一手](https://help.aliyun.com/zh/model-studio/memory/billing)，2026-08-20 起商业化）：写入 Pro ¥0.03/次、Lite ¥0.018/次；检索 ¥0.001 / ¥0.00002；存储 ¥0.002/万条/小时 ≈ **¥1.44 / 万条 / 月**。

**对我们的启示**：**跨 project 检索**是一个显式的 API 参数，而不是"自动向上继承"——这比隐式继承更可控，也更容易解释给用户。价格量级（万条记忆 ≈ 每月 1.4 元）可作为"服务端成本"的参照。

### 4.5 ChatGPT Memory（[一手](https://help.openai.com/en/articles/8590148-memory-in-chatgpt)）

- **层级**：`账号 / workspace → 全局（saved memories + memory summary）→ Project-only memory → 会话`。
- 临时会话 / 锁定会话**不产生**记忆；关闭"引用聊天历史"后，派生记忆在 30 天内删除。

**对我们的启示**：消费级产品只做了**两级**（全局 + 项目），并且给了"不记忆"的逃生舱（临时会话）。我们做三级管理时，"某一层不记忆 / 不检索"的开关比多一层更重要。

### 4.6 云厂商的共同点

1. **scope 是单键（或 app+user 二元键）**，不是嵌套树；层级靠命名/前缀表达。
2. **异步抽取 + 整固**是默认，且**可以关**（Azure `update_delay`、Google `disable_consolidation`）。
3. **策略即 schema**：存什么、怎么合并，由 strategy/记忆类型声明，不是写死在表结构里。
4. **身份解析要信任锚**（IAM、Entra、header），这正是单机文件系统没有的东西。
5. **namespace / scope 前缀可直接当 ACL 前缀**（AWS 的 IAM 条件键就是这么做），不需要先引入一整套 RBAC 引擎。

---

## 5. SaaS 记忆层与开源实现

### 5.1 Mem0 Platform（[一手](https://docs.mem0.ai/api-reference/organizations-projects)）

**层级**：

```text
Organization
└── Project      ← API key 绑定到 project；客户端不接受 org/project 参数
    ├── member   READER / OWNER
    └── memory   按 user_id / agent_id / run_id 归属（OSS 与 Platform 共用这套归属）
```

要点：

- **org/project 是可选特性**（官方原话：single-user 或简单多用户应用可以不用）。
- 隔离靠**API key**：换 project 就换 key；成员只有 READER / OWNER 两档。
- 数据归属还有**四个并列的 entity id**（`user_id` / `agent_id` / `app_id` / `run_id`）——注意它们是**标签**，不是父子层级；层级只到 project 为止。
- OSS 是双形态：进程内 library，或自托管 Docker server（带 per-user key 与审计日志）；Apache-2.0。
- 抽取、去重、语义检索全在服务端；v3 是 **ADD-only 的异步抽取**（不做需要人确认的 UPDATE/DELETE），项目级可配 `custom_categories`、`custom_instructions`、`agent_custom_instructions`、`multilingual`，以及 **`decay`**（搜索期排序偏置：新近被访问的加权、陈旧的衰减，默认关闭，只影响排序不改数据）。
- 免费额度 10k adds / 1k retrievals，超限直接报错。
- 图记忆、抽取策略、v3 迁移等机制见 [memory-landscape-2026.md §5.1](memory-landscape-2026.md)。

**对我们的启示**：`decay` 这种「只在检索期加权、不改数据」的做法，和我们「时效字段只降权不删除」是同一个思路，可以直接对齐；而「API key = 租户边界」是托管服务的标准答案，文件原生没有等价物。

### 5.2 Zep / Graphiti（[一手](https://help.getzep.com/concepts)）

**层级**（v4 文档的术语）：

```text
Context Lake（管理与治理层）
└── Context Graph（graph_uuid）
    ├── User graph      单个应用用户
    │   └── Thread      对话线程
    └── Shared/Domain graph   "不归某个用户所有"的共享或领域上下文
        └── Document / Episode / Fact / Entity / Observation
```

要点：

- **明确区分「用户图」与「共享/领域图」**：后者正是我们 `domain:` 作用域在服务端的对应物——共享知识不挂在某个用户下面。
- 隔离边界是 **account → project**；每个 user 一个 user graph（跨 thread 合并），另用 Context Graph 做共享；权限走 **UserGroup + PBAC**。
- **Community Edition 已停止维护**（仓库保留、不再更新），实际只剩 Cloud / Graphiti / 企业 BYOC 三条路——这是"自托管开源记忆服务很难长期维护"的直接证据。
- 事实（fact）带**时效**：新数据使旧事实失效时，失效时间写在边上（fact invalidation），旧的仍可查。
- **治理（governance）是一等能力**：谁管理 Zep、哪个 agent/应用能检索什么、审计日志、来源 episode 溯源。也就是说，服务端产品的"三级"里有一层是**治理层**，不是数据层。
- 底层图存储与 Graphiti 的开源形态见 [memory-landscape-2026.md §5.2](memory-landscape-2026.md)。

**对我们的启示**：「共享/领域图 + 用户图」的二分，比「线性三级」更贴近真实需求；我们现在的 `global / domain / project` 已经是这个形状，缺的是**谁能读哪一层**的显式模型。

### 5.3 其他开源 / SaaS 实现的层级表达

| 产品 | 部署形态 | 层级怎么表达 | 隔离边界 |
| --- | --- | --- | --- |
| **Letta**（Apache-2.0） | 本地 runtime / 自托管 App Server / Cloud | 以 **agent** 为中心（blocks / archival / conversations），未找到 org/project 一级的一手文档 | agent |
| **Supermemory** | Cloud + 本地单二进制（同一 API，非开源；lite 10k 文档） | **namespace 是单层字符串**，允许用 `:` 自造层级，但系统不解析；一次请求只能一个 namespace，跨层读要多次请求再合并 | API key 可限定 namespace 子集，越权 403 |
| **Cognee** | 自托管 / 云 | **tenant(org) → role → user** 授权到 dataset，但**物理隔离边界是 dataset**（每个 dataset 独立图/向量后端），tenant 本身不是库边界 | dataset |
| **Honcho** | 自托管 / 云 | workspace → peer / session + scope | workspace |
| **Basic Memory**（AGPL-3.0） | 本地文件优先 | 只有 **project（目录）一层** | 目录 |
| **LangGraph Store** | 库 / 平台 | **namespace 是 tuple，任意深度**，检索按前缀匹配 | 前缀 |

两条最值得记住的结论：

- **Cognee 的教训**：授权层级（tenant/role/user）与**物理隔离层级**（dataset）可以不是同一层。我们如果做服务端，应明确"哪一层是物理边界"（对文件原生来说，天然是 **Hub 根 = 目录**），不要把权限树直接当存储树。
- **LangGraph Store 的原语**：任意深度的 namespace + 前缀检索，等于白送一个"继承"语义。但它的文档也写明两个坑：**前缀搜索会跨层返回**、**超过 limit 静默截断**。我们现在的 `global/domain/project` 是固定三层，改成路径前缀后必须显式处理这两件事。

### 5.4 一个横向观察：服务端产品都在「后台改真相」

调研里最一致、也最不能照抄的一点：

- Mem0 v3 是 **ADD-only 异步抽取**、自动合并，不做需要人确认的 UPDATE/DELETE；
- Zep 在图里**增量更新事实**（旧事实打失效时间，新事实直接进图）；
- Honcho 的 dream 机制会在后台**改写结论**。

它们都成立，因为权威在服务端且用户默认信任抽取结果。**这与我们的「人审写入」直接冲突**：在我们的模型里，后台只能产出 `pending/`，不能改 `knowledge/`。可借用的只是它们的**边界划分**（project/dataset 作为配置与物理隔离单元）与**namespace 前缀原语**，不能借用它们的**后台改写**。

---

## 6. 记忆分级（短期/中期/长期）与晋升规则

### 6.1 MemoryOS：三级 + 明确的晋升规则（[一手](https://arxiv.org/abs/2506.06326)）

- 三个存储单元：**STM（对话页 + dialogue chain，定长队列）→ MTM（同主题聚成 segment，段内 paging）→ LPM（Profile + User KB + Agent Traits）**。
- 晋升/淘汰全是**确定的、无模型的**：
  - STM 满 → FIFO 把最旧页溢出到 MTM；
  - MTM 段 `heat > τ = 5` → 晋升 LPM，**晋升后交互项 `L_interaction` 归零让 heat 回落**（防止同一段反复晋升）；
  - MTM 超容 → 淘汰 heat 最低的段；LPM 的 KB/Traits 是定长 100 的 FIFO。
- heat 公式：`heat = α·N_visit + β·L_interaction + γ·R_recency`，`R_recency = exp(−Δt/μ)`，μ = 1e7 秒。
- 实验：LoCoMo 上相对基线（GPT-4o-mini）平均 **F1 +49.11%、BLEU-1 +46.18%**（作者自评、单 benchmark、未复现，可信度中）。
- 关键点：它的"分级"是**容量 + 热度驱动的搬运**，不需要 LLM 判断——这与我们"维护只出建议、确定性优先"的立场一致；**heat 归零防抖**这一招值得直接抄。

### 6.2 MemGPT / Letta：core / recall / archival（[一手](https://arxiv.org/abs/2310.08560)）

- main context = system instructions + working context（≈ core memory，定长可写）+ FIFO；external = recall（全量消息）+ archival（任意文本/向量）。
- 换页由**水位触发**：token 到 **70%** 触发 memory pressure 警告，模型自己调 `core_memory_append/replace`、`archival_memory_insert/search`；到 **100%** 强制 flush，淘汰约 50% 队列并生成递归摘要。
- 关键性质：**淘汰 ≠ 删除**，被移出主上下文的消息仍留在 recall 里可检索回来。
- 代价：**每次搬动都由模型决定**，行为不确定、成本不可控；我们的立场是"确定性优先"，只能借它的分层，不能借它的搬运方式。

### 6.3 谁做了「向上归纳」

| 系统 | 做法 | 与我们的距离 |
| --- | --- | --- |
| **MemU**（[一手](https://github.com/NevaMind-AI/memU)） | 会话日志蒸馏成 Markdown wiki / skill，agent 自选「不动 / 改旧 / 新建」，本地 SQLite | **形态最接近我们**（文件 + 蒸馏），但改旧由 agent 决定，需要加审批闸门 |
| **A-MEM**（arXiv:2502.12110） | Zettelkasten 笔记 + 自动建链 + memory evolution（新记忆回改旧笔记） | 横向互联，不是分层 |
| **memary** | memory stream + 实体库 + 知识图谱（深度 2 子图），只有频次/recency 排序 | 无层级，只有热度 |
| **GraphRAG**（[一手](https://microsoft.github.io/graphrag/index/overview/)） | 实体/关系抽取 → Leiden 社区检测 → 多层社区摘要 → map-reduce | 标准「向上归纳」管线，但代价是 LLM 批量摘要 |
| **HippoRAG**（arXiv:2405.14831） | KG + Personalized PageRank 单步多跳 | 多跳 QA 至多 +20%，比 IRCoT 便宜 10–30× |

### 6.4 分层真的更好吗（证据，不是感觉）

- **MemoryAgentBench**（[一手](https://arxiv.org/abs/2507.05257)）把能力拆成 accurate retrieval / test-time learning / long-range understanding / selective forgetting，结论是**现有方法无一全能**；分层的收益集中在长程与选择性遗忘。
- **反证 ReFind**（arXiv:2608.12888）：同一套约 2800 题，**不改原文 + 词法索引 + agent 迭代检索拿到 58.2，高于 HippoRAG 2 的 53.2**（同为 GPT-4o-mini），LongMemEval-S/M 93.2/89.3。说明**精细的检索策略可以替代相当一部分结构化收益**。（新论文、作者自建对比，可信度中。）
- 对我们的意义：**不要为了"分层"而分层**。我们已经有确定性的词法检索 + 金字塔作用域，缺的是"写侧"与"跨层晋升"，而不是更复杂的记忆结构。

### 6.5 通用结论

1. **分级是容量问题，不是权限问题**：三层记忆解决"上下文装不下"，不解决"谁能看"。
2. **晋升规则最好确定**（时间 / 热度 / 容量阈值），模型只做"建议"。
3. **必须有降级与遗忘**：只往上搬不删除，最终会像 Anthropic 那个 413 个文件的反例一样失效；但"遗忘"应是**降权 / 标记 stale**，不是物理删除。
4. **可逆**：所有分级方案的淘汰都可检索回来，原文不销毁——这一条我们本来就满足。

---

## 7. 组织级知识层级（真实产品里的三级空间）

### 7.1 GitLab：groups → subgroups → projects（[一手](https://docs.gitlab.com/user/project/members/)）

这是最成熟的「层级 + 继承」参照：

- 成员关系分**直接 / 继承 / 共享 / 继承共享**四种；继承自父组，共享是把另一个组邀请进来。
- 角色（Guest/Reporter/Developer/Maintainer/Owner）+ **到期时间**；能授出的最高角色受自己角色限制。
- 改继承来的成员，只能回到**来源组**改（不能在下级覆盖）。
- 官方在安全说明里写得很直白：**Git 是分布式的，任何能 clone 的成员都拿到完整副本，访问控制挡不住有意的二次分享**。能做的是控制"谁能加入"、保护分支、定期清理成员。

**这条对我们极其重要**：文件原生的 Hub 一旦同步/克隆出去，就和 Git 仓库一样——**权限只能是协作约定，不是强制隔离**。想要真正的三级强制隔离，权威必须在服务端且客户端不持有明文。

### 7.2 企业知识管理：个人 → 团队 → 组织

- **Notion**（[一手](https://www.notion.com/help/guides/grant-access-teamspaces)）：teamspace 分 Open / Closed / Private 三档，权限按 owner / member / 非成员三档授予，支持 group 批量授权，页面可单独分享。
- **飞书知识库 / Confluence**：官方有专页（空间 + 角色 + 页面级权限），但正文是 JS 渲染，本次未取到，**「页面权限向下继承」的具体语义未核实**——写进结论前需要补取。
- **GitLab 的 handbook-first** 是目前最完整的公开样本：流程写进公开 handbook，改动走 MR 评审；个人经验必须变成**可评审的文本**才生效。三条共性可复用：
  1. **晋升要人审**（MR / approve），不是自动摘要；
  2. **晋升后原稿保留**，上层链接下层（不是把下层删掉搬到上层）；
  3. **上层记规范、下层记案例**——抽象层级与具体案例分工明确。

---

## 8. 横向对照

| 系统 | 权威位置 | 层级 | 隔离单位 | 写入 | 检索 | 生命周期 |
| --- | --- | --- | --- | --- | --- | --- |
| AgentCore Memory | 服务端 | Memory → namespace → record；actor/session | namespace + 账号 | 自动抽取 + 异步 consolidate | 语义 | strategy 决定保留与合并 |
| Azure Foundry Memory | 服务端 | store → scope → item（记忆按种类分：profile / summary / procedural） | scope（默认 = user） | 抽取 + LLM 合并 + 显式 forget | 语义 | store 默认 TTL；100 scope × 1 万条 |
| Google Memory Bank | 服务端 | reasoningEngine → scope{app_name, user_id} → memory | scope（二元键） | 异步 generate（可关；空闲 60s 触发） | 语义 | `revision_ttl` |
| 百炼记忆库 | 服务端 | 业务空间 → library → project → user（`project_ids` 可跨项目检索） | 域名 + API key；user_id 强隔离 | 同步抽取（返回 ADD/UPDATE/DELETE） | 语义 + Rerank | 未见 TTL |
| Mem0 Platform | 服务端 | org → project → user/agent/run（前两级可选） | API key（=project） | 服务端抽取 + 去重（v3 ADD-only） | 语义 + 图 | `decay` 只影响排序 |
| Zep | 服务端 | Context Lake → graph（user graph / shared graph）→ thread | account → project + PBAC | 抽取 + 事实失效 | 图 + 语义 | 事实带失效时间 |
| Cognee | 自托管/云 | tenant → role → user 授权，**物理边界是 dataset** | dataset | 抽取管线 | 图 + 向量 | — |
| LangGraph Store | 库/平台 | **namespace tuple，任意深度**，前缀检索 | 前缀 | 应用自己写 | 前缀 + backend 决定 | — |
| Supermemory | 云/单二进制 | namespace 是**单层字符串**（可用 `:` 自造，系统不解析） | API key（可限 namespace 子集） | 应用自己写 | 语义 | — |
| MemoryOS | 本地 | 短/中/长期 | 无（单用户） | 规则搬运（FIFO / heat / 分页） | 检索 + 生成 | 容量 + 热度驱动 |
| GitLab | 服务端 | group → subgroup（≤20，建议 ≤5）→ project | 成员继承 + 角色 + 到期 | 人 | — | 到期时间 |
| **本仓 0.7** | **客户端文件** | **global → domain → project（+祖先链）** | **Hub 根 + 写锁** | **人审（唯一）** | **词法 + BM25-lite** | **时效字段只降权** |

---

## 9. 对我们意味着什么：三条可选路线

### 路线 A：同步中继（服务端只搬运，不裁决）

- **形态**：Hub 目录做成 Git 仓库（或对象存储快照），各机器 clone；服务端不解析知识，只做传输与备份。
- **三级管理**：用仓库/目录分层（组织仓 → 团队仓 → 项目仓）+ 只读快照；可见性靠"能 clone 到哪一层"。
- **保住的**：文件即真相、离线、git 审计、零强制依赖、格式不变。
- **代价**：冲突必须在文件粒度上显式解决（知识文件小、冲突面窄，这是我们的优势）；没有强制 ACL；派生索引每台机器各自重建。
- **量级**：1–2 周可做出可用版（`memory_export` / `memory_import` + 冲突报告），不碰核心存储。

### 路线 B：单写者 Hub 服务（服务端持有权威）

- **形态**：headless DSH 或独立 daemon 持有 Hub 根；客户端通过 HTTP / MCP 调 `search` / `propose`；审批在服务端由项目 owner 完成。
- **三级管理**：组织 Hub → 项目 Hub → 个人作用域，正好映射现有的 `core_workspaces` + `workspaces[].core_id` 祖先链；权限按层授予（读/提案/审批）。
- **保住的**：文件格式、审计账本、人审写入（只是审批人换了角色）。
- **破坏的**：离线只读、"我的记忆在我的磁盘"、单写者锁语义（要换成服务端并发控制 + 租约）。
- **代价**：鉴权、备份、升级、租户隔离——一次真正的服务化，1–2 个月量级。

### 路线 C：托管记忆服务（学 Mem0 / 云厂商）

- **形态**：服务端数据库 + 向量检索，自动抽取；客户端极薄。
- **得到**：多租户开箱、语义检索、运维省心。
- **失去**：文件即真相、人审写入的默认、零依赖、可迁移性——也就是 v0.7 长文里那三条卖点全部作废。
- **定位**：只作为**对照与评测基准**，不作为主线。

### 三级管理的最小可行形状（A 和 B 都适用）

不管服务端怎么部署，层级本身建议**按作用域分，而不是按时间分**（单机没有稳定的在线热度信号，时间分层不划算）：

```text
L1  inbox/            会话草稿，自由写、不参与检索、可整目录丢弃
L2  project/<id>/     项目记忆，人审后入，确定性检索的主战场
L3  org/              组织规范，只读、二次审批、带版本号
```

晋升规则（全部确定性、离线可算）：

1. **容量/时间**：L1 超过 N 条或 T 天 → 生成**待审提案**，不自动摘要写入。
2. **热度**：同一 L2 条目被 `memory_cite` ≥ k 次 → 面板提示"可晋升 L3"（引用数据我们本来就有）。
3. **闸门**：跨层写入一律人工 approve，比 MemGPT 的"模型自决换页"保守。
4. **降级**：L3 90 天未被 cite → 标 `stale`，只改状态，不物理删除。

映射到现有实现：L2 ≈ `project:<id>`，L3 ≈ `domain:<id>` 或 `global`（差异是"谁能写、要不要二次审批"）；**真正新增的只有 L1 草稿层**与"引用计数驱动的晋升提示"。证据映射：淘汰不删除 ← MemGPT；heat 归零防抖 ← MemoryOS；人审 + 留原稿 ← GitLab；词法检索够用 ← ReFind。

### 建议顺序

**A →（按需）B，C 只用来对标。**

理由：A 解决"多机 + 三级目录"的 80% 需求，且不改变硬规则；B 只在真正出现"多人同时写、且需要强制隔离"时才有必要；C 会让我们变成另一个 Mem0，没有存在意义。

如果做 B，前提是写清楚三件事：① 服务端是权威还是缓存；② 审批角色模型（owner / reviewer / proposer）；③ 客户端离线时读什么、写什么。

另外两条从调研中直接得出的工程约束：

- **服务端 key 绑到 Hub 根**（不是绑到个人），Hub 根就是物理隔离边界（对齐 Cognee 的 dataset 思路）；层级用**路径前缀**表达，不写死三层枚举（对齐 AgentCore 的 namespace 与 LangGraph Store 的 tuple）。
- **服务端只做锁、索引、转发**，文件仍是唯一可恢复副本；任何"后台合并 / 后台改结论"的能力都不做（§5.4）。

### 结论更新（2026-11-12）：项目组场景落在 B′

用户的实际场景是"项目组内部复用，组内再分小组与个人，要实时"，且"不介意部署服务器，但 local 模式不能丢"。这正好是 **B 的改良版（B′）**：

- **服务器只承载上两级**：`global`（项目组）与 `domain`（小组）由服务器持有；`project`（个人）仍以本地为权威。
- **不发明新作用域**：沿用现有 `global / domain / project`，只补"成员、角色、权威位置"三件事。
- **服务器只做锁、事件、转发、索引**，不做后台改写；实时靠 SSE 推"变更指针"。
- 仍需独立设计的是：**离线时团队作用域只读 + outbox 重放**、**审批人不能是提案人**、**事件流 seq 空洞检测**。

设计见 [proposal-team-memory.md](../03-openspec/proposal-team-memory.md)。A（纯 git 中继）降级为 M1 之前的过渡手段，C 仍只作对标。

---

## 10. 明确不做 / 待验证

**不做**

- 不做"服务端自动写入"：任何部署形态下，模型都不能自批。
- 不把向量库设为必需：可以是可关闭的增强。
- 不承诺文件原生下的"强制访问控制"：同步出去的数据等于已授权（§7.1）。
- 不做实时多主复制：冲突要显式，不要悄悄合并。

**待验证**

1. DSH 是否支持远程/多用户连接（MCP 或远端工具），以及鉴权语义——决定路线 B 是否可行。
2. 知识文件在 git 合并下的真实冲突率（一条一文件 + frontmatter，估计很低，需要实测）。
3. 服务端审批的角色模型：谁有权批 `decision`/`constraint`，是否需要按作用域分级授权。
4. 跨机派生索引一致性：`index.sqlite` 能否作为派生物随 Hub 分发，还是必须本机重建。
5. 未取到一手资料的空白：Google Memory Bank 的默认 TTL / 配额 / 价格（文档站不可达，只引了 Google 自有仓库）；Memobase、OpenMemory 的层级表达；飞书知识库 / Confluence 的页面权限继承（官方页正文未取到）。这些**不进入结论**，只作待补项。
6. **TencentDB Agent Memory 的实时能力**未见 SSE/WebSocket 一手证据（"实时"靠每轮请求现拉 + `/health` 轮询），若要走"借船"路线需实测其端到端延迟。

---

## 11. 同类开源：可自托管的团队记忆层

### 11.1 TencentDB Agent Memory（MIT，腾讯 2026-05 开源）

**形态**（[一手 README](https://github.com/TencentCloud/TencentDB-Agent-Memory)）：Node ≥ 22.16 的 npm 包，可作为 OpenClaw 插件或 Hermes 的 memory provider；自带 HTTP Gateway（默认 `:8420`），本地默认 **SQLite + sqlite-vec**，云端可切 TCVDB（腾讯云向量库）。MIT 协议。

**它的"两层"**：短期**符号化记忆**（把工具日志压成 Mermaid 画布 + 引用，官方称 token 降 61.38%、通过率相对 +51.52%）；长期**语义金字塔** L0 对话 → L1 原子 → L2 场景 → L3 人格（PersonaMem 48%→76%）。

**Team Memory（2026-08 发布，[二手：官方通稿](https://www.ithome.com/0/986/971.htm)）**：把长期记忆从个人扩到团队，概念是 `Team → Agent → Task`，资产分四类：**Chat Memory / LLM-Wiki / CodeGraph / Skill**；配一个 **Memory Hub 控制台**做生成、审核、授权、分享、装配；每条记忆有 **owner / 版本 / 状态 / 使用记录**；权限按**用户、角色、Agent** 设置；共享范围分档：**个人私有 → 团队 → 指定用户或 Agent**。

**关键判断（一手核对后，分两个发布形态看）**：

- **`main` 分支的 Gateway** 是 Hermes 的单租户 sidecar，只有 7 个路由（`/health`、`/recall`、`/capture`、`/search/memories`、`/search/conversations`、`/session/end`、`/seed`），鉴权是**单个共享 `Bearer` key**，**没有 ACL、没有 SSE**（[一手：`src/gateway/server.ts`](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/src/gateway/server.ts)）。
- **v2.0.1-beta 的发行形态**是四件套：`memory-core(:8420)` + `memory-hub 面板(:8125)` + `knowledge(:8424)` + `proxy(:8096)`，一键容器起；HTTP `/v3/*` 用 **`Bearer` + `x-tdai-service-id` 当租户头**，Knowledge 侧 28 个端点按 service_id 隔离；数据落 `~/.memory-tencentdb/memory-tdai`（[一手：MemoryCore README](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/v2.0.1-beta.2/MemoryCore/README_CN.md)）。

所以"团队三级"在腾讯这里**已经存在，但形态是服务端 + LLM 自动抽取**，不是"文件 + 人审"。对我们更关键的一条：它的 INSTALL 里**已有「通过 Proxy 使用 DeepSeek Harness」章节**——把 `llm-deepseek.baseURL` 指到 `/dsh/<spaceId>`，每轮由 Proxy 现拉 L2/L3 + Skill 注入上下文（[一手：INSTALL_CN](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/v2.0.1-beta.2/INSTALL_CN.md)）。这既是可抄的接入样板，也是**一条会直接替代我们的现成路径**，必须先评估再决定自建。

**可借鉴**：

- 控制台的信息架构（owner / version / status / visibility / 使用次数 + Agent 绑定）——正好补我们"知识老化与归属"的空缺；
- 共享范围三档（`private` / `team` / `restricted`+ACL / `agent`）——比"三级目录"更贴近真实权限诉求；
- 轻鉴权：`Bearer` + 租户头（本地关、服务器强制）；
- 存储分层：底层入 DB 做全文/向量检索，L2 场景 / `persona.md` / Mermaid 画布本身是 Markdown，且带 `result_ref` 可回溯源文。

**不宜照搬**：L1–L3 的"编辑修正"仍在它的 roadmap（v2.0.1-beta 面板只能看/删），与"人审才入"冲突；它的 Team 是**单层**，没有"项目组 → 小组 → 个人"的嵌套与逐级审批；自己管 `~/.memory-tencentdb`，不会把我们 workspace 的 `.md` 当真相。

### 11.2 其他可自托管选项（一句话结论：没有一个同时满足四项）

| 项目 | 许可证 | 部署 | 层级 | 实时 | 与我们的关系 |
| --- | --- | --- | --- | --- | --- |
| TencentDB Agent Memory | MIT | 4 容器（core/hub/knowledge/proxy） | Team → Agent → Task + 资产 visibility | 无推送（每轮现拉） | 最值得抄模型，但换数据模型 |
| Mem0 OSS | Apache-2.0 | Docker server + dashboard | 只有 user/agent/run 扁平 scope；**OSS 无 org/project** | 无 | 撑不起三级 |
| Cognee | Apache-2.0 | 自托管 | tenant > user + role + dataset ACL；**一次只在一个 tenant 内** | 无 | 物理隔离强，但不能三层同时可见 |
| Memobase | Apache-2.0 | Docker（Postgres+Redis） | project → user profile/event | 无（异步 flush） | 无团队层 |
| Letta App Server | Apache-2.0 | `letta server` | agent 为中心；Teams 属 Cloud | **有 `/ws` 单连接多客户端订阅** | 唯一有真实时协议的，但无组织层 |
| MemU | Apache-2.0 | sidecar（SQLite 或 Postgres+pgvector） | 无租户/团队 | 无 | 单机个人向 |
| Basic Memory | **AGPL-3.0** | 本地 | 项目即目录（Markdown+SQLite 双向写） | 无 | 最贴近文件原生；团队共享只在商业 Cloud，AGPL 有传染风险 |

**结论**：不存在"文件即真相 + 人审写入 + 三级复用 + 实时"四件齐备的开源项目。要这四条同时成立，只能自建薄服务。

### 11.3 自建薄服务时，抄什么、不抄什么

**可抄**：

1. 资产元数据四件套 `owner / version / status / visibility`（腾讯）+ 使用次数，用于"知识老化与归属"。
2. 共享语义：`private` / `team` / `restricted`（ACL）——比"三级目录"更贴近真实诉求。
3. 轻鉴权：`Bearer` + 租户/作用域头（`x-tdai-service-id` 的形态）。
4. "查询前先定作用域"（Cognee）→ 改成 **scope 叠加**而不是切换租户（三级要同时可见）。
5. 订阅式推送（Letta `/ws` 的形态）→ 换 **SSE + `Last-Event-ID` 重放**，只推"文件变更指针"，不推正文。

**不可抄**：把 SQLite/向量库当真相（我们只存索引、事件、ACL，正文回文件）；Mem0 的 user/agent/run 扁平 scope（缺 group）；Cognee 一租户一目录（三级要同时可见）；腾讯的 LLM 全自动抽取入库（我们只出人审建议）。

---

## 12. 参考资料

一手：

- [TencentDB Agent Memory — README](https://github.com/TencentCloud/TencentDB-Agent-Memory) / [Gateway 源码](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/src/gateway/server.ts) / [v2.0.1-beta MemoryCore](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/v2.0.1-beta.2/MemoryCore/README_CN.md) / [INSTALL_CN（含 DSH Proxy 接入）](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/v2.0.1-beta.2/INSTALL_CN.md) / [Team Memory 通稿（二手）](https://www.ithome.com/0/986/971.htm)
- [Mem0 — Platform vs OSS](https://docs.mem0.ai/platform/platform-vs-oss) / [OSS 自托管](https://docs.mem0.ai/open-source/setup)
- [Cognee — 多用户与 tenant](https://docs.cognee.ai/core-concepts/multi-user-mode/permissions-system/tenants) / [Memobase 自托管](https://github.com/memodb-io/memobase/blob/main/src/server/readme.md)
- [Letta — App Server（/ws）](https://docs.letta.com/self-hosting/app-server) / [MemU](https://github.com/NevaMind-AI/memU) / [Basic Memory](https://github.com/basicmachines-co/basic-memory)
- [AWS — Add memory to your AgentCore agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html)
- [AWS — Memory types](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-types.html)
- [AWS — Memory terminology](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-terminology.html)
- [Azure AI Foundry — Memory in Agent Service (preview)](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/what-is-memory)
- [Mem0 — Organizations & Projects](https://docs.mem0.ai/api-reference/organizations-projects)
- [Zep — Key concepts (unified context)](https://help.getzep.com/concepts)
- [GitLab — Members of a project](https://docs.gitlab.com/user/project/members/) / [Subgroups](https://docs.gitlab.com/user/group/subgroups/)
- [Notion — Grant access to teamspaces](https://www.notion.com/help/guides/grant-access-teamspaces)
- [MemoryOS — arXiv:2506.06326](https://arxiv.org/abs/2506.06326) / [MemGPT — arXiv:2310.08560](https://arxiv.org/abs/2310.08560) / [A-MEM — arXiv:2502.12110](https://arxiv.org/abs/2502.12110)
- [MemU](https://github.com/NevaMind-AI/memU) / [memary](https://github.com/kingjulio8238/Memary) / [GraphRAG](https://microsoft.github.io/graphrag/index/overview/) / [HippoRAG — arXiv:2405.14831](https://arxiv.org/abs/2405.14831)
- [MemoryAgentBench — arXiv:2507.05257](https://arxiv.org/abs/2507.05257) / [ReFind — arXiv:2608.12888](https://arxiv.org/abs/2608.12888)

仓库内延伸：

- [memory-landscape-2026.md](memory-landscape-2026.md) — 2026 记忆管理业界对照（含 Mem0/Zep/Letta 的机制细节、评测基准、OpenClaw 与 Hermes）
- [hermes-memory-2026.md](hermes-memory-2026.md) — Hermes 的三层分工拆解
- [../03-openspec/proposal-dual-role-workspace.md](../03-openspec/proposal-dual-role-workspace.md) — 金字塔作用域的现有实现
- [../01-architecture/storage-contract.md](../01-architecture/storage-contract.md) — 目录、格式与兼容契约
