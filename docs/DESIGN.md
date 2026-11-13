# DSH Memory Hub — V0.1 设计

| 项 | 值 |
| --- | --- |
| 状态 | V0.1.5（已发布）：V0.1.2 多 Hub、V0.1.4 夜间维护已并入；Desktop 宿主冒烟通过，视觉待人工确认 |
| 日期 | 2026-11-01 |
| 适用宿主 | DeepSeek Harness Desktop Runtime `0.2.1-rc.5`（Node 24.x） |
| 许可证 | MIT |
| 配套文档 | [知识文件格式](KNOWLEDGE-FORMAT.md) · [宿主验证记录](COMPATIBILITY.md) · [维护执行模型](01-architecture/maintenance.md) · [项目 README](../README.md) |

本文是 `dsh-memory-hub` 的唯一权威设计。它回答四件事：**记什么、怎么查、什么时候信、怎么不闯祸**。实现位于 `src/` 与 `client.js`，构建产物为 `dist/index.js`；验证状态见 [COMPATIBILITY.md](COMPATIBILITY.md)。

> V0.1.1 在 V0.1.0 之上增加 Web 面板（能力总览、知识浏览、待审批、活动与策略）。V0.3.0 起面板「待审批」提供人工点击的批准/拒绝（账本 `approvalRef` 记为 `panel:human`，受 `policy.panel.review` 控制），V0.4.0 起支持勾选批量（单次最多 50 条）；模型仍不能自批，原生 DSH 审批在会话内继续可用。

