# dsh-memory-hub Docs Entry

本目录是 dsh-memory-hub 的项目级 Harness Context Hub，供人类与 AI agent 理解项目状态、架构、约束、OpenSpec 产物规则、开发标准与领域特定的记忆行为。

配套文档：

- [DESIGN.md](DESIGN.md) — V0.1 设计文档。
- [KNOWLEDGE-FORMAT.md](KNOWLEDGE-FORMAT.md) — 知识 Markdown/YAML 格式。
- [COMPATIBILITY.md](COMPATIBILITY.md) — 宿主兼容性验证记录。
- [00-project/decision-log.md](00-project/decision-log.md) — 按日期记录已定决策与对应文档。
- [01-architecture/maintenance.md](01-architecture/maintenance.md) — 夜间维护的多 core 执行模型。
- [06-operations/maintenance.md](06-operations/maintenance.md) — 夜间维护操作与排障。
- [06-operations/distillation-schedule.md](06-operations/distillation-schedule.md) — 每个工作区的定时蒸馏（Host `schedule`）配置与排障。
- [06-operations/reflection.md](06-operations/reflection.md) — 每个工作区的定时回顾（`memory_reflect`）与去重水位。
- [06-operations/catalog-submission.md](06-operations/catalog-submission.md) — 公共插件目录的提交机制与本次 PR。
- [08-publish/dsh-memory-hub-v0.7.md](08-publish/dsh-memory-hub-v0.7.md) — 可对外发表的长文：v0.7.0 的能力、完整设计、设计亮点、工程数据、同类对照、潜力与演进路线。
- [05-domain/server-memory-2026.md](05-domain/server-memory-2026.md) — 服务端部署与三级管理的业界调研：云厂商 / SaaS / 学术分级 / 组织层级，以及三条可选路线。
- [03-openspec/proposal-team-memory.md](03-openspec/proposal-team-memory.md) — 草案：项目组三级记忆（个人 / 小组 / 项目组）+ 实时同步，本地模式保留为工作副本。
- [03-openspec/proposal-remote-providers.md](03-openspec/proposal-remote-providers.md) — 草案：把腾讯桥抽成"本地权威 + 按角色挂载的远端 provider"（`feed`/`mirror`/`authority`/`index`），`scope` 与 `forget` 进接口、`capabilities()` 声明与拒答、`http-json` 声明式适配器。
- [01-architecture/decisions/ADR-0010-panel-transport-portability.md](01-architecture/decisions/ADR-0010-panel-transport-portability.md) — 面板不绑死 DSH：HTTP router 单实现双挂载（DSH `webServer` 零配置 / `memory-hub serve` 绑 loopback），MCP stdio + CLI 才是跨宿主通用面。
- [02-harness/interception-modes.md](02-harness/interception-modes.md) — 四种接入方式（API 代理 / 生命周期钩子 / MCP / CLI）：`base_url` 代理是与 DSH 最接近的自动注入通道，但隐私与缓存代价最高。
- [05-domain/remote-provider-patterns-2026.md](05-domain/remote-provider-patterns-2026.md) — 2026-11 调研：可插拔记忆后端的治理缺口（`forget`/`scope`）、腾讯代理型记忆接入形态、中文社区的云端只带"人格"与事件日志实践。

## 阅读策略

不要逐篇通读。根据任务类型选择阅读。

### 任何非琐碎改动必读

1. `AGENTS.md`
2. `docs/00-project/project-brief.md`
3. `docs/00-project/current-state.md`
4. `docs/02-harness/README.md` → `docs/02-harness/harness-standard.md`
5. `docs/04-development/development-guide.md`

### 宿主接入 / 工具面 / 注入改动

额外阅读：

1. `docs/02-harness/interception-modes.md`（四种接入方式：代理 / 钩子 / MCP / CLI）
2. `docs/02-harness/harness-standard.md`（三层边界、分档、降级阶梯）
3. `docs/02-harness/host-capability-matrix.md`（各宿主能力与验证状态）
4. `docs/02-harness/context-policy.md`（检索 vs 注入、三条注入通道、预算）
5. `docs/02-harness/tool-surface.md`（工具映射、审批拦截、错误语义）

### 架构改动

额外阅读：

1. `docs/01-architecture/design.md`
2. `docs/01-architecture/module-boundaries.md`
3. `docs/01-architecture/storage-contract.md`
4. `docs/01-architecture/maintenance.md`（涉及多 core / 定时 / 报告时）
5. `docs/01-architecture/compatibility.md`（改 frontmatter / 格式 / 类型前必读）
6. `docs/01-architecture/decisions/`（相关 ADR）

