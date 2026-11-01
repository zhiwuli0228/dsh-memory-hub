# dsh-memory-hub Docs Entry

本目录是 dsh-memory-hub 的项目级 Harness Context Hub，供人类与 AI agent 理解项目状态、架构、约束、OpenSpec 产物规则、开发标准与领域特定的记忆行为。

配套文档：

- [DESIGN.md](DESIGN.md) — V0.1 设计文档。
- [KNOWLEDGE-FORMAT.md](KNOWLEDGE-FORMAT.md) — 知识 Markdown/YAML 格式。
- [COMPATIBILITY.md](COMPATIBILITY.md) — 宿主兼容性验证记录。

## 阅读策略

不要逐篇通读。根据任务类型选择阅读。

### 任何非琐碎改动必读

1. `AGENTS.md`
2. `docs/00-project/project-brief.md`
3. `docs/00-project/current-state.md`
4. `docs/02-harness/harness-standard.md`
5. `docs/04-development/development-guide.md`

### 架构改动

额外阅读：

1. `docs/01-architecture/design.md`
2. `docs/01-architecture/module-boundaries.md`
3. `docs/01-architecture/storage-contract.md`

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
4. `docs/02-harness/context-policy.md`

### 部署 / 运维改动

额外阅读：

1. `docs/06-operations/deployment-guide.md`
2. `docs/06-operations/security-policy.md`
3. `docs/06-operations/troubleshooting.md`

## 硬规则

- **Markdown / YAML / JSONL only**。不引入强制性数据库。
- 默认**不使用向量数据库**。检索基于本地倒排索引 + BM25-lite。
- `memory_commit` 必须经过 DSH 原生人工审批；模型不能自批。
- Web 面板只读；面板路由只允许回环请求。
- 每个核心逻辑改动必须包含或更新测试。
- 每次完成改动后，更新 `docs/00-project/current-state.md`。

## 目录地图

```text
docs/
├── README.md                       # 本文件
├── DESIGN.md                       # V0.1 设计
├── KNOWLEDGE-FORMAT.md             # 知识文件格式
├── COMPATIBILITY.md                # 宿主验证记录
├── 00-project/                     # 项目简介、当前状态、术语、路线图
├── 01-architecture/                # 架构、模块边界、存储契约、ADR
├── 02-harness/                     # agent 行为标准、上下文策略
├── 03-openspec/                    # OpenSpec 提案/设计/规格/任务规则
├── 04-development/                 # 开发、编码、目录、测试、依赖
├── 05-domain/                      # 知识类型、作用域、source_ref 规则
├── 06-operations/                  # 部署、安全、排障
├── 07-templates/                   # 可复用模板
└── 99-archive/                     # 归档或历史文档
```
