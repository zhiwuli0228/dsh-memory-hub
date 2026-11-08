# 2026 记忆管理与萃取：业界对照与我们的下一步

> 调研时间：2026-11-08。目的：给 dsh-memory-hub 的下一阶段定方向，不是做产品评测。
> 可信度标注：**[一手]** = 官方文档/研究页/仓库源码；**[厂商]** = 厂商博客或帮助中心（自述，未经独立验证）；**[媒体]** = 第三方报道或解读；**[社区]** = 个人博客/帖子。

## 0. 一句话结论

行业已经从「把对话切块塞进向量库」走到**「写什么」比「怎么检索」更难**：OpenAI、Anthropic、OpenClaw 都在 2026 年把重心放在**离线巩固（dreaming / consolidation）**与**写入时的取舍**上；阿里给的是**可配置的抽取规则 + 可审计的记忆事件**。我们的文件原生 + 人工审批路线并不落后，落后的是**写入侧的自动化程度、去重/时效治理、以及可度量的评估**。

## 1. 先把「记忆」拆成四条流水线

看任何一家怎么做，都建议按这四段拆，否则容易把「存」和「取」混为一谈：

| 阶段 | 要回答的问题 | 典型手段 |
| --- | --- | --- |
| 捕获 capture | 哪些原始材料进来 | 会话日志、文件、连接的应用、人工显式「记住」 |
| 萃取/巩固 consolidate | 从原始材料里提炼什么、何时提炼 | 抽取 LLM、规则模板、离线 dreaming、人工审批 |
| 组织 representation | 提炼物长什么样 | 条目列表、用户画像、Markdown 文件、wiki/图谱、分层（core/daily） |
| 检索 recall | 什么时候把什么塞回上下文 | 词法、向量、混合 + 重排、分层晋升、按需深召回 |

治理（provenance/audit/forget）不是第五段，而是横切这四段的约束。