### OpenSpec 工作

额外阅读：

1. `docs/03-openspec/proposal-rule.md`
2. `docs/03-openspec/design-rule.md`
3. `docs/03-openspec/spec-rule.md`
4. `docs/03-openspec/tasks-rule.md`

### 模型工具 / 审批 / 预检改动

额外阅读：

1. `docs/05-domain/knowledge-types.md`
2. `docs/05-domain/scope-rules.md`
3. `docs/05-domain/plugin-dev-workflow.md`
4. `docs/05-domain/source-ref-rules.md`
5. `docs/05-domain/memory-landscape-2026.md`（业界对照）
6. `docs/05-domain/hermes-memory-2026.md`（Hermes 拆解）
7. `docs/02-harness/context-policy.md`

### 检索 / 性能改动

额外阅读：

1. `docs/04-development/search-performance.md`（规模实测与优化记录）
2. `docs/01-architecture/scale-plan.md`（多年积累的入库 / 审批 / 分库预案）
3. `scripts/bench-search.ts`（可复现基准，`npx vite-node scripts/bench-search.ts`）
4. `scripts/bench-pending.ts`（候选积压启动基准，`npx vite-node scripts/bench-pending.ts -- 3000`）

### 部署 / 运维改动

额外阅读：

1. `docs/06-operations/deployment-guide.md`
2. `docs/06-operations/security-policy.md`
3. `docs/06-operations/troubleshooting.md`
4. `docs/06-operations/maintenance.md`
5. `docs/06-operations/distillation-schedule.md`
6. `docs/06-operations/reflection.md`
7. `docs/06-operations/release.md`

## 不变量

这四条是产品身份，不是操作习惯（与 [AGENTS.md](../AGENTS.md) 保持一致）：

- **文件是权威**：`knowledge/` 下的 Markdown / YAML / JSONL 是事实源；数据库、索引、远端服务只能是派生或通道。不引入"必须靠专有工具才能读"的格式。
- **人批准才能进 `knowledge/`**：模型可以创建 `pending/` 候选，永远不能自批；`memory_commit` 必须经过宿主原生人工审批。夜间维护只写报告和 pending，不 commit、不删除、不改写正文。
- **纯文本可读可迁移**：用户能打开、diff、git 管理。
- **默认零网络**：所有远端连接默认关闭，关闭时零请求、不初始化 client、不注册定时器；无网络时核心功能全部可用。

## 方向性约定（2026-11 起，非不变量）

- **多宿主三层单向依赖**：`core`（零宿主依赖）→ `transport`（MCP stdio / HTTP router / CLI）→ `host-glue`（DSH 插件）。只有 host glue 可以 import `@deepseek-ai/*`。见 [ADR-0010](01-architecture/decisions/ADR-0010-panel-transport-portability.md)。
- **多远端按角色接入**：`feed` / `mirror` / `authority` / `index`，不按厂商接入。见 [proposal-remote-providers](03-openspec/proposal-remote-providers.md)。
- **多入口共享一份 API**：DSH 内嵌面板、`memory-hub serve` standalone 面板、CLI 共用同一份 HTTP router 与 config 写入路径；渲染可有两套，API 契约只能有一套。
- **服务端只允许绑定 loopback**：Host 头白名单 + 本地 Origin + 写操作令牌；监听 `0.0.0.0` 直接拒绝启动。
- 检索默认仍是 CJK 分词 + 倒排索引 + BM25-lite；向量索引若要引入，必须是**可选派生层**（可删可重建），不能成为唯一检索路径。
- 每个核心逻辑改动必须包含或更新测试；每次完成改动后，更新 `docs/00-project/current-state.md`。

## 目录地图

```text
docs/
├── README.md                       # 本文件
├── DESIGN.md                       # V0.1 设计
├── KNOWLEDGE-FORMAT.md             # 知识文件格式
├── COMPATIBILITY.md                # 宿主验证记录
├── 00-project/                     # 项目简介、当前状态、决策日志、术语、路线图
├── 01-architecture/                # 架构、模块边界、存储契约、维护执行模型、ADR
├── 02-harness/                     # 宿主接入标准、上下文策略、宿主能力矩阵、工具面契约
├── 03-openspec/                    # OpenSpec 提案/设计/规格/任务规则
├── 04-development/                 # 开发、编码、目录、测试、依赖
├── 05-domain/                      # 知识类型、作用域、source_ref 规则
├── 06-operations/                  # 部署、安全、维护、排障、发布
├── 07-templates/                   # 可复用模板
└── 99-archive/                     # 归档或历史文档
```