`E:\009workspace\dsh\dsh-memory-hub\docs` 下的参考设计包与 `code\dsh-memory-evolve` 只作为需求与风险清单使用。本文不复刻参考代码的模块、UI、技能系统或同步机制；与参考材料的取舍见 [§18](#18-与参考材料的关系)。

**阅读路径**：产品与范围 §1–2；概念与架构 §3–4；宿主契约 §5；数据、一致性与检索 §6–8；任务、工具、审批、汇总 §9–12；安全、性能、测试、路线图 §13–18。

---

## 0. 摘要

DSH Memory Hub 是一个**本地优先、文件即真相、人类批准写入**的 DSH 插件。它把项目里值得留下的结论（决策、约束、接口、流程、未决问题……）存成用户可读、可编辑、可备份的 Markdown；在每个用户回合开始时做一次确定性检索，把**紧凑索引**注入模型上下文；任务结束时要求一次回写评估，候选知识经**DSH 原生审批**后才成为权威知识。

五个关键决定：

1. **每个 core 一个 Hub，Hub 内多个作用域**（`global` / `domain` / `project`）；V0.1 的单 Hub 设计已被 V0.1.2 multi-hub 取代，见 [proposal-multi-hub](03-openspec/proposal-multi-hub.md)。
2. **Markdown 是权威数据**，`JSONL` 是审计与任务账本，内存索引是可重建的派生物；V0.1 不用 SQLite。
3. **任务 = 一个用户回合**，预检在回合第一步执行一次，幂等键 `(sessionId, turn)`。
4. **自动注入只给紧凑索引**（ID、标题、一句话结论、作用域），细节按需 `memory_get`。
5. **权威写入必须经过 DSH 审批**，模型的参数里没有可伪造的"批准令牌"。

---

## 1. 定位

### 1.1 要解决的问题

- **会话失忆**：换会话、隔天继续、切换工作区后，此前的约定和结论需要用户复述。
- **知识散落**：决策落在聊天记录、代码注释和人的脑子里，没有稳定 ID、版本和来源。
- **模型自称"查过了"**：只靠系统提示词约束，无法证明预检真的发生过。
- **上下文预算有限**：把全部历史或全部记忆塞进上下文，既贵又稀释注意力。
- **不可审查**：自动总结写进记忆后，没人知道它从哪来、是否仍然成立。

### 1.2 产品承诺

| 承诺 | 含义 |
| --- | --- |
| 用户掌控 | 记忆是用户目录下的普通文件；可读、可改、可 git、可备份；卸载插件不删数据 |
| 先查再执行 | 每个用户回合自动预检并留痕；受管写操作可按策略要求有效预检 |
| 证据优先 | 权威知识带来源、版本、适用范围；未验证内容只能停在候选 |
| 克制写入 | 模型提出候选，人批准才生效；没有新知识时允许明确记 `no_new_knowledge` |
| 零热路径模型调用 | 检索、注入、门禁全部是确定性本地逻辑，不额外调用 LLM |
| 可卸载 | 不修改 DSH 核心，不写 profile 内部状态；禁用后宿主照常启动 |

### 1.3 设计原则

- **原生优先**：使用 DSH 公开的 Cordis 插件、工具、事件、提示词上下文与审批服务，不 Fork、不私有补丁。
- **文件即真相**：任何数据库都只是索引；删掉索引可以完全重建。
- **失败不吞消息**：预检失败也不能阻止用户输入进入模型；只能以 `unavailable` 记录并降级。
- **工作区隔离**：项目知识默认只在当前工作区可见；晋升到 global 必须新建候选并人工批准。
- **轻量先行**：没有向量库、图数据库、Embedding、后台定时巩固，也没有 V0.1 的 Web UI。
- **Windows 原生**：路径真实化、大小写不敏感比较、原子替换、句柄释放都按 Windows 语义设计。

---

## 2. 范围

### 2.1 V0.1 必须交付

| 编号 | 能力 | 可验收的定义 |
| --- | --- | --- |
| F01 | 单 Hub + N 个工作区（V0.1 基线；V0.1.2 已升级为每 core 一个 Hub） | 一个根目录；至少 3 个 workspace；作用域隔离可测 |
| F02 | 九类知识 | decision / knowledge / api-catalog / process / open-questions / constraint / runtime-base / playbooks / assets |
| F03 | 检索与读取 | 关键词 + 类型 + 作用域 + 状态过滤；返回 ID、版本、来源路径、片段 |
| F04 | 回合预检 | 每个用户回合第一步有持久 `preflight` 记录；无命中记 `no_match` 并放行 |
| F05 | 上下文注入 | 注入紧凑索引，预算可配；不注入正文，不额外调用模型 |
| F06 | 引用 | 区分"检索命中"与"实际使用"；引用带 ID、版本、用途 |
| F07 | 候选与提交 | 候选写 pending；权威写入必须经 DSH 人工审批；模型不能自批 |
| F08 | 关闭评估 | 每个关闭的任务都有评估；允许 `no_new_knowledge`；异常结束记 `deferred` |
| F09 | 汇总 | 管理员手动把项目已接受知识晋升为 global 候选；幂等、不覆盖下游 |
| F10 | 状态与诊断 | `memory_status` 报告版本、根目录、索引、策略、降级原因 |
| F11 | 可安装/卸载 | Desktop 插件管理器或 CLI 安装；禁用即恢复；卸载保留记忆文件 |
| F12 | 变更工具门禁 | 无有效预检的变更工具按策略拒绝；豁免、未知工具与降级可配 |

参考设计包的 F01–F08 均有对应：F01→F01、F02→F02、F03→F03、F04→F04+F12、F05→F06、F06→F07、F07→F08、F08→F09。

### 2.2 明确不做（V0.1）

| 不做 | 原因 |
| --- | --- |
| 复杂审批/编辑型 WebUI | 批准以人工点击面板或会话内 DSH 审批完成；面板不提供批量编辑/重写知识 |
| 向量检索 / Embedding / 图数据库 | 项目知识量级小，确定性检索足够；引入外部服务与隐私成本 |
| 自动扫描历史会话 | 会话里有大量噪声与秘密；需要显式授权和独立设计 |
| 后台定时巩固 / 自动总结 | 无人值守的写入无法保证质量与批准；先做手动 |
| 多端云同步 / 双向同步 | 冲突合并成本高；V0.1 只保证单机单写者 |
| 多 Agent 自动调度 / 技能管理 | 与记忆核心无关，参考实现的这部分不进入本设计 |
| 删除工具 | 破坏性操作只允许用户直接改文件；模型只能提议 `deprecate` |

### 2.3 典型场景

1. **接手旧项目**：新会话第一回合预检命中既有决策与约束，模型先读再改。
2. **跨天续作**：昨天的结论以 `DEC-xxxx` 出现在新会话，模型引用而不是重新猜。
3. **架构评审**：任务结束提议一条新决策，用户看到提案标题与摘要后批准，写入全局或项目。
4. **多项目隔离**：`backend` 与 `entity-linking` 各有项目记忆，互不串味；只有显式晋升才进 global。
5. **纠错**：源码证明旧决策失效时，模型提议 `supersede`，批准后旧条目状态变为 `superseded`。

---

## 3. 概念模型

### 3.1 Hub、Workspace、Scope

```text
Hub（一个根目录，一份配置，一把写锁）
├── Scope: global           跨项目通用知识
├── Scope: domain:<name>    领域知识（如 backend / data）
└── Scope: project:<ws-id>  单个工作区的项目知识
        ▲
        │ cwd 解析（最长前缀 + realpath + 大小写归一）
Workspace（逻辑工作区，映射到磁盘上的项目根）
```

- **Hub** 是唯一的存储与配置单元，位于用户目录下（默认 `$DSH_HOME/memory-hub`，否则 `~/.dsh/memory-hub`）。
- **Workspace** 是项目根的注册记录，只用于把会话的当前目录映射为 `project:<id>`；插件**不写入**项目目录。
- **Scope** 是知识条目的归属，不是目录层级；文件按类型分目录，作用域写在 frontmatter 里。

这样做的好处：一份锁、一份索引、一份备份；"汇总"退化为作用域晋升，而不是两个存储之间的合并。

### 3.2 知识单元

一条知识是一个 Markdown 文件，带 YAML frontmatter。字段与正文规范见 [KNOWLEDGE-FORMAT.md](KNOWLEDGE-FORMAT.md)。

| 类型 | 前缀 | 用来记什么 | 例子 |
| --- | --- | --- | --- |
| `decision` | `DEC` | 已做出的选择与理由 | "缓存广播使用版本号而不是时间戳" |
| `constraint` | `CON` | 不可违反的边界 | "渲染进程不得直接访问磁盘" |
| `knowledge` | `KNO` | 已确认的事实/机制 | "构建产物落在 `.dsh/build`" |
| `api-catalog` | `API` | 接口、命令、协议清单 | "`memory_hub.search()` 参数表" |
| `process` | `PRC` | 可复现的流程/步骤 | "发布前必须跑 `pnpm check`" |
| `open-questions` | `OQ` | 未决问题与待验证假设 | "是否需要支持多实例？" |
| `runtime-base` | `RUN` | 环境、版本、部署前提 | "Windows 11 + Node 24" |
| `playbooks` | `PLAY` | 排障/操作手册 | "DSH 起不来时的三步排查" |
| `assets` | `AST` | 外部资产的索引（路径/URL） | "设计稿与截图位置" |

约束：`open-questions` 永远不能被自动提升为事实；它只能被新的证据替换或关闭。

### 3.3 任务 = 一个用户回合

- 一个**用户回合**（turn）是一个任务：用户提出一件事，模型执行、调用工具、收尾。
- 同一回合内的工具续接步骤**不是**新任务，不重复预检。
- 回合内追加的 steering 输入仍属于同一任务；需要重新检索时，显式调用 `memory_preflight`。
- 判断依据来自 `agent/pre-step` 的 `turn` 与 `messages`，不依赖模型自述。

任务键：`(sessionId, turn)`；任务 ID 形如 `TSK-20261101-4f2a9c`。

### 3.4 生命周期总览

```text
用户输入
  │
  ▼
预检（确定性检索）──────────────► 无命中：no_match，继续
  │ 有命中
  ▼
注入紧凑索引（runtime context）
  │
  ▼
模型执行 ──► 工具调用 ──► 门禁检查（有效预检？）
  │                          │ 否 → 拒绝并提示先 memory_preflight
  │                          │ 是 → 放行
  ├──► memory_cite（实际使用）
  ├──► memory_propose（候选写入）
  ▼
回合收尾
  ├── memory_close_task（proposed / no_new_knowledge / needs_evidence / deferred）
  └── 未评估 → 自动记 deferred
  │
  ▼
提交（memory_commit）──► DSH 审批 ──► 批准：写入权威知识
                                  └─ 拒绝/不可用：保持 pending
```

### 3.5 信任边界

| 角色 | 能做什么 | 不能做什么 |
| --- | --- | --- |
| 用户 | 编辑任意文件、批准/拒绝提交、禁用插件 | —— |
| 模型 | 检索、读取、引用、提议、请求提交、关闭任务 | 自批提案、绕过审批、读取不可见作用域、修改配置 |
| DSH Host | 派发事件、执行工具、提供审批 UI、提供当前目录 | 替插件决定知识是否权威 |
| 插件 | 检索、注入、写 pending、在批准后写 accepted、记账 | 修改 DSH 核心、扫描未授权目录、发网络请求 |

---

## 4. 架构

### 4.1 分层

```text
┌──────────────────────── Adapter（DSH 专属）────────────────────────┐
│ lifecycle  agent/created · agent/disposed                          │
│ pre-step   agent/pre-step → 任务识别 · 预检 · 上下文状态            │
│ turn-close agent/turn-stopping → 未评估则 deferred                 │
│ tool-policy tools/pre-execute → 门禁 + 提交审批（ask）              │
│ tools      defineTool 注册 10 个 memory_* 工具                      │
│ workspace  workingDirectory + workspaceRegistry → scope             │
│ context    agent.ctx.systemPrompt.context('memory:pack')            │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ 只调用应用服务
┌──────────────────────────────▼─────────────────────────────────────┐
│ Application：preflight · search · knowledge · proposal · close ·    │
│              consolidate · status                                   │
├────────────────────────────────────────────────────────────────────┤
│ Domain：knowledge（类型/状态/版本）· scope · task · citation ·      │
│         proposal · errors（纯 TypeScript，可离线测试）              │
├────────────────────────────────────────────────────────────────────┤
│ Storage：hub（目录/配置）· markdown-repo · ledger（JSONL）·        │
│          index（倒排）· atomic · lock · tokens                      │
└────────────────────────────────────────────────────────────────────┘
```

依赖方向严格单向：`adapter → application → domain`，`storage → domain`。业务层不 import DSH；替换宿主只改 Adapter。

### 4.2 建议目录

```text
src/
  index.ts                     # Config / inject / apply / effect
  adapter/dsh/
    lifecycle.ts               # agent/created, agent/disposed
    pre-step.ts                # 任务识别 + 预检编排
    turn-close.ts              # agent/turn-stopping
    tool-policy.ts             # 门禁 + 审批 ask
    tool-registry.ts           # defineTool 装配
    workspace.ts               # cwd → workspace → scope
    context-provider.ts        # memory:pack
    approval.ts                # 审批请求封装
  application/
    preflight-service.ts
    search-service.ts
    knowledge-service.ts
    proposal-service.ts
    close-service.ts
    consolidation-service.ts
    status-service.ts
  domain/
    knowledge.ts               # 类型、状态机、版本规则
    scope.ts
    task.ts
    citation.ts
    proposal.ts
    errors.ts                  # 错误码
  storage/
    hub.ts                     # 根目录、config.yaml
    markdown-repo.ts
    ledger.ts
    index.ts
    atomic.ts
    lock.ts
    token-estimator.ts
  config/
    schema.ts                  # zod 校验
    load.ts
  security/
    path-policy.ts
    visibility.ts
  tools/
    definitions.ts             # 仅 schema 与适配，不含业务逻辑
tests/
  unit/  integration/  host-smoke/
```

### 4.3 插件形态

- Cordis 插件：`export const name`、`export const inject`、`export const Config`（schemastery）、`export function apply(ctx, config)`。
- `Config` 只放**引导参数**：`root`（可选）、`logLevel`（可选）。其余策略在 `<root>/config.yaml`，随数据一起备份。
- `inject: ['tools']`；`systemPrompt`、`approval`、`workingDirectory`、`workspaceRegistry` 按可选依赖使用（`ctx.get(...)`），缺失时降级而不是崩溃。
- 所有监听、定时器、watcher、锁都用 `ctx.effect()` 注册，卸载时逆序释放。
- **加载失败绝不拖垮宿主**：配置非法、根目录不可写、锁被占用时，**该根**以只读/降级模式启动，`memory_status` 给出原因；其他根照常工作。

### 4.4 启动顺序

1. 解析根目录（插件 `root` → `$DSH_HOME/memory-hub` → `~/.dsh/memory-hub`）。
2. 读取/创建 `config.yaml`；校验失败 → **该根**只读 + 诊断（其他根不受影响）。
3. 尝试获取本根的写锁（租约 + fencing token）；失败 → **该根**只读（另一个写者或残留锁）。被降级的根会在下一次写操作时自动重试，对方退出后即恢复可写。
4. 打开每个 `core_workspaces[].root`：各自校验配置（共用同一份）、各自抢自己的锁，互不影响。
5. 全量扫描 `knowledge/`、`pending/`，构建倒排索引；解析失败的文件保留诊断、不进入索引。
6. 回放 `records/ledger.jsonl`，恢复打开的任务与最近任务状态；截断半行。
7. 注册工具、事件、上下文提供者；启动 watcher（若启用）。

### 4.5 打包、安装与卸载

- `package.json` 声明 `dsh.manifestVersion: 1`、`dsh.bundle.patch: './cordis.patch.yml'`；不声明 `dsh.client`（无前端）。
- `cordis.patch.yml` 只注册一个 Host 行；`config` 只含 `root`/`logLevel`。不要手工往 Profile 的 `cordis.patch.yml` 追加重复 id。
- 安装：
  - Desktop：由 Electron 管理的 Profile（本机为 `desktop`）通过插件管理器安装，**不要**用 CLI 修改该 Profile；
  - 其他 Profile：`dsh plugin --profile <name> add <本地路径|git|registry 包>`。
- `engines.dsh` 声明已验证的运行时范围；版本不兼容时安装/启用应被拒绝或明确告警。
- 卸载：插件管理器移除后所有工具、监听、watcher、锁随 `ctx.effect` 释放；`<root>` 下的记忆文件保留。
- 插件不写 Profile 的 `package.json` / `cordis.patch.yml`，这些由安装器负责。

---

## 5. 宿主集成（基于 `0.2.1-rc.5` 实测）

本节的事实来自 2026-11-01 对本机 Desktop Runtime 的 `cordis_inspect` 与已安装包 README。**CLI 的 `dsh --version` 报 `0.1.5-rc.1`，与 Desktop Runtime 不是同一版本**；实现只以下表中的运行时契约为准，并对 CLI 版本单独验证。

### 5.1 契约清单

| 能力 | 绑定 | 关键事实 |
| --- | --- | --- |
| 插件入口 | `apply(ctx, config)` | 支持 `inject`、`ctx.effect`；Cordis 自动清理注册 |
| 工具注册 | `ctx.tools.register(defineTool({…}))` | 需要 `name/description/parameters/output.schema/output.render/execute`；参数在派发前校验 |
| 工具门禁 | `tools/pre-execute`（waterfall） | 决策 `allow / deny(reason) / cancel / ask(reason, displayReason)`；`ask` 在无人应答时按拒绝处理 |
| 单调守卫 | `ctx.tools.guard(fn)` | 同步、不可被后续监听推翻；适合"必须存在预检"的最后一道闸 |
| 预检时机 | `agent/pre-step`（waterfall） | `payload: { agent, messages, turn, step, signal }`；返回 `reject` 或 `enter(messages, startsRequestSeries?)` |
| 回合收尾 | `agent/turn-stopping`（serial） | 回合即将关闭时运行；可写账本，不应长时间阻塞 |
| Agent 生命周期 | `agent/created`（serial）/ `agent/disposed`（emit） | `agent.ctx` 是作用域上下文；`agent.session.id === agent.id` |
| 注入 | `agent.ctx.systemPrompt.context({ name, order, text })` | 上下文是"运行时事实"，按步骤刷新；注册在 agent 作用域 |
| 审批 | `ctx.approval.request()` / `ask` 决策 | 需要开放回合；无应答者返回 `unavailable`（失败关闭）；审批理由不含工具参数 |
| 工作区 | `ctx.workingDirectory.get(session)`；`ctx.workspaceRegistry.resolveByPath(path)` | 目录来自可信会话状态，不采信模型自报路径 |
| 会话证据 | `session/event`（emit）；`session.seq` | 只读引用事件序号区间；插件不得追加会话事件 |

### 5.2 事件用途

| 事件 | 我们做什么 | 不做什么 |
| --- | --- | --- |
| `agent/created` | 在 `agent.ctx` 注册 `memory:pack` 上下文提供者；初始化每会话状态 | 不阻塞创建（只做同步注册） |
| `agent/pre-step` | 识别新回合 → 读当前目录 → 预检 → 更新上下文状态；绝不替换用户消息 | 不在工具续接步骤重复建任务；不调用 `reject` 吞消息 |
| `agent/turn-stopping` | 若任务仍打开，记 `task.closed{deferred}`（幂等） | 不伪造模型总结；不做长耗时扫描 |
| `agent/disposed` | 关闭残留任务（deferred），释放会话状态 | 不写其他会话状态 |
| `session/event` | 记录 `tool/call`、`tool/result` 等事件的水位（seq 由 `session.seq` 在提交后推导），供证据区间使用 | 不扫描全量历史；不把事件当任务边界 |
| `tools/pre-execute` | 门禁；`memory_commit` 触发审批 | 不修改工具参数（宿主不允许） |

### 5.3 注入通道

**主方案**：在 `agent/created` 时通过 `agent.ctx.systemPrompt.context({ name: 'memory:pack', order: 130, text: () => state.packText })` 注册一个命名运行时上下文。

- `order: 130` 位于 `working-directory:100`、`sandbox:110`、`approval:115`、`subagent:120`、`team:125` 之后，`harness-source:200` 之前。
- `text` 返回当前任务的紧凑包；没有命中时返回空字符串（宿主会丢弃空上下文）。
- 包内容只包含：命中条数、每条 `ID@版本`、类型、标题、一句话摘要、作用域；正文与文件路径不在包内。
- 目的：保持注入在 600 token 以内；细节由 `memory_get` 按需获取。

**Phase 0 必须验证**（见 §15.2）：同一会话连续回合更新 `text` 时，宿主是"替换同名上下文快照"还是"追加新快照"。

- 若替换：保持主方案。
- 若追加：改为**每任务只注入一次**（在 `agent/pre-step` 的 `enter.messages` 前插入一条 `source.kind='dsh-memory-hub'` 的用户消息），或把包压缩为静态提示 + 工具检索；两种降级都必须在设计记录中留痕。

**不采用**：改写用户消息、`systemPrompt.section`（会改写系统提示并破坏前缀缓存）、`agent.inject()` 每步注入（累积历史）。

### 5.4 审批通道

`memory_commit` 本身是一个工具调用。插件在 `tools/pre-execute` 中拦截它：

1. 读取 `arguments.proposal_id` 指向的 pending 文件；
2. 由文件内容同步生成理由：`提交提案 PRO-000003「缓存广播使用版本号」→ project:backend/DEC-000012 v2`；
3. 返回 `{ kind: 'ask', reason, displayReason: { en, zh } }`。

因此：

- 用户看到的是提案标题与目标，不是模型自由编造的字符串；
- 模型参数里**没有** `approval_token`，无处可伪造；
- 无审批应答者（headless、审批关闭）→ 宿主失败关闭 → 提案保持 pending；
- 审批通过后工具才执行，执行时再次校验提案状态与版本（防 TOCTOU）。

### 5.5 工作区解析

1. `ctx.workingDirectory.get(agent.session)` 取当前会话目录；缺失则用 `ctx.workingDirectory.defaultDirectory`。
2. 规范化：`realpath` 解析符号链接/联接点 → 统一分隔符 → Windows 下大小写折叠 → 去掉尾部分隔符。
3. 在已启用 workspace 中取**最长前缀**匹配（按规范化后的路径段，不做字符串 `startsWith` 误判）。
4. 命中 → `project:<id>` + 其 `domains`；未命中 → 仅 `global`，状态记 `unregistered`，不阻止任务。
5. 任何工具参数中的 `workspace` 只在**可见集合内**选择，不能扩大权限；`memory_get` 同样按条目作用域校验。

### 5.6 明确不依赖

| 不依赖 | 原因 |
| --- | --- |
| `session.append` / 自定义会话事件 | 插件记录仅限 `packages/experimental/`；本插件不满足条件，强行写会破坏会话格式承诺 |
| `ctx.storage` / profile 存储 | 数据应在用户可见、可备份的普通目录，而不是 profile 内部状态 |
| Web Client / Slot | V0.1.0 不依赖；V0.1.1 的面板通过 `sidebar.panellist` + `main` 注册；V0.3.0 起「待审批」支持人工点击批准/拒绝（`panel:human`），V0.4.0 起支持勾选批量，不走 Host 业务回合 |
| MCP server 形态 | 工具在 Host 内注册更直接；MCP 桥接留到需要跨客户端复用时评估 |

---

## 6. 数据与存储

### 6.1 根目录

```text
<root>/
  config.yaml                 # 工作区、策略、版本
  README.md                   # 首次创建时生成的说明
  knowledge/
    decision/ constraint/ knowledge/ api-catalog/ process/
    open-questions/ runtime-base/ playbooks/ assets/
  pending/                    # 候选（PRO-*.md）
  pending/archive/            # 已提交/已拒绝的候选归档
  history/<type>/<ID>@v<N>.md # 每次接受变更前的旧版本
  records/
    ledger.jsonl              # 任务、预检、引用、提交、汇总的追加日志
    sequences.json            # ID 计数器
    .writer.lock              # 该 Hub 根目录的写锁（每根一把）
  index/                      # V0.1 不落盘；预留给 V0.2 索引快照
```

### 6.2 `config.yaml`

```yaml
version: 1
hub:
  id: primary
workspaces:
  - id: backend
    root: 'D:/projects/backend'
    domains: [backend]
    admin: true          # 允许运行汇总
    enabled: true
  - id: entity-linking
    root: 'D:/projects/entity-linking'
    domains: []
    enabled: true
policy:
  preflight:
    mode: per-turn       # per-turn | off
    pack_tokens: 600
    max_hits: 6
    min_score: 1.0       # drop weak matches; 0 keeps every BM25 hit
    local_boost: 1.2     # prefer project:<current-workspace> over core hits
    inject: compact      # compact | off
  gate:
    mode: enforce        # enforce | off
    on_preflight_error: allow   # allow | deny
    unknown_tools: allow        # allow | deny
    mutating_tools: [bash, pwsh, write, edit, str_replace_editor]
    exempt_tools: [memory_search, memory_get, memory_status, memory_preflight,
                   memory_cite, memory_propose, memory_commit,
                   memory_close_task, memory_consolidate, memory_maintenance]
  evidence:
    required_for: [decision, constraint, process, api-catalog, runtime-base, playbooks]
  limits:
    max_pending_per_task: 20
    max_body_bytes: 65536
    max_source_refs: 20
consolidation:
  mode: manual
  target_scope: global
storage:
  watch: true
  lock_stale_ms: 600000
```

约束：

- 未知字段保留但忽略；`version` 不认识时进入只读，不猜测迁移。
- 配置热更新：watcher 触发重新校验；失败保留旧配置并记诊断，不中断会话。
- `workspaces[].root` 必须存在且可读；不存在时该 workspace 标记 `missing`，其项目知识仍可读（文件在 Hub 内），但不匹配新会话。

### 6.3 知识文件

见 [KNOWLEDGE-FORMAT.md](KNOWLEDGE-FORMAT.md)。核心字段：

```yaml
id: DEC-000001
type: decision
scope: project:backend
status: accepted        # candidate | accepted | rejected | superseded | deprecated
version: 3
title: 缓存广播使用版本号
summary: 广播消息携带单调版本号，接收端丢弃过期消息。
source_refs: [session:6f0c1a2b#120-138]
related: [CON-000002]
supersedes: [DEC-000000]
promoted_from: null
created_at: '2026-11-01T09:00:00+08:00'
updated_at: '2026-11-01T10:00:00+08:00'
```

状态机：

```text
candidate ──批准──► accepted ──新决策──► superseded
    │                   │
    └──拒绝──► rejected  └──显式废弃──► deprecated
```

- 只有 `accepted` 参与默认检索；`superseded/deprecated/rejected` 保留可查（显式 `status` 过滤）。
- 任何内容变更都 `version + 1`，旧版本先归档到 `history/`。
- `reviewed` 状态被移除：审批即接受，不再引入第三个中间态。

### 6.4 账本记录

`records/ledger.jsonl` 每行一个事件，末尾 `fsync`。字段 `v`、`type`、`at`、`taskId` 通用。

```json
{"v":1,"type":"task.created","at":"2026-11-01T09:00:00+08:00","taskId":"TSK-20261101-4f2a9c","sessionId":"s-123","turn":4,"workspaceId":"backend","intentHash":"sha256:...","idempotencyKey":"s-123:4"}
{"v":1,"type":"preflight.recorded","at":"...","taskId":"...","preflightId":"PF-...","status":"ready","hits":[{"id":"DEC-000001","version":3}],"tokens":182}
{"v":1,"type":"citation.added","at":"...","taskId":"...","citationId":"CIT-...","knowledgeId":"DEC-000001","version":3,"purpose":"确定缓存失效策略"}
{"v":1,"type":"proposal.created","at":"...","taskId":"...","proposalId":"PRO-000003"}
{"v":1,"type":"proposal.committed","at":"...","proposalId":"PRO-000003","knowledgeId":"DEC-000012","version":2,"approvalRef":"approval:..."}
{"v":1,"type":"task.closed","at":"...","taskId":"...","assessment":{"kind":"no_new_knowledge","reason":"仅修改样式"}}
```

原则：

- 账本**只追加**；当前状态由回放折叠。
- 预检状态是门禁的唯一依据；内存中的 `Map` 只是加速缓存。
- 引用只记录"实际使用"，检索命中另存于预检记录。
- 记录里不写知识正文、不写用户消息原文、不写凭据。

### 6.5 候选

`pending/PRO-000003.md`：

```yaml
id: PRO-000003
status: pending          # pending | committed | rejected | superseded
operation: create        # create | update | deprecate
type: decision
scope: project:backend
title: 缓存广播使用版本号
summary: ...
target: DEC-000012       # update / deprecate 时必填
expected_version: 1      # 乐观并发
source_refs: [...]
created_at: '...'
task_id: TSK-20261101-4f2a9c
```

- 候选正文与正式知识同构，便于直接晋升。
- 提交成功后移入 `pending/archive/` 并写入 `status: committed` 与 `committed_to`。
- 被拒绝的候选保留在归档，用户可改后重新提议。

### 6.6 ID 分配

- 前缀 + 6 位十进制：`DEC-000001`；序列按类型独立。
- `records/sequences.json` 记录各类型最大序号；写锁内"读 → +1 → 原子写"。
- 启动时用磁盘上的最大 ID 与账本校正计数器；发现空洞不回收，避免重用。

### 6.7 格式版本

- `config.yaml` 的 `version` 与知识 frontmatter 的 `format`（可选，默认 1）独立演进。
- 未知版本的条目只读展示，不参与写入；迁移脚本在 V0.2 提供。
- 不允许静默改写用户文件格式。

---

## 7. 一致性

### 7.1 单写者

- 进程内：所有写操作进入一条串行队列，读走不可变快照。
- 跨进程：**每个 Hub 根目录一把锁**（`<root>/records/.writer.lock`），以 `O_EXCL` 创建，内容 `{ v, pid, host, startedAt, heartbeatAt, token }`；每 15s 更新心跳。
- 锁是**租约**：租约 = `heartbeatAt + storage.lock_stale_ms`（默认 600000ms ≈ 40 次心跳；心跳固定 15s，租约更短时缩到租约的 1/4）。持有者崩溃（pid 不存在）立即被回收；心跳超租约（挂死、假死、PID 复用）也会被回收，不再永久卡死。
- 回收走 `rename` + 复核的 CAS：把锁改名到临时文件、重读并比对 `{token, heartbeatAt}`，一致才删除，不一致就还原；两个回收者不会同时赢。
- `token` 是 fencing token：每次写操作前复核锁文件里的 `token`/`pid`；租约被抢走的旧写者降级为只读（`readOnlyReason` 以 `lost the lease` 开头），不会与新写者双写。
- 获取失败：只有**该根**进入只读降级；其他工作区照常写入。检索、读取、`memory_status` 可用；该根的 `memory_propose` / `memory_commit` / `memory_close_task` / `memory_consolidate` 返回 `READ_ONLY`。
- 惰性自愈：写操作入口调用 `Hub.ensureWritable()`，被降级的根在对方退出后**自动重抢**锁并恢复可写，不需要重启插件或手动删锁。
- **缓存标志可失效**：`readOnly` 只是打开时的一次判断。`Hub.revalidateLock()` 同步重读锁文件并在 `memory_status` / `/api/overview` / `/api/config` 以及每 60s 的运行时巡检里修正它；锁文件被删或被回收后不会继续报告只读。
- **“文件消失”≠“被接管”**：锁文件消失时只丢句柄（根空闲，下次写入重建），只有 `token` 变成别人的才降级只读——否则手动删锁反而会把活着的 Hub 锁死。
- 只读降级不级联：配置根锁被占用时，各 core 工作区仍各自竞争自己的锁；只有显式 `readOnly: true` 是全局只读。
- 只读模式下预检仍做检索，但不落账本；门禁按 `on_preflight_error` 处理（默认 `allow`），并记诊断。
- 锁的回收条件是“确定原写者不在写”：`host` 不同（跨机拷贝/漫游配置）、进程不存在、或心跳超过 `lock_stale_ms`。文件 mtime 不参与存活判定（拷贝/同步会刷新 mtime）。
- 正常退出（含 `process.exit`）主动删除仍属于自己的锁；只有硬崩溃才依赖租约兜底。
- 配置写入（`config.yaml`）走原子写，不依赖写锁：锁被占用或配置损坏时，面板的配置表单仍可保存，用于自助修复。
- 诊断：`Hub.lockInfo()` → `{ held, owner, expiresAt, reclaimed, onDisk }`，由 `memory_status` / `/api/overview` / 面板只读提示使用；`onDisk` 是磁盘上锁文件的真实状态，用来区分“文件已消失”和“被别人持有”。

### 7.2 原子写

- 同目录临时文件 `.<name>.<pid>.<rand>.tmp` → 写入 → `fsync` → `rename` 覆盖。
- 目录项 `fsync` 在 Windows 上不可移植，跳过；依靠 `rename` 的原子性。
- Windows 上目标被杀毒软件/索引器占用时 `EPERM/EBUSY`：指数退避重试 5 次（50–800ms），仍失败返回可读错误，不留下半文件。
- 写入前校验路径：规范化后必须位于 `<root>` 内，且不是 symlink/reparse point。

### 7.3 提交流程（知识写入）

```text
1. 校验提案状态、作用域、expected_version、证据
2. 归档旧版本：history/<type>/<ID>@v<old>.md（若存在）
3. 写新版本 knowledge/<type>/<ID>.md（原子替换）
4. 追加账本 proposal.committed（fsync）
5. 更新内存索引与序列号
6. 移动提案到 pending/archive/（原子）
```

- Markdown 是权威；若在第 3 步后、第 4 步前崩溃，启动时对账会补一条 `recovered` 账本记录（不重放用户操作）。
- 若第 4 步后、第 6 步前崩溃，提案仍显示 pending；启动对账根据账本把它归档，避免"幽灵提案"。
- 提交操作是幂等的：同一提案重复提交返回已有结果，不重复递增版本。

### 7.4 崩溃恢复

启动时：

1. 截断账本末尾不完整行（只删除最后一个不完整片段）。
2. 回放账本，恢复未关闭任务、待归档提案。
3. 扫描知识文件，按 `updated_at`/内容哈希与账本对账，补齐 `recovered` 记录。
4. 重建索引；无法解析的文件进入 `diagnostics`，不影响其他条目。

### 7.5 外部编辑与 watcher

- `fs.watch(root, { recursive: true })` 只监听 `knowledge/`、`pending/` 与 `config.yaml`；忽略 `records/`、`history/`、`index/`，避免自写回环。300ms 去抖；变更文件按 mtime + size 增量重解析。
- 用户手工编辑是合法输入：解析成功即生效；解析失败保留旧索引项并报告行号/字段。
- watcher 不可用时（网络盘、权限）：退化为按需全量扫描（`memory_status` 显示 `stale`）。
- 配置变更同一通道热加载；失败不切换。

### 7.6 并发会话

- 预检、引用、关闭都按 `taskId` 隔离；账本追加串行化。
- 同一 `(sessionId, turn)` 的重复预检返回已有记录（`force` 除外）。
- 并行工具调用可能同时 `memory_cite`；引用 ID 独立，账本追加排队。
- 子 Agent（subagent）是独立会话，按自己的 turn 预检；门禁对它同样生效。

### 7.7 备份与恢复

- 备份 = 复制整个 Hub 根目录；恢复 = 放回并重启/重载。
- 恢复后首次启动重建索引；账本与知识文件对账。
- 不提供内置导出；Markdown 即导出格式。

---

## 8. 检索与注入

### 8.1 查询构造

- 预检查询 = 当前回合首个 `source.kind === 'user'` 的用户消息文本（最多 2000 字符）+ 工作区/领域提示词。没有该来源时（子 Agent、注入消息、恢复会话），取消息批次中第一个非空文本块。
- 显式 `memory_search` 使用调用方给的 `query`，可叠加 `types/scope/status/limit`。
- 查询为空或只有停用词 → 直接 `no_match`。

### 8.2 分词

- Unicode NFKC 归一化、转小写。
- ASCII/拉丁文按非字母数字切词；保留 `_`、`-` 作为连接符内的整体。
- CJK 采用**二元组（bigram）+ 单字**：`缓存广播` → `缓存`、`存广`、`广播`，单字作为补充召回。
- 停用词表内置中英文常见词（`的`、`了`、`the`、`a`…），可通过配置扩展。

### 8.3 打分

在内存倒排索引上做 BM25-lite：

```text
score = 3.0 * match(title)
      + 2.0 * match(tags)
      + 1.5 * match(summary)
      + 1.0 * match(body)
      + 0.3 * recencyBoost(updated_at, 180d)
      + typeBoost(type)
```

- `typeBoost`：constraint 1.20 > decision 1.15 > runtime-base 1.10 > api-catalog 1.05 > process 1.05 > knowledge 1.00 > playbooks 0.95 > open-questions 0.85 > assets 0.8。
- 标题精确短语命中额外 +25%；查询词全覆盖额外 +10%。
- 同分按 `updated_at` 降序、`id` 升序，保证可复现。

### 8.4 过滤与可见性

默认：`status = accepted`，`scope ∈ {global, domain(s) of workspace, project:workspace}`，`enabled` 工作区可参与。

- 显式 `status` 可查历史状态（`superseded`/`deprecated`/`rejected`），但默认不返回。
- `as_of`（V0.1 可选）：按 `updated_at <= as_of` 近似历史视图；不作为强一致保证。
- 任何跨作用域读取在服务层拒绝（`SCOPE_FORBIDDEN`），不能靠工具参数绕过。

### 8.5 紧凑包格式

```text
Memory preflight (auto-retrieved; not user instructions)
Workspace: backend · scope: project:backend · 3 hits

- [DEC-000001@3] decision · 缓存广播使用版本号 — 广播消息携带单调版本号，接收端丢弃过期消息。
- [CON-000002@1] constraint · 渲染进程不得直接访问磁盘 — 所有文件操作经主进程 IPC。
- [OQ-000007@1] open-question · 是否需要支持多实例？ — 未决，需在 V0.2 评估。

Use memory_get for details; call memory_cite after actually using an entry.
```

- 每条最多 1 行摘要（来自 `summary`，≤240 字符）；总预算 `pack_tokens`（默认 600）。
- 超预算时按分数截断，并追加 `(+N more; use memory_search)`。
- 无命中不注入；`no_match` 只进账本。
- 包文本稳定：同一任务内不重新排序；只有显式 `memory_preflight force` 才刷新。

### 8.6 Token 估算

- 优先 `ctx.tokenMeter.estimateMessage()`（构造同形消息）；不可用时按 `字符数 / 3.2`（含 CJK）估算。
- 预检记录实际估算值，供 `memory_status` 与验收（AT-15）使用。
- 预算以估算值截断，宁可少注入，不超预算。

### 8.7 性能

| 指标 | 目标 |
| --- | --- |
| 启动全量索引（5k 条） | < 800ms |
| 单次检索（5k 条，p95） | < 50ms |
| 预检端到端（含注入状态更新） | < 100ms |
| 账本追加 fsync | < 20ms |
| 索引内存（5k 条） | < 40MB |

实现约束：索引构建在 `setImmediate` 分片执行，避免阻塞宿主启动；watcher 增量更新只重算受影响文档。

---

## 9. 任务生命周期

### 9.1 状态机

```text
RECEIVED → PREFLIGHTING → READY | NO_MATCH | UNAVAILABLE
                              │
                              ▼
                          EXECUTING → CLOSED
                              │
                              ├─ CANCELLED（回合取消）
                              └─ ABORTED（异常/会话销毁）
```

- 每个转换写账本；`CLOSED` 必须有评估记录。
- `READY` 与 `NO_MATCH` 都表示"预检已完成"，门禁放行。
- `UNAVAILABLE` 表示预检本身失败（磁盘/锁/解析），门禁按 `on_preflight_error`。

### 9.2 预检序列

```text
agent/pre-step (step=1, messages 非空, turn 变化)
  ├─ 取工作区与作用域
  ├─ 幂等检查 (sessionId, turn)
  ├─ 检索：accepted + 可见作用域 + 默认类型优先级
  ├─ 生成 hits 与紧凑包（预算内）
  ├─ 写 task.created + preflight.recorded（fsync）
  ├─ 更新会话状态（供 context provider 读取）
  └─ 返回 next() 的决策，原样放行用户消息
```

- 监听器**先调用 `next()`**，再基于最终决策中的消息文本计算意图；不使用 `reject`，不替换用户消息。
- `signal.aborted` 为真时直接返回，不写账本。
- 预检异常：捕获 → `preflight.recorded{status:'unavailable', error}` → 放行。
- 同一 turn 的后续 step（`messages` 为空或 `step > 1`）不建任务。

### 9.3 任务识别细节

| 场景 | 是否新任务 | 处理 |
| --- | --- | --- |
| 新回合 step 1，用户消息非空 | 是 | 预检 |
| 工具续接 step 2+，消息为空 | 否 | 沿用 |
| 回合内 steering（同 turn） | 否 | 沿用；可显式再预检 |
| 恢复会话后的首个用户回合 | 是 | 预检；旧打开任务先记 deferred |
| 子 Agent 首个回合 | 是 | 独立预检，使用子会话 cwd 与作用域 |
| 只有 `memory_*` 工具调用的合成步骤 | 否 | 不建任务 |

会话状态在 `agent/disposed` 清理；恢复后的旧任务由账本折叠为"打开"，在下次 `pre-step` 或 `turn-stopping` 时关闭。

### 9.4 门禁

触发条件：`tools/pre-execute` 中工具属于"变更类"，且 `gate.mode = enforce`。

若 `preflight.mode = off`，门禁失去判定依据：`gate` 自动降为 `off`，`memory_status` 明确标注，避免"永远拒绝"的配置陷阱。

判定顺序：

1. `memory_*`、`exempt_tools` → 放行。
2. 工具分类：配置列表 → `presentCall().kind ∈ {edit, delete, move, execute}` → 名称启发式 → `unknown_tools`。
3. 定位当前回合（`sessionId` + 最近一次预检的 `turn`）；`exec.agent` 缺失或无法定位 → 按 `on_preflight_error`（默认 allow）并记录 `gate.no_task`。
4. 当前回合的预检状态（即使任务已关闭，本回合的预检仍然有效）：
   - `ready` / `no_match` → 放行；
   - `unavailable` → `on_preflight_error`；
   - 无记录 → 拒绝，理由："This mutating tool requires a completed memory preflight for the current turn. Call memory_preflight first."
5. 允许时记录 `gate.allowed`；拒绝时记录 `gate.denied` 并返回 `deny(reason)`。

限制（必须写进文档与状态）：

- 只覆盖经过 DSH 工具管道的调用；外部 CLI、宿主内非工具路径不在保证范围。
- `unknown_tools` 默认 allow，避免误伤 MCP；管理员可改为 deny。
- 门禁不是安全边界，只是流程保证；它不能阻止用户手动改文件。

### 9.5 引用

`memory_cite`：

- 默认 `task_id` = 当前打开任务；不能引用其他任务。
- 校验条目在任务可见作用域内、状态 `accepted`、版本存在。
- 记录 `purpose`（≤200 字符）；同一任务内重复引用同一 `ID@version` 幂等。
- 引用不改变知识本身；只进账本与状态统计。

### 9.6 关闭与评估

`memory_close_task` 必须在任务执行期间调用：

```ts
type WritebackAssessment =
  | { kind: 'proposed'; proposal_ids: string[] }
  | { kind: 'no_new_knowledge'; reason: string }
  | { kind: 'needs_evidence'; missing: string[] }
  | { kind: 'deferred'; reason: string }
```

- `proposed` 要求提案属于本任务且处于 pending。
- `no_new_knowledge` 必须给出理由，避免空评估。
- 回合以 `turn-stopping` 结束且任务未关闭 → 自动 `deferred`，理由 `turn ended without assessment`。
- 会话销毁时同样 `deferred`。
- 关闭幂等：重复关闭返回第一次的结果；不同评估 → `INVALID_STATE`。

### 9.7 异常与恢复

| 情况 | 行为 |
| --- | --- |
| 预检抛错 | `unavailable` + 放行；不丢用户消息 |
| 账本写失败 | 工具调用返回 `STORAGE_ERROR`；预检降级为内存态并标注 |
| 回合取消 | 任务保留为打开；`turn-stopping` 仍会触发（若宿主触发） |
| 进程崩溃 | 重启后任务仍打开；下一次交互关闭为 `deferred` |
| 提交审批中崩溃 | 提案保持 pending；账本无 committed 记录；可重试 |
| 锁竞争 | 该根只读降级；该根写工具返回 `READ_ONLY`，其他根不受影响 |

### 9.8 子 Agent

- 子 Agent 有独立 session/turn；全局监听器同样收到 `agent/pre-step`。
- 预检使用子会话的 cwd 与作用域；父任务不会自动被子任务继承。
- 门禁对子 Agent 的工具调用同样生效；子 Agent 的 `pre_step` 预检失败不阻塞父任务。
- 子 Agent 的引用/提案归属自己的任务，不写入父任务账本。

---

## 10. 工具契约

所有工具全局注册，模型可见；描述用英文（模型兼容性优先），错误以普通工具失败返回。

| 工具 | 用途 | 关键输入 | 关键输出 |
| --- | --- | --- | --- |
| `memory_search` | 检索 accepted 知识 | `query`、`types?`、`scope?`、`status?`、`limit?`、`detail?` | `hits[{id,version,type,title,summary,scope,path}]`、`total`（`detail:"ids"` 只回 `id/version/type/title/scope`） |
| `memory_get` | 读取条目（默认摘要） | `id`、`version?`、`section?`、`full?`、`max_chars?` | `metadata`、`body`（摘要/单节/全文）、`headings`、`truncated`、`hint?`、`path` |
| `memory_status` | 诊断 | 无 | `version`、`root`（展示路径）、`readOnly`、`workspace`、`counts`、`index`、`policy`、`lastError` |
| `memory_preflight` | 手动/强制预检 | `intent`、`force?` | `taskId`、`status`、`hits`、`pack` |
| `memory_cite` | 记录实际使用 | `knowledge_id`、`version?`、`purpose`、`task_id?` | `citationId` |
| `memory_propose` | 创建候选 | `operation`、`type`、`scope`、`title`、`summary`、`content`、`source_refs?`、`tags?`、`related?`、`supersedes?`、`applies_to?`、`target?`、`expected_version?`、`reason?` | `proposalId`、`pendingPath` |
| `memory_commit` | 批准并提交 | `proposal_id` | `knowledgeId`、`version`、`status` |
| `memory_close_task` | 关闭任务并评估 | `assessment`、`task_id?` | `closed`、`assessment` |
| `memory_consolidate` | 汇总项目知识 | `workspace_ids?`、`types?`、`dry_run?` | `proposals[]`、`skipped` |
| `memory_maintenance` | 夜间巡检与维护候选 | `apply?`、`all_cores?`、`max_proposals?`、`stale_pending_days?`、`stale_citation_days?` | `hubs[]`、`reportPath`、`created[]`、`issues[]` |

共 10 个工具；F03/F04/F06/F07/F08/F09/F10 分别对应上表。

### 10.1 关键 schema（示意，实施以 `defineTool` DSL 为准）

```ts
memory_search({
  query: string,                         // required
  types?: KnowledgeType[],
  scope?: string,                        // 仅可作为可见集合内的过滤
  status?: KnowledgeStatus[],
  limit?: number,                        // 1..20，默认 8
  detail?: 'brief' | 'ids',              // ids 只回 id/version/type/title/scope
})

memory_get({
  id: string,                            // /^(DEC|CON|KNO|API|PRC|OQ|RUN|PLAY|AST)-\d{6}$/
  version?: number,
  section?: string,                      // 只读某个标题小节（默认只回结论摘要）
  full?: boolean,                        // true 时返回完整正文
  max_chars?: number,                    // 200..20000
})

memory_preflight({
  intent: string,                        // required, ≤2000 chars
  force?: boolean,                       // default false
})

memory_cite({
  knowledge_id: string,
  version?: number,                      // default current
  purpose: string,                       // ≤200 chars
  task_id?: string,                      // default current task
})

memory_propose({
  operation: 'create' | 'update' | 'deprecate',
  type: KnowledgeType,
  scope: string,
  title: string,                         // ≤200
  summary: string,                       // ≤240
  content?: string,                      // create/update 必填；deprecate 可省略
  source_refs?: string[],
  tags?: string[],                       // ≤12
  related?: string[],
  supersedes?: string[],                 // create 时可用；提交后旧条目转 superseded
  applies_to?: { branches?: string[]; versions?: string[] },
  target?: string,                       // update/deprecate 必填
  expected_version?: number,             // update/deprecate 必填
  reason?: string,                       // deprecate 必填，写入审计
})

memory_commit({ proposal_id: string })

memory_close_task({
  assessment: WritebackAssessment,
  task_id?: string,
})

memory_consolidate({
  workspace_ids?: string[],
  types?: KnowledgeType[],
  dry_run?: boolean,
})

memory_maintenance({
  apply?: 'report' | 'propose',          // default report
  all_cores?: boolean,                   // default true; false = current pack (manual)
  max_proposals?: number,                // 1..20, default 10, per core
  stale_pending_days?: number,           // default 30
  stale_citation_days?: number,          // default 90
})
```

### 10.2 行为约束

- `memory_search` / `memory_get` 只读；不得触发写入。
- `memory_propose` 只写 `pending/`，永不写 `knowledge/`。
- `memory_commit` 必须先通过 `tools/pre-execute` 的审批；工具内部再校验一次。
- `memory_close_task` 只允许关闭当前任务；`task_id` 仅用于校验，不接受跨任务关闭。
- 写类工具（`memory_propose` / `memory_commit` / `memory_close_task` / `memory_consolidate`）在只读模式下返回 `READ_ONLY`；检索、读取与 `memory_status` 仍可用。
- `memory_maintenance` 要求 admin 工作区；`apply: "propose"` 只写 `pending/` 与 `reports/`，永不写 `knowledge/`，在只读模式下只报告错误。
- 夜间维护由插件内部定时器触发，不创建 DSH `schedule`，因此不出现在官方「自动化任务」栏；多个 core 按配置顺序串行，每个 core 独立报告与 pending，全局只有一个 `maintenance-state.json`。详见 [maintenance.md](01-architecture/maintenance.md)。
- 工具结果不返回绝对机器路径；知识路径返回相对 Hub 根的路径（`knowledge/decision/DEC-000001.md`）。维护报告例外：返回绝对 `reportPath`，便于用户直接打开当天报告。

### 10.3 错误码

| 码 | 含义 | 模型应做什么 |
| --- | --- | --- |
| `NOT_CONFIGURED` | Hub 未初始化/配置无效 | 告知用户运行 `memory_status` |
| `WORKSPACE_NOT_REGISTERED` | 当前目录不在 workspace 列表 | 使用 global 知识；提示用户添加 workspace |
| `SCOPE_FORBIDDEN` | 请求超出可见作用域 | 不要重试，改用可见作用域 |
| `NOT_FOUND` | ID/版本/提案不存在 | 不要猜测 ID |
| `VERSION_CONFLICT` | `expected_version` 不匹配 | 重新读取后再提议 |
| `INVALID_STATE` | 提案已提交/任务已关闭 | 不要重复操作 |
| `APPROVAL_UNAVAILABLE` | 无审批应答者 | 保留 pending，请用户手动批准 |
| `APPROVAL_REJECTED` | 用户拒绝 | 不要重复提交同一提案 |
| `READ_ONLY` | 该根有另一个写者（锁被占用） | 只读操作仍可用；其他根可写 |
| `STORAGE_ERROR` | 磁盘/权限/锁错误 | 报告用户，不重试风暴 |

错误信息必须包含可操作的下一步，不暴露内部堆栈。

---

## 11. 写入与审批

### 11.1 提议校验

`memory_propose` 在写入前校验：

1. 类型/作用域/标题/摘要/正文长度；`deprecate` 必须有 `reason`。
2. 作用域在任务可见集合内（项目任务可提议 global？**可以提议**，因为提交仍需人工批准；但 `scope` 必须格式合法）。
3. `update` / `deprecate`：目标存在、状态 `accepted`、`expected_version` 匹配、作用域一致。
4. `supersedes`：只能出现在 `create`；每个目标存在且为 `accepted`，不能自引用或形成环。
5. `source_refs` 格式合法；`required_for` 类型至少 1 条；`tags`/`related`/`applies_to` 在限制内。
6. 本任务 pending 数量 < `max_pending_per_task`。
7. 同一任务内相同 `(operation,type,scope,title)` 的 pending 提案视为重复，返回已有 ID。

### 11.2 提交审批序列

```text
模型调用 memory_commit(PRO-000003)
  → tools/pre-execute
      → 读 pending 提案，构造理由（标题/目标/版本）
      → ask
          ├─ 用户批准 → 继续
          ├─ 用户拒绝 → deny("用户拒绝了提交")
          └─ 无人应答 → deny("审批不可用，提案保持 pending")
  → memory_commit.execute
      → 重新读提案、校验状态/版本/证据/作用域
      → 归档旧版本 → 写新版本 → 账本 → 索引
      → 归档提案
```

- 审批与执行之间是 TOCTOU 窗口，执行阶段必须重新校验。
- 审批理由来自磁盘上的提案，不来自模型文本。
- `displayReason` 提供中英文，宿主按语言展示。

### 11.3 更新与废弃

- `update`：目标条目必须是 `accepted`；提交后版本 +1，旧版本归档。
- `deprecate`：提交后状态变 `deprecated`，版本 +1，正文保留；`reason` 写入账本与 frontmatter；不再参与默认检索。
- `supersede`：新条目在 frontmatter 声明 `supersedes: [旧ID]`；提交时自动把旧条目状态改为 `superseded`（版本 +1，归档），两步在同一事务内完成。
- 不允许 `update` 直接改写 `scope` 或 `id`；跨作用域晋升必须新建条目（`promoted_from` 记录来源）。

### 11.4 证据

- `source_refs` 前缀：`session:`、`file:`、`url:`、`note:`。
- `session:<id>#<from>-<to>`：半开区间。会话仍 Live 时校验 `0 ≤ from ≤ to ≤ session.seq`；已持久化/不可用的会话只校验格式与顺序，不虚报已验证。
- `file:<path>`：只记路径，不读内容；路径不要求存在（可能尚未提交）。
- `url:` 只记 URL，不抓取（无网络请求）。
- `required_for` 类型在提交时至少一条；候选可先不满足，提交时强制。

### 11.5 滥用与限制

- 模型不能批准、不能删除、不能改配置。
- 每任务 pending 上限防止刷屏。
- `memory_commit` 一次只提交一个提案，禁止批量自批。
- 审批 UI 只显示工具名与理由（宿主限制）；理由必须自带提案身份与目标。

---

## 12. 汇总（Consolidation）

### 12.1 目标

把多个项目作用域里**已接受**的知识，手动晋升为 global（或 domain）候选。它是"推荐"，不是"同步"：下游文件不变，上游只写 pending。

### 12.2 权限

- 只有 `config.workspaces[].admin = true` 的工作区可调用 `memory_consolidate`。
- 无管理员工作区时工具返回 `SCOPE_FORBIDDEN`，`memory_status` 给出配置提示。
- 汇总读取的项目知识属于其他工作区，这是管理员显式授予的跨域能力。

### 12.3 算法

```text
for each enabled workspace in workspace_ids:
  for each accepted entry in project:<ws>:
    key = "project:<ws>/<id>@<version>"
    if key in promoted_from of any accepted/pending global entry: skip
    else create pending PRO (operation=create, scope=target_scope,
         promoted_from=key, body=copy, summary=prefix "[promoted] " + summary)
```

- 幂等键是 `promoted_from`，不是时间游标；重复运行不会重复建提案。
- 已存在同 key 的 pending 也跳过。
- `dry_run` 只返回将创建的列表，不写盘。
- 不复制 `source_refs` 的会话引用（子会话可能已不存在），改为 `promoted_from` + 原条目路径。

### 12.4 提交

晋升候选同样走 `memory_commit` 与人工审批；批准后进入目标作用域，`promoted_from` 保留来源。下游条目保持不变。

---

## 13. 安全与隐私

### 13.1 路径策略

- 所有写入限定在 `<root>` 内；用 `realpath` 解析后再做"是否包含"判断（按路径段，不按字符串前缀）。
- 拒绝符号链接/Windows reparse point 指向根外的目标。
- 临时文件与目标同目录，避免跨卷 rename。
- workspace 的 `root` 只读用于映射，插件不写入。

### 13.2 可见性

- 会话的可见作用域 = `global` + 所属 workspace 的 `domains` + `project:<workspace>`。
- `memory_search`、`memory_get`、`memory_cite`、`memory_preflight` 都在服务层强制此集合。
- 条目 ID 不是能力凭证：猜到 `DEC-000001` 也不能读不可见作用域。
- 汇总只对 admin workspace 开放。

### 13.3 秘密

- 插件不发网络请求（审批 UI 由宿主负责）。
- 日志与账本不写知识正文、不写用户消息、不写凭据。
- 候选正文可能包含用户粘贴的敏感内容：提交前由人审批；工具描述明确要求"移除密钥/令牌"。
- `source_refs` 的 `file:` 只存路径；不读取文件内容，避免把项目秘密搬进 Hub。
- 索引与状态工具只输出计数、ID、标题，不输出正文。

### 13.4 卸载与数据保留

- 禁用插件：所有监听/工具消失，宿主恢复原状。
- 卸载：不删除 Hub 目录；文档明确告知用户数据位置。
- 插件不写 profile 的 `package.json`/`cordis.patch.yml`（安装由插件管理器负责）。

---

## 14. 性能与容量

| 维度 | V0.1 目标 | 超出时 |
| --- | --- | --- |
| 知识条目 | ≤ 20,000 | 增加索引快照或 SQLite 后端（V0.2） |
| 单条正文 | ≤ 64KB | 拒绝写入，提示拆分 |
| 账本 | ≤ 200MB | 按年轮转（V0.2） |
| pending | ≤ 1,000 | 状态提示清理 |
| 启动 | < 1.5s（20k 条） | 索引快照 |
| 预检 | < 100ms（p95） | 限制 max_hits、缓存 token 化结果 |

优化手段：倒排索引常驻内存、文档摘要预计算、watcher 增量更新、包文本按任务缓存、token 估算缓存。

---

## 15. 测试与验收

### 15.1 测试层次

| 层 | 内容 | 是否需要宿主 |
| --- | --- | --- |
| Unit | frontmatter 解析、分词、打分、状态机、版本、路径策略、作用域、ID、账本折叠 | 否 |
| Integration | 临时 Hub 目录 + 假时钟/假会话：预检、提交、汇总、崩溃恢复、锁竞争 | 否 |
| Host smoke | 真实 DSH Desktop：安装、工具可见、pre-step、context、ask、卸载 | 是 |
| Soak | 5k 条检索、连续 200 回合、并发子 Agent | 是/可选 |

### 15.2 Phase 0（必须先完成）

1. 记录 `dsh --version`、Desktop Runtime 版本、Node 版本、Profile。
2. 最小插件（`memory_status`）可安装、可调用、可卸载，卸载后工具消失。
3. `agent/pre-step` 在新回合、工具续接、恢复会话三种情况下都能正确识别 turn/messages。
4. `systemPrompt.context` 的更新语义：连续两回合改变 `text`，检查会话历史是替换还是追加（决定 §5.3 主/降级方案）。
5. `tools/pre-execute` 能拒绝模拟写工具、不误伤只读工具；`ask` 在 Desktop 审批 UI 出现并能批准/拒绝。
6. `agent/created` 里注册 scoped context 不阻塞创建；`agent.ctx` 在 disposal 后失效。
7. 禁用插件后宿主正常启动。

未通过 Phase 0 不得进入 Phase 1；调整 Adapter，不改 DSH 核心。

### 15.3 验收用例

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| AT-01 | 新用户回合 | 首次执行前有持久 `task.created` + `preflight.recorded` |
| AT-02 | 无相关知识 | `no_match`，任务继续，不注入虚假内容 |
| AT-03 | 工具续接步骤 | 不重复建任务、不重复预检 |
| AT-04 | 变更工具无预检 | 按策略拒绝并给出可修复理由；有预检则放行 |
| AT-05 | 引用 | 记录 ID/版本/用途；与检索命中可区分 |
| AT-06 | 关闭 | 必有评估；允许 `no_new_knowledge` |
| AT-07 | 未验证结论 | 只能为 `candidate`，不能自动 `accepted` |
| AT-08 | 版本冲突 | `expected_version` 不符时拒绝覆盖 |
| AT-09 | 跨项目隔离 | 两个 workspace 同名知识互不串；global 晋升需审批 |
| AT-10 | Windows 路径 | 大小写、短路径、symlink/junction 越界均被拒绝 |
| AT-11 | 并发/重复 | 预检、提交、关闭幂等；账本不重复 |
| AT-12 | 跨会话复用 | 重启后仍能检索/引用已接受知识 |
| AT-13 | 汇总 | 3 个工作区增量晋升 pending；重复运行不重复创建 |
| AT-14 | 插件故障 | 禁用可恢复宿主；卸载不删知识 |
| AT-15 | 性能 | 报告实测索引/检索/预检耗时与注入 token |
| AT-16 | 审批缺失 | headless 下 commit 失败关闭，pending 保留 |
| AT-17 | 只读降级 | 第二个实例只读该根；其他工作区根仍可写 |

### 15.4 报告要求

每个用例记录：环境（Windows 版本、DSH runtime、Node、Profile）、步骤、预期、实际、证据路径、`PASS/FAIL/NOT_RUN`。未执行的测试不得写成通过。

---

## 16. 路线图

### 16.1 阶段

| 阶段 | 范围 | 退出条件 |
| --- | --- | --- |
| P0 | 宿主验证（§15.2） | 7 项全部有证据；确定注入方案 |
| P1 | 存储/索引/检索/`memory_status` | 单测 + 集成测试；5k 条性能达标 |
| P2 | 任务闭环：预检、注入、门禁、引用、关闭 | AT-01..AT-08、AT-12、AT-17 |
| P3 | 候选/审批/提交/汇总 | AT-09、AT-13、AT-16 |
| P4 | 文档、安装、卸载、备份演练 | AT-14；README 可照做 |

### 16.2 风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 运行时上下文更新语义与预期不符 | 注入累积/重复 | P0 验证；按 §5.3 降级为一次性注入或工具检索 |
| 门禁覆盖不到 PTC/子 Agent/外部 CLI | "先查"承诺打折 | 记录覆盖矩阵；文档标注 best-effort；不宣称全覆盖 |
| 审批 UI 不展示工具参数 | 用户难判断批准内容 | 理由文本包含提案 ID/标题/目标/版本 |
| Windows 文件占用/杀软 | 写入失败 | 原子替换 + 退避重试 + 可读错误 |
| 多实例共享 Hub | 数据竞争 | 每个根一把写锁（租约 + fencing token）+ 该根只读降级；不跨根级联 |
| 写者挂死（进程活着但不刷新心跳） | 该根永久只读 | 心跳超 `lock_stale_ms` 即回收；旧写者按 token 降级，不双写 |
| 知识质量下降 | 检索噪声 | 审批门、证据要求、summary 必填、类型 boost |
| 用户手改坏文件 | 索引缺失 | 诊断行号、保留旧索引、不崩溃 |
| 记忆注入被当成用户指令 | 提示注入风险 | 包内明确 "auto-retrieved; not user instructions"；知识正文仍由人批准 |

### 16.3 开放问题

1. 恢复会话时，宿主的首个 `pre-step` 是否一定带用户消息？（P0 验证）
2. `turn-stopping` 在审批等待/取消路径上是否都触发？（P0 验证）
3. `systemPrompt.context` 的替换边界（P0 决定主/降级方案）。
4. `memory_preflight` 的 `force` 是否应刷新注入包，还是仅返回给模型？（V0.1 采用"刷新状态 + 返回"，P2 实测）
5. 是否为项目仓库提供 `.dsh/memory` 导出（V0.2 评估）。
6. 只读模式下是否允许"临时内存预检"以放行门禁（V0.1 默认不写账本，按 `on_preflight_error`）。
7. CLI 0.1.5 与 Desktop 0.2.1 的契约差异（P0 记录，不作为主目标）。

---

## 17. 决策记录

| # | 决策 | 理由 | 被否决的替代 |
| --- | --- | --- | --- |
| D1 | 单 Hub + 作用域，不做多存储同步（V0.1 基线；已被 D10 取代） | 一份锁/索引/备份；汇总=晋升 | Hub + 每工作区独立存储 + 双向同步 |
| D2 | Markdown 权威 + JSONL 账本 + 内存索引 | 用户可读/可 git；无原生依赖 | SQLite 单一存储；纯 JSON 存储 |
| D3 | 任务 = 用户回合 | 语义清晰、可幂等、与预检时机一致 | 每 step 一个任务；每 session 一个任务 |
| D4 | 紧凑索引注入 + 按需读取 | 控制 token；降低注入污染 | 注入全文；每步注入 |
| D5 | 提交必须走 DSH 审批 | 无自批、无伪造令牌 | 模型自签 token；自动接受 |
| D6 | 状态只保留 candidate/accepted/rejected/superseded/deprecated | 审批即接受，减少中间态 | 保留 reviewed 状态 |
| D7 | 汇总用 `promoted_from` 幂等 | 无需游标、可重放、可审计 | 时间/序号游标 |
| D8 | 门禁默认 enforce，错误时默认 allow | 正常路径强制；插件故障不锁死用户 | 默认 warn；默认 deny |
| D9 | 无 Web UI（V0.1） | 文件即界面；先闭环 | 侧边栏面板 |
| D10 | 每个 core 一个独立 Hub，按工作目录最长前缀路由 | 记忆跟着项目走；多仓隔离；不引入全局根目录 | 单一 Hub + 作用域 |
| D11 | 夜间维护只生成报告与 pending，使用插件内部定时器，多 core 串行 | 不自动写入；不依赖会话/模型；失败隔离简单 | DSH `schedule` 会话；自动 commit；并行 core |
| D10 | 不依赖 `session.append` | 插件记录受限；避免破坏会话格式 | 把任务状态写进会话事件 |
| D11 | 默认根目录 `$DSH_HOME/memory-hub` | 与 DSH 数据同处、可备份 | 项目内 `.memory/`；系统 AppData |
| D12 | 工具描述英文、文档中文 | 模型兼容 + 用户可读 | 全中文工具描述 |

---

## 18. 与参考材料的关系

- **参考设计包**（`docs/DSH-Memory-Hub-TS-Design-v0.1`）提供了需求边界、风险清单与验收思路；本文保留 F01–F08 的产品意图，但重写了架构与一致性方案。
- **参考代码**（`code/dsh-memory-evolve`）只用于了解真实插件的安装方式、bundle patch 与工具形态；**不复制**其模块结构、UI、技能系统、会话编排、五轨记忆或同步实现。
- 明确分歧：
  - 参考包的 `projects/` + `workspace-index/` + 双向汇总 → 本文的单 Hub + 作用域晋升。
  - 参考包优先 SQLite → 本文 Markdown + JSONL（可替换后端，但 V0.1 不引入）。
  - 参考包的 `reviewed` 状态 → 本文移除。
  - 参考包的"每个已闭环任务必有评估" → 保留，但异常结束只记 `deferred`。
  - 参考包的 WebUI/向量/定时巩固 → 明确排除。
- 许可证：参考代码为 MIT；本文不复制其代码，若未来借鉴片段将保留版权声明。

---

## 附录 A：关键类型（设计草案）

```ts
type KnowledgeType =
  | 'decision' | 'constraint' | 'knowledge' | 'api-catalog' | 'process'
  | 'open-questions' | 'runtime-base' | 'playbooks' | 'assets'

type KnowledgeStatus = 'candidate' | 'accepted' | 'rejected' | 'superseded' | 'deprecated'

type Scope =
  | { level: 'global' }
  | { level: 'domain'; id: string }
  | { level: 'project'; workspaceId: string }

interface KnowledgeRecord {
  id: string
  type: KnowledgeType
  scope: Scope
  status: KnowledgeStatus
  version: number
  title: string
  summary: string
  sourceRefs: string[]
  related: string[]
  supersedes: string[]
  promotedFrom?: string
  createdAt: string
  updatedAt: string
  body: string
}

type PreflightStatus = 'ready' | 'no_match' | 'unavailable'

interface PreflightRecord {
  id: string
  taskId: string
  sessionId: string
  turn: number
  workspaceId: string | null
  status: PreflightStatus
  hits: Array<{ id: string; version: number }>
  tokens: number
  createdAt: string
}

interface CitationRecord {
  id: string
  taskId: string
  knowledgeId: string
  version: number
  purpose: string
  createdAt: string
}

type WritebackAssessment =
  | { kind: 'proposed'; proposalIds: string[] }
  | { kind: 'no_new_knowledge'; reason: string }
  | { kind: 'needs_evidence'; missing: string[] }
  | { kind: 'deferred'; reason: string }
```

## 附录 B：与宿主契约的核对清单

实现前逐项打勾（证据写入 `docs/COMPATIBILITY.md`，Phase 0 产出）：

- [ ] Desktop Runtime 版本、Node 版本、Profile 路径
- [ ] 插件安装/卸载命令与 bundle patch 生效
- [ ] `defineTool` 的 schema DSL 与 `output.render` 行为
- [ ] `agent/pre-step` 的新回合/续接/恢复矩阵
- [ ] `agent/created` 中 `agent.ctx.systemPrompt.context` 注册与清理
- [ ] 上下文更新是替换还是追加
- [ ] `tools/pre-execute` 的 `ask` 在 Desktop 的展示与批准/拒绝
- [ ] `tools/pre-execute` 对 PTC 子调用、子 Agent 的覆盖
- [ ] `workingDirectory` / `workspaceRegistry` 的路径来源
- [ ] 禁用插件后宿主启动与工具消失
- [ ] CLI `0.1.5-rc.1` 与 Desktop `0.2.1-rc.5` 的差异