两篇 2025 综述给了更细的分类，可以用来对照我们自己的设计：[A Survey on the Memory Mechanism of LLM-based Agents](https://arxiv.org/abs/2404.13501) 按**来源**（本 trial 内 / 跨 trial / 外部知识）、**形态**（文本 vs 参数）、**操作**（写 / 管理 / 读）拆解；[From Human Memory to AI Memory](https://arxiv.org/abs/2504.15965) 用「对象 × 形态 × 时长」八象限，把工作记忆、情景记忆、语义记忆、程序记忆对应到工程实现。我们的九类知识本质上都在「非参数 × 长期 × 系统」这个象限里，缺的是**情景记忆**（会话级事件）与**程序记忆**（怎么做事的流程）的明确位置——`process` 和 `playbooks` 有了，但没有「事件」。

## 2. OpenAI ChatGPT：从「记笔记」到「后台做梦」

### 2.1 三代演进

| 时间 | 形态 | 写入方式 |
| --- | --- | --- |
| 2024-04 | saved memories（显式清单） | 用户说「记住…」或模型判断后写入 |
| 2025-04 | Dreaming v1 = reference chat history | 后台进程翻阅历史对话，生成记忆状态 **[媒体]** |
| 2026-06 | Dreaming V3（默认地基） | 单一异步后台过程，跨多段对话合成；记忆随事实变旧自动改写 **[媒体]** |

V3 的公开卖点是三条指标：事实召回 82.8%、偏好遵循 71.3%、以及**时间感知**——「你 7 月要去新加坡」在行程结束后会自动变成「你 2026 年 7 月去过新加坡」，从而不再推荐新加坡凌晨的外卖。OpenAI 同时称把 dreaming 的算力降了约 5 倍，才敢向免费用户开放。这些数字来自 OpenAI 博客的转述，**未见独立复现** **[媒体]**。

### 2.2 官方文档确认的机制（这部分可信度高）

- 记忆的**来源**不止对话：过去的聊天、保存的记忆、自定义指令、Library/Space 里的文件、连接的应用（如 Gmail）都能进入个性化上下文 **[厂商]**。
- 不是每轮都检索历史：「ChatGPT 只在可能改善回答时才去找相关上下文」 **[厂商]**。
- 回答下方会出现**来源（Sources）**卡片，可打开来源、修正/删除保存的记忆、删除被引用的聊天、标记「相关/不相关」 **[厂商]**。
- **记忆摘要**是「大致展示」，并不等于全部记忆；提供整体摘要与逐条清单两套视图（improved memory vs legacy saved memories），后者支持搜索、排序、版本历史 **[厂商]**。
- 删除是**多源**的：删摘要条目、删保存的记忆、删原始聊天、删文件、断开应用，各管一段；删除操作日志最长保留 30 天 **[厂商]**。
- 作用域：临时聊天不创建/更新记忆；锁定聊天可读旧记忆但新消息不进入记忆；受监管工作区可启用**项目专属记忆**（项目内外互不可见） **[厂商]**。
- 记忆的注入仍然是**系统提示注入**（append 到 system prompt），这一点被安全研究反复观察到 **[社区/媒体]**；「独立存储层」的说法未被可靠来源证实，引用需谨慎。
- 社区拆解（**[社区]，未验证**）：系统提示里带约 40 条最近会话（时间戳 + 标题 + 用户消息，各截断约 100 token），而真正「关于你」的可能只是系统提示里的一段摘要；检索拥挤大约在 12 条附近出现。这类数字只能当假设，不能当事实。

### 2.3 值得抄的三件事

1. **记忆摘要页**：让用户能一眼看到「你到底记住了我什么」，并提供纠正入口。我们面板的「知识」页已经有了雏形，但缺少「模型视角摘要」。
2. **来源卡片 + 相关性反馈**：每条被使用的记忆都能回溯，并允许人标注有用/无用。这正好对应我们的 `memory_cite` 账本，但账本目前只给模型看，没给人看。
3. **时间感知**：记忆不是静态事实，而是「在某段时间为真」。这是当前我们最明显的缺口之一。

## 3. Anthropic Claude：把「做梦」做成一套可度量的工程

来源：[The components of agent memory](https://www.anthropic.com/research/components-of-agent-memory)（2026-11，**[一手]**）。

### 3.0 先分清两套记忆

Anthropic 有两条互不相同的线，讨论时容易混：

- **消费者版 Claude（claude.ai）**：claude.ai 已有跨对话记忆，但形态是「**按话题存的条目（topics）**」+「**对历史对话的搜索（chat search）**」，两者是分开的：搜索是显式 RAG 工具调用，记忆条目则是聊天中自动保存、可在 Manage → Topics 里逐条编辑/删除。默认不保存健康、政治、宗教等敏感话题（需显式开启），证件号/犯罪记录/金融账号/移民身份永不保存。可按项目隔离（"Use account memory" 关闭），支持暂停 vs 重置、单次对话关闭、隐身模式，以及实验性的记忆导入/导出。组织级开关有审计日志，但**成员个人的记忆编辑不记录** [Chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)（**[厂商]**）。
- **Agent 版 Claude（Claude Code / Managed Agents）**：才是下面这套文件 + 记忆目录 + dreaming 的工程。Claude Code 的记忆是 `CLAUDE.md` 的**分层加载**（managed policy → `~/.claude/CLAUDE.md` → `./CLAUDE.md` → `CLAUDE.local.md`，**拼接而非覆盖**，根→cwd 排序，子目录按需加载，`@path` 最多 4 跳），外加 `~/.claude/projects/<project>/memory/MEMORY.md` 索引（每次只注入前 200 行/25KB）+ 按需读取的 topic 文件（类型 `user`/`feedback`/`project`/`reference`，带 `modified` 时间戳，机器本地、不进 transcript 保留、子代理不继承）[How Claude remembers your project](https://code.claude.com/docs/en/memory)（**[厂商]**）。

这个区分对我们很重要：**dsh-memory-hub 对标的是后者**（Agent 记忆），不是聊天助手的话题记忆。但前者的「话题条目 + 审阅面板」形态，恰好是我们面板可以借鉴的交互。

### 3.1 四层记忆层级

```text
injected context   ← 每个会话预加载（小、必须可信）
memory representations（wiki/主题页）
memory notes       ← 会话中写的笔记
transcripts        ← 可检索的原始事件日志（地基）
```

dreaming 是离线过程，箭头可以从 transcripts 一路修正/生成到最上层，也可以在同层之间双向整理。关键点：**上层必须小**，否则每个会话都被噪声税；Claude Code 的 auto memory 只注入 `MEMORY.md` 的**前 200 行或 25KB**，把它当索引而不是正文 **[一手]**。

### 3.2 公开实验与数字（都可复核）

| 实验 | 结论 | 数字 |
| --- | --- | --- |
| CL-Bench 数据库任务 | 有记忆目录 vs 无状态 | Opus 5.5 0.655→0.838；Opus 5 0.564→0.828；Sonnet 5 0.306→0.610；Sonnet 4.6 0.330→0.364 |
| 固定「只记失败」规则 | 反而削弱收益 | Opus 5 −0.234，Opus 4.7 −0.150 |
| 提示「先读记忆再回答」 | 老模型收益翻倍 | Sonnet 4.6 0.364→0.641（配合「验证理论」） |
| 宝可梦 1 万步 | 记忆质量 > 记忆数量 | Sonnet 3.7 写了 413 个文件/225 目录，1 徽章；Fable 5 只写 9 个文件 + `global.md`，4 徽章 |
| 企业文档 wiki | 多轮 dreaming 积累表征 | 35 万文件/4.2 亿 token；2 轮→128 轮，25 题得分 13%→48%；**wiki+搜索** 54%→61%，每题省约 2 万 token；只用搜索 53% |
| Harvey LAB 法律简报 | wiki 对多文档整合有效 | 多文档题 87% vs 73%（仅搜索）；单文档题无差异 |
| 失败案例 | wiki 会过度生长 | 某任务 wiki 体积达到原文 1.77 倍，「抽象了个寂寞」 |

### 3.3 五个可直接借用的结论

1. **写规则不如给判断空间**：硬编码「只记失败」会让强模型变差。我们给模型的应是**判据 + 反例**，而不是窄指令。
2. **dreaming 的第一价值是纠错**：Claude 把「月见山已通过」写错，靠对照原始 transcript 才发现。我们的「夜间维护」目前只做确定性扫描，没有「对照账本/历史纠错」。
3. **表征（wiki）要配搜索**：单独 wiki 不如 wiki+搜索；但 wiki 对多跳整合有独特价值。
4. **晋升到注入层必须克制**：注入层是预算，不是仓库。
5. **开放的工程问题**：何时写（在线 vs 离线）、更新节奏（按访问频率决定复核频率）、维护成本。这三条同样是我们接下来的真问题。

顺带：[Claude 的 dreaming 官方 cookbook](https://platform.claude.com/cookbook/managed-agents-cma-dreaming-with-a-dynamic-workflow) 给的是「影子进程 + 触发阈值 + 遗忘术」的动态工作流范式。

## 4. 阿里 Qwen：平台化「记忆库」与 APP 侧「长记忆」

### 4.1 百炼 / 千问 AI 平台的记忆库（**[一手]**）

产品化的长期记忆 API，抽象很干净：

- **两种记忆内容**：事实记忆（自动抽取的事件/信息片段）+ 用户画像（按模板抽取的结构化属性，如年龄/职业/爱好）[概念](https://platform.qianwenai.com/docs/agent-infra/memory/getting-started/concepts)。
- **记忆规则**：每个库最多 50 条事实规则 + 50 条画像规则，可配「自动更新」「过期时间 7/30/180 天/永不过期」「抽取策略 Pro（带 Rerank）/Lite」，并有预置的默认规则（默认 180 天）[配置规则](https://platform.qianwenai.com/docs/agent-infra/memory/guide/configure-rules)。
- **检索可调**：相似度阈值建议 0.5–0.7、意图判别召回、查询改写、排序、最大召回数，都能在控制台调试 [FAQ](https://platform.qianwenai.com/docs/agent-infra/memory/reference/faq)。
- **隔离维度**是「记忆实体」（通常 `user_id`），一个记忆库可被多个应用共享。
- **观测与审计**：变更事件分「新增/更新/软删除/恢复/删除」，带触发原因（抽取 vs 用户操作）、耗时、以及**变更前后快照**，可按记忆 ID 追溯 [审计](https://help.aliyun.com/zh/model-studio/memory/audit)。
- 计费按 Add/Search 调用（Pro ¥0.03/次，Lite ¥0.018/次），2026-08-20 起商业化。

这套设计与我们的模型高度同构：规则≈我们的类型与作用域，过期≈我们缺的字段，软删除≈我们的 `deprecated`，审计快照≈我们 `history/` + 账本。差别在于它是**托管服务**，我们必须在本地文件上做出等价能力。

### 4.2 千问 APP 的「长记忆」底座（**[厂商]/[媒体]**）

千问 APP 与夸克的长记忆跑在 **PolarDB-X Mem0** 上：

- 记忆不只是向量：支持**频率、情绪、主体等多维记忆管理**，语义与结构化数据在同一节点完成「相似度过滤 + 结构化过滤」，避免向量库 + 关系库两套架构。
- 规模：百亿级记忆，25 万 RPS 写入，P99 延迟降低 90%，成本降低 30–50%，GDN 跨地域双活。
- 产品形态是「Mem0 兼容 API（语义记忆）+ MySQL 协议（结构化业务数据）」双通道，官方还提供了让 OpenClaw 一条指令接入的 playbook。

对我们的启示不是「上分布式数据库」，而是两点：**(a) 记忆天然是多维的**（时间、频率、情绪/重要性、主体），只按文本相似度检索会丢信息；**(b) 语义与结构化元数据必须能一起过滤**（例如「只在这个项目、最近 30 天、关于发布流程」）。

## 5. 开源记忆层与评测基准：把「感觉」变成数字

### 5.1 Mem0

论文：[Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413)（arXiv:2504.19413，**[一手]**）。

- **写入**：先用小模型从最近 m=10 条消息 + 滚动摘要中抽候选事实，再取 top-10 相似记忆一起交给 LLM，用**工具调用**决定 **ADD / UPDATE / DELETE / NOOP**；UPDATE 只在「更具体」时发生。
- **存储**：向量库（元数据走 SQL），可选 Neo4j 图（带类型的实体 + 带标签的三元组）。
- **检索**：向量相似度；图变体加实体子图遍历与三元组向量匹配。
- **版本差异很关键**：v2 会硬删除被推翻的事实；2026 的 v3 改成 **ADD-only**（「不覆盖、不删除」），图成为内置常开。
- **数字（厂商自评，LOCOMO，LLM-as-judge）**：Mem0 单跳/多跳/开放域/时序 67.1 / 51.2 / 72.9 / 55.5，加图 65.7 / 47.2 / 75.7 / 58.1。平台版宣称 LoCoMo 91.6、LongMemEval 93.4（top-200 检索预算，约 6.9k token/查询，含非开源的专有优化）。
- **注意**：论文自己的对照表里，**full-context 的 judge 分（72.9）其实高于 Mem0（66.9）**——Mem0 卖的是「接近的效果、1/15 的 token、1/12 的 p95」。它相对 OpenAI 记忆基线的 +26% 是另一个 baseline，别混用。
- **局限**：没有有效区间；ADD-only 让「知识更新」成为弱项，记忆无界增长；评测脚手架由厂商自己维护。

### 5.2 Zep / Graphiti

论文：[Zep: A Temporal Knowledge Graph Architecture for Agent Memory](https://arxiv.org/abs/2501.13956)（arXiv:2501.13956，**[一手]**）；开源实现 [Graphiti](https://github.com/getzep/graphiti)。

- **三层**：原始 episode（保留来源）、实体 + 事实边、社区摘要。
- **双时间**：每条边有 `t_valid`/`t_invalid`（事件何时为真）与 `t'_created`/`t'_expired`（系统何时知道），因此能回答「截至 T 是什么」。写入时做矛盾检查：新边与相关旧边比较，若冲突就把旧边 `t_invalid` 置为新边 `t_valid`——**旧边不删除**。
- **检索**：cosine + BM25 + BFS 扩展，再 RRF/MMR/mention-count/节点距离/交叉编码器重排；输出带日期区间的事实。
- **数字（厂商预印本）**：DMR 94.8 vs MemGPT 93.4；LongMemEval 71.2 vs 60.2（gpt-4o），且只用 1.6k vs 115k token、2.58s vs 28.9s。
- **局限**：没有跑 LOCOMO；有竞品复跑把 Zep 排在中间（61.7 / 41.4 / 76.6 / 49.3）；写入路径最重；Graphiti 是框架（自带 Neo4j/FalkorDB）。
- **启示**：**时序不是加个 `updated_at`**，要能表达「有效区间」与「被谁取代」。这正是我们 `supersedes` + 时效字段应该长成的样子。

### 5.3 Letta / MemGPT

- **三层**：main context（提示 + 可编辑工作区 + FIFO 队列）、recall（可搜索历史）、archival（向量库）。
- **memory block** 是 `label / description / value / 字符上限` 的结构，以 XML 形式常驻上下文，模型用 `memory_insert` / `memory_replace` / `memory_rethink` 自己改；可共享，整值 last-write-wins。这比自由文本可控得多——**我们完全可以把「一类知识」映射成一个有上限的 block**。
- **archival 只支持 insert/search**，条目约 300 token，模型不容易改/删——这是「防自我污染」的保守设计。
- **sleep-time compute**（arXiv:2504.13171）：离线先想，等查询到来时更省算力（同精度约 1/5 测试时算力），现在产品化为 dreaming 子代理 + git 版本化的 MemFS。
- **证据**：DMR 93.4 vs 递归摘要 35.3，但 Zep 复跑里 full-context 也有 94.4——说明「分层记忆」的收益高度依赖 baseline 选择。

### 5.4 其他值得知道的

- **MemOS**（arXiv:2505.22101）：把记忆当可调度的 OS 资源（参数化/激活/明文），统一为 **MemCube** = payload + 元数据（权限、TTL、优先级、敏感度、审计；访问频率、相关性、血缘），用 `MemScheduler` / `MemLifecycle` / `MemOperator` 管理。**只有架构论文，没有 benchmark 表**，尚无公开证据说它赢过「追加 + 检索」。
- **A-MEM**（arXiv:2502.12110，NeurIPS 2025）：Zettelkasten 式笔记，写入时自动建链接并演化邻居属性；作者报告优于六个基座，但第三方复跑把它排在当时那组的最后（39.8 / 18.9 / 54.1 / 49.9）。
- **LangMem**：库而非服务，语义/情景/程序三类记忆，热路径工具 + 后台反思；开放域最好、时序最差（23.4）。
- **Cognee**：`remember`/`recall`/`improve`/`forget` 的图 + 向量管线，自报 BEAM 0.79@100K、0.67@10M。

### 5.5 怎么读这些数字

1. **多数系统卖的是成本，不是准确率**。在 Mem0 自己的 LOCOMO 表里，full-context 的分数更高。任何「提升 X%」都要问：baseline 是谁、检索预算多少、token 花多少。
2. **检索预算主导分数**。平台版在 top-200（约 6.9k token/查询）时数字漂亮；到 10M token 规模（BEAM）同类系统掉到 0.48–0.67。
3. **更新语义是产品决策**：硬删除（Mem0 v2）／只追加（v3）／双时间失效（Zep）。只有「失效」能回答「截至 T 是什么」，且在不加侧表的情况下保留审计。
4. **写入成本是隐形税**：每轮抽取、每 episode 的实体+边+时间抽取、或离线巩固，三者代价完全不同；同步写必然拖慢每一轮。
5. **厂商数字不可迁移**：同一系统在自己 DMR 上 94.8，在竞品 LOCOMO 上中游。要评判，就用自己 50–100 条真实轨迹自建评测，固定 judge 与检索预算。

### 5.6 评测基准到底在测什么

| 基准 | 测什么 | 头号发现 | 对我们的含义 |
| --- | --- | --- | --- |
| [LongMemEval](https://arxiv.org/abs/2410.10813)（ICLR 2025，500 题） | 信息抽取、多会话推理、时序推理、知识更新、拒答 | 长上下文模型掉 **30–60%**；97 题人工测试里「离线读全文 + GPT-4o」91.8%，而某商业助手的记忆功能只有 57.7%；把设计拆成 indexing/retrieval/reading 后，**写侧的粒度**（按轮 vs 按会话）与 fact-augmented key（+9.4% recall@k）、时间感知查询扩展（时序题 +6.8–11.3%）贡献最大；Chain-of-Note 式阅读**即使检索全对**还能再加约 10 分 | 我们的预检只覆盖 indexing+retrieval 的一小段，**reading 阶段（怎么把命中读成答案）完全没有设计**；写入粒度也应该更细 |
| [LoCoMo](https://aclanthology.org/2024.acl-long.747/)（ACL 2024） | 单跳/多跳/时序/对抗 QA、事件摘要、多模态生成 | 50 段超长对话，平均 600 轮/16K token、跨 32 个会话；长上下文与 RAG 提升 22–66%，但仍比人类低 56%（时序低 73%）；对抗题上长上下文反而比基座差 83% | 需要「拒答/核对」路径；observation 粒度（按说话人断言）比原始 transcript 更好用 |
| [MemoryAgentBench](https://arxiv.org/abs/2507.05257)（ICLR 2026） | 精确检索、测试时学习、长程理解、冲突消解 | 没有方法四项全赢；多跳冲突消解最弱（最好约 28%）；上下文从 6K 涨到 32K，GPT-4o 反而 28%→10% | 「更新/取代」要独立于「检索」设计；纯追加必败 |
| [PrefEval](https://arxiv.org/abs/2502.09597)（ICLR 2025） | 偏好推断、保持、遵循 | 零样本下约 10 轮（≈3K token）偏好遵循就掉到 **10% 以下**；提示、RAG、迭代反馈都缓解有限 | 偏好类知识应放在**每轮必注入的小档案**，而不是靠检索碰运气 |
| HorizonBench（arXiv:2604.17283，经 OpenClaw 文档转引） | 用户改偏好后是否还用旧值 | 系统经常选中**已被改掉的旧偏好** | 没有 supersede 链就一定会踩 |

一句话：**benchmark 正在从「检索准不准」转向「更新/时序/拒答对不对」**，这正是我们最薄的地方。

## 6. OpenClaw：把「文件原生」做到极致的对照组

OpenClaw 是与我们最接近的形态：纯 Markdown 文件 + 一个可重建索引，无隐藏状态。它的文档把很多我们正在纠结的问题直接写成了设计原则，**值得逐条对照**。

### 6.1 分层（[memory-architecture](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/memory-architecture.md)，**[一手]**）

| 层 | 载体 | 谁写 | 何时进上下文 |
| --- | --- | --- | --- |
| 指令 | `AGENTS.md` 等 | 仅人类 | 每会话开始，必进 |
| 精炼核心 | `MEMORY.md`、`USER.md` | dreaming 巩固 + 用户直接要求 | 每会话开始，有预算、要过 provenance |
| 情景 | `memory/YYYY-MM-DD.md`、会话 transcript | Agent 工作中、压缩前 flush | 按需检索，不预加载 |
| 前瞻 | standing intents（SQLite）、cron | `intent` 工具、定时任务 | 仅触发时 |

五条设计原则里，有三条几乎可以直接贴到我们的设计文档上：

1. **没有隐藏状态**：模型只记得写进文件的东西，每个字节都能用文本编辑器查看和修改。
2. **难的是写，不是取**：长程评测反复显示「写了什么」比「怎么索引」更决定效果（引用 LongMemEval, arXiv:2410.10813）；所以把整理移出回复主路径，交给后台过程。
3. **失败不能阻塞回复**：记忆链路上每一步都要有超时或降级。
4. 补充两条：**写入路径就是安全边界**（在写入时做 provenance，而不是事后检测毒化）；**固定规则做边界，模型判断在边界内**。

### 6.2 Dreaming（[dreaming](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/dreaming.md)，**[一手]**）

- 分 light / deep / REM 三个阶段；**长期晋升只写 `MEMORY.md`**。
- 每次晋升的条目携带回忆元数据：最多 3 个触发短语 + 1–10 的重要性。
- 机器状态在 SQLite（recall store、阶段信号、检查点、锁），人类可读输出在 `DREAMS.md` 与分阶段报告；改写前保存 preimage。
- 有明确的拒绝原因统计，但不把被拒内容复制进报告——**报告不泄漏噪声**。

### 6.3 检索（[memory-search](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/memory-search.md)、[memory-builtin](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/memory-builtin.md)）

- SQLite FTS5（BM25）+ 向量 + 混合；按相关性、**新鲜度、写入时重要性**排序；默认开 MMR 去冗余；CJK 用 trigram 分词。
- 超时降级：语义检索超时但关键词命中已就绪时，返回**部分结果 + 警告**，而不是整体失败。
- 向量查询放在**独立只读进程**（sqlite-vec），慢查询不阻塞网关事件循环。

### 6.4 深召回升级（[active-memory](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/active-memory.md)）

默认 `escalate` 模式：只有当消息**在问过去**、且规则检索没有强命中时，才起一个阻塞的 recall 子代理去深挖。理由写得很直白：扁平检索在直接事实匹配上强，在**时序与跨会话**问题上弱（LongMemEval）。这正是「两级召回」的工程化。

### 6.5 用户模型与时效（[user-model](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/user-model.md)）

- 每条偏好是**指令式**（Always/Never/Prefer）+ `observed: 日期` + `status: active|superseded`。
- 偏好改变时**原地 supersede**，不追加第二条矛盾指令。
- 引用了两个反面证据：PrefEval（arXiv:2502.09597）发现长对话中偏好遵循显著衰减；HorizonBench（arXiv:2604.17283）发现系统常选用**已被用户改掉的旧偏好**。
- `USER.md` 硬上限 4000 字符，超了就往 `MEMORY.md` 和 daily 下沉。

### 6.6 来源与删除（[memory-provenance](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/memory-provenance.md)）

- 三类记录：chunk provenance（索引块，分类代码写入）、entry origins（条目来自哪个会话）、curated-write records（哪个文件被谁改）。
- `memory forget --session` 先在 dry-run 里给出可删除清单，再执行；文档明确列出「删不掉什么」（原始 transcript、自由编辑、外部副本）。
- 写入侧准入（admission policy）与删除是两件事。

### 6.7 Hermes Agent：有界常驻 + 全文档案 + 单活 provider

Nous Research 的 Hermes Agent 是「预算派」的代表：`MEMORY.md`（2.2k 字符）+ `USER.md`（1.4k 字符）**硬上限、会话开始冻结注入**；所有会话进 SQLite FTS5，靠 `session_search` 按需取原文（零 LLM 成本）；外部 memory provider（Honcho / Limbic / OpenViking / Mem0）**单活**接入。超限时写入不是丢，而是返回「当前条目 + 精确缺口」逼模型同回合批量整理。

它是本项目最像的对照组：同样是「小注入 + 大档案」，同样有后台复盘与审批开关，但把「常驻」和「档案」拆成了两种存储，并给 provider 定了固定钩子。完整拆解与可落地建议见 [hermes-memory-2026.md](hermes-memory-2026.md)。

## 7. 横向对照

| 维度 | ChatGPT | Claude | Qwen 记忆库 | OpenClaw | dsh-memory-hub（现状） |
| --- | --- | --- | --- | --- | --- |
| 权威存储 | 未公开（系统提示注入） | 消费者版：话题条目 + 聊天检索索引；Agent 版：文件 + 记忆目录 + wiki | 托管 DB（语义+结构化） | Markdown + SQLite 索引 | Markdown/YAML/JSONL |
| 谁决定写什么 | 模型 + 后台 dreaming | 自动存话题 + 模型判断显著性 + dreaming | 用户配置的抽取规则 + 模型 | 模型 + dreaming，人类可改 | 模型 propose，人审批 |
| 萃取时机 | 离线为主 | 在线笔记 + 离线 dreaming | 调用时抽取（Add） | 在线 + 压缩前 flush + 离线 | 任务收尾 + 夜间确定性扫描 + 定时蒸馏 + 定时回顾 |
| 组织形态 | 摘要 + 条目清单 | topics / notes / wiki / 注入层 | 事实条目 + 结构化画像 | 分层文件 + daily + intents | 九类知识 + 金字塔作用域 + merge 合并 |
| 检索 | 未公开，按需 | 聊天搜索（显式 RAG）+ wiki 导航 | 语义 + 重排 + 改写 + 意图判别 | BM25+向量+MMR+时效 | CJK 分词 + BM25-lite + 门控 + 金字塔回退 |
| 时效 | V3 自动改写时态 | dreaming 纠错 | 7/30/180/永不 过期 | 重要性 + 新鲜度 + supersede | 时效字段 + 派生降权 + supersede（V0.7） |
| 治理/审计 | 摘要页、来源卡、30 天日志 | 话题可编辑；组织级开关有日志、个人编辑无审计 | 观测 + 审计快照 | provenance + forget | 账本 + history/ + 面板审核 |

Gemini 未进表：Google 支持页在本机不可达，只确认存在「保存的信息」与「参考过去的对话」两个开关，以及媒体关于 Personal Intelligence（Gmail/Search/YouTube/Photos）的报道 **[媒体]**，机制未验证。

开源层补两个心智坐标：**Mem0 = 写时增删改 + 向量**；**Zep = 双时间知识图**。两者都不要求「文件即真相」，但它们的**写入决策**与**有效区间**设计可以原样搬到文件模型里。**Letta 的 block** 则给了「有上限、可编辑的段落」这一中间形态——比自由文件强约束，比数据库弱耦合。

## 8. 行业已经收敛的共识

1. **写 > 取**。四家都在写入侧投入：抽取规则、离线巩固、重要性标注、provenance。
2. **分层 + 预算**。注入层必须小（200 行/25KB/4k 字符），细节下沉，按需检索。
3. **离线巩固是标配**。OpenAI dreaming、Anthropic dreaming、OpenClaw dreaming、阿里「记忆观测/审计」都在做「事后整理」；区别只是自动程度。
4. **检索是混合的，且要能降级**。纯向量和纯词法都不够；超时要返回部分结果而不是报错。
5. **时效是一等公民**。过期时间、supersede、observed 日期、时态改写，本质都是「记忆会变旧」。
6. **治理必须可核对**。谁写的、从哪来、改了什么、怎么删，都要有记录。

## 9. 反面教材（比正面经验更值钱）

| 失败模式 | 证据 | 对我们的含义 |
| --- | --- | --- |
| 记忆越多越差 | Claude 宝可梦 413 文件只拿 1 徽章 | 候选积压必须治理，不能只加不减 |
| 规则越细越差 | 「只记失败」让 Opus 5 收益 −0.234 | 别把 `memory_propose` 写成 checklist |
| 表征过度生长 | wiki 比原文长 1.77 倍 | 若做主题页，必须有体积上限 |
| 记忆反噬 | Sonnet 3.7 花 17 步整理记忆、游戏一步没走 | 整理成本要算进预算，离线做 |
| 删不干净 | 删聊天 ≠ 删记忆；删除日志留 30 天 | 我们的「删除」语义要写清楚边界 |
| 旧偏好劫持 | HorizonBench：系统选了被改掉的旧偏好 | 没有 supersede 链就会犯这个错 |
| 记忆投毒 | AgentPoison：<0.1% 毒化率即可 >80% 攻击成功率；MINJA 可仅靠查询写入恶意记忆 | 「先写后审」不够，写入时的 provenance 与来源隔离是必需的 |
| 记忆泄漏 | MEXTRA：200 条存储查询中恢复 50 条，完整抽取率 83% | 记忆里不该放密钥；跨作用域检索必须严格 |
| 上下文一长反而更差 | MemoryAgentBench：6K→32K，GPT-4o 28%→10% | 不要把「更大上下文」当成记忆方案 |

## 10. 我们现在的真实瓶颈（对照后重排）

按「影响 × 可做性」排序，而不是按功能清单：

1. **写入侧太薄**。现在只有「模型主动 propose + 夜间确定性扫描 + 定时蒸馏」。缺的是**会话级的回顾式萃取**：从 transcript 里找出「被验证过的坑/决策」，而不是等模型自觉。
2. **没有去重与合并**。同一结论容易换壳重复；缺相似度检测、合并候选、supersede 建议。
3. **没有时效模型**。没有 `valid_from/valid_to/last_verified`，老条目和现行条目同权参与检索；这直接对上 HorizonBench 的失败模式。
4. **检索是单级的**。只有词法 + 门控；没有「强命中就走、弱命中才深挖」的两级召回，也没有 MMR 去冗余。时序问题（「上次发布是怎么做的」）尤其弱。
5. **没有评估**。80 个测试保证行为，但没有一条指标回答「记忆有没有让回答更好」。这是最大的战略性缺口——四家都在用 CL-Bench/LongMemEval 类的数字说话。
6. **缺「情景层」**。九类知识全是语义/程序性知识，没有「这次会话发生了什么」的事件层。Claude 的 transcript + notes、OpenClaw 的 daily notes、Qwen 的事实记忆都在做这件事；我们只有账本，而账本是给流程用的，不是给回忆用的。

## 11. 下一步路线（建议）

原则：**不破硬规则**——文件仍是唯一权威、不引入强制数据库、不联网、模型不能自批。所有新增能力要么是派生物，要么仍需人审批。

### P0（下一版，1–2 周量级）

**P0-1 回顾式萃取（Retrospective extraction）**

- 复用现有定时蒸馏通道，增加一种任务：读**最近 N 天的会话 transcript / 账本**，抽取「已验证的决策、踩过的坑、被纠正的假设」，生成候选（`memory_propose`，仍进 `pending/`）。
- 与现有蒸馏的区别：蒸馏是**跨作用域晋升**，回顾式萃取是**同作用域补漏**。
- 数据源：优先用 `~/.dsh/sessions/` 下的会话记录，或现有账本里的活动记录；具体接口先做宿主能力核查（见 §13）。
- 边界：只读 transcript、只写候选、每轮上限 5 条、附 `source_refs: session:<id>#a-b`。
- 验收：连续 7 天，候选被人工批准率 ≥ 40%；重复候选率 < 20%。
- 依据：LongMemEval 显示写侧失败（漏记、覆盖关键信息）发生在检索之前；按轮粒度存储优于按会话。

**P0-2 去重与合并**

- 写入/维护时做本地相似度检测（现有 CJK 分词 + 标题/摘要重叠 + 类型与作用域相同），命中则产出「合并建议」而非直接写入：展示旧条目、新条目、建议的 supersede 关系。
- 面板「待审批」增加合并视图（旧→新 diff）。
- 验收：对现有 Hub 跑一次，报告重复率；合并建议接受率 ≥ 50%。

**P0-3 时效字段**

- 给知识条目加可选 `valid_from` / `last_verified` / `expires_at`（不改文件名，YAML front matter 或正文首行注释均可，按现有格式选一种）。
- 检索排序加入「新鲜度」与「过期降权」；过期不删除，标 `stale` 并在面板显示。
- 维护任务按「访问频率」决定复核优先级（呼应 Anthropic 的 cadence 问题）。
- 验收：Golden set 中「已过期事实」的误用率下降 ≥ 50%。

### P1（1–2 个月）

**P1-0 情景层（会话日志）**

- 新增一个非知识、可丢弃的层：`journal/<date>/<session>.md`，记录「本次会话做了什么、改了什么、哪里卡住」，由收尾时模型写或由账本自动生成。
- 它不参与默认检索注入，只在回顾式萃取与 `memory_search` 显式请求时读取；超期自动归档（对应 OpenClaw 的 daily notes / Claude 的 transcript）。
- 验收：回顾式萃取的候选来源中，≥ 50% 指向 journal 而非原始 transcript；注入 token 不增加。

**P1-1 两级召回 + 阅读阶段**

- 第一级保持现在的词法 + 门控（快、确定）；第二级「深召回」只在两类信号触发：消息含时序词（之前/上次/当时/为什么）、或一级命中分数低于阈值。
- 深召回可以是模型读候选摘要后重排，或按需 `memory_search` 扩展；必须有超时与降级（返回一级结果 + 提示）。
- **补 reading 阶段**：命中后不是直接丢正文，而是按 LongMemEval 的结论做结构化阅读（先给「结论 + 适用条件 + 反例」，再给正文链接），并要求模型回答前核对时间。
- 索引侧可先做两个低成本改进：**key 扩展**（标题 + 摘要 + 别名 + 关键实体一起进倒排）与**时间感知查询扩展**（把「上次/之前」映射到时间过滤）。
- 验收：时序类问题的召回命中率提升；p95 延迟增加 ≤ 300ms。

**P1-2 主题页（派生的「wiki」）**

- 在 `reports/` 或单独的 `views/` 下生成**派生物**（不进 `knowledge/`，可随时重建）：按作用域聚合的主题索引，带链接与「最后核对时间」。
- 硬上限：单页 ≤ 8KB，总量 ≤ 知识正文的 50%；超限即裁剪（避免 1.77 倍事故）。
- 验收：对多跳问题（「A 和 B 的取舍是什么」）的回答引用率提升。

**P1-3 评估基线**

- 建一个 30–50 题的内部 golden set（真实项目问题 + 期望引用的知识 id），跑「有记忆/无记忆」对照，记录：命中率、引用率、答案正确率、token 成本。
- 复用现有测试框架，输出可复现的 Markdown 报告；作为每次发版的回归项。
- 验收：能回答「这一版比上一版记忆更好吗」，并给出数字。

### P2（观察）

- 可选向量检索（默认关闭，作为派生索引，不破坏文件原生）。
- 用户模型层（`USER.md` 式偏好）：与项目知识分离，注意 PrefEval/HorizonBench 的坑。
- standing intents（事件触发的未来动作）：与现有定时蒸馏的关系需要先厘清。
- 跨设备同步（先做导入/导出，不做服务端）。

## 12. 明确不做

- 不引入**强制**向量库或托管记忆服务（违反本地优先与依赖策略）。
- 不让模型自动 commit；不因为「行业都自动化」就放弃人工审批。
- 不做无上限的「全量记忆注入」；注入层永远只放紧凑索引。
- 不在没有审计的情况下自动改写正文（合并/纠错都必须留历史）。

## 13. 待验证的问题

1. 回顾式萃取的 transcript 从哪来？DSH 是否暴露会话历史读取接口，还是只能读 `~/.dsh/sessions/`？需要一次宿主能力核查。
2. 时效字段放 front matter 还是正文 YAML 块？需要与 `KNOWLEDGE-FORMAT.md` 的解析器一起定。
3. 合并建议的相似度阈值在中文语料上的合理区间？需要先在现有 Hub 上测。
4. 内部 golden set 的题目从哪来？可以从账本里被引用最多的 20 条知识反推。
5. Gemini 的 personal context 只确认到「保存的信息」与「参考过去的对话」两个开关（Google 支持页本次抓取 403，未纳入正文）；若要对比，需要另找可访问的一手页面。

## 14. 参考资料

一手：

- [Anthropic — The components of agent memory](https://www.anthropic.com/research/components-of-agent-memory)
- [OpenClaw — Memory architecture](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/memory-architecture.md) / [Dreaming](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/dreaming.md) / [Memory search](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/memory-search.md) / [Active memory](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/active-memory.md) / [User model](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/user-model.md) / [Provenance](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/memory-provenance.md) / [Compaction](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/compaction.md)
- Qwen： [核心概念](https://platform.qianwenai.com/docs/agent-infra/memory/getting-started/concepts) / [配置记忆规则](https://platform.qianwenai.com/docs/agent-infra/memory/guide/configure-rules) / [常见问题](https://platform.qianwenai.com/docs/agent-infra/memory/reference/faq) / [记忆审计](https://help.aliyun.com/zh/model-studio/memory/audit)
- [PolarDB-X Mem0：千问 APP 背后的记忆引擎](https://www.modb.pro/db/2043932872369860608)
- Hermes Agent 官方文档：[Persistent Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory) / [Memory Providers](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers) / [Honcho](https://hermes-agent.nousresearch.com/docs/user-guide/features/honcho) / [Memory Provider Plugins](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin) / [Curator](https://hermes-agent.nousresearch.com/docs/user-guide/features/curator)（拆解见 [hermes-memory-2026.md](hermes-memory-2026.md)）

厂商/媒体：

- [ChatGPT 记忆帮助中心（日文镜像）](https://help.openai.com/ja-jp/articles/8590148-memory-in-chatgpt)
- [Claude — Chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)
- [Claude Code — How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Mem0 v2→v3 迁移（ADD-only、内置图）](https://docs.mem0.ai/migration/platform-v2-to-v3)
- [Graphiti 仓库](https://github.com/getzep/graphiti)
- [Letta memory blocks](https://docs.letta.com/v1-sdk/memory/memory-blocks)
- [新智元：ChatGPT 记忆大升级（Dreaming V3）](https://m.163.com/dy/article/KUQE6HCO0511ABV6.html)
- [新智元：Claude 学会做梦](https://m.163.com/dy/article/LB4IJBNR0511ABV6.html)
- [Hacker News：ChatGPT Dreaming 讨论](https://news.ycombinator.com/item?id=48400616)
- [ChatGPT Dreaming V3 第三方审计笔记（社区）](https://raw.githubusercontent.com/LH8PPL/core-memory-kit/refs/heads/main/docs/research/2026-07-21-chatgpt-dreaming-audit-trail.md)

论文：

- LongMemEval — arXiv:2410.10813（ICLR 2025）
- LoCoMo — [ACL 2024](https://aclanthology.org/2024.acl-long.747/)
- MemoryAgentBench — arXiv:2507.05257
- PrefEval — arXiv:2502.09597
- HorizonBench — arXiv:2604.17283
- Sleep-time compute — arXiv:2504.13171
- Mem0 — arXiv:2504.19413；Zep — arXiv:2501.13956；Letta/MemGPT — arXiv:2310.08560；MemOS — arXiv:2505.22101；A-MEM — arXiv:2502.12110
- 记忆机制综述 — arXiv:2404.13501；人类记忆到 AI 记忆 — arXiv:2504.15965
- 记忆投毒 — AgentPoison arXiv:2407.12784；MINJA arXiv:2503.03704；记忆泄漏 MEXTRA arXiv:2502.13172
- Lost in the Middle — arXiv:2307.03172
