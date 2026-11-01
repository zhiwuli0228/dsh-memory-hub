# AGENTS.md — dsh-memory-hub

本文件是给在 `dsh-memory-hub` 仓库上工作的 AI agent 的操作手册。

## 角色

你是 DSH Memory Hub 的协作者。Memory Hub 是 DeepSeek Harness 的本地优先、文件原生长期记忆插件。

## 开始工作前必读

1. `docs/README.md` — 阅读策略、硬规则、目录地图。
2. `docs/00-project/project-brief.md` — 项目定位。
3. `docs/00-project/current-state.md` — 当前实现状态与待办。
4. 如果改动架构、存储或作用域，读 `docs/01-architecture/` 下相关文件。
5. 如果改动模型工具或审批，读 `docs/02-harness/` 和 `docs/05-domain/`。
6. 如果改动构建、测试、依赖，读 `docs/04-development/`。

## 硬规则

### 存储

- **Markdown / YAML / JSONL 是唯一权威数据格式**。不要引入强制性数据库。
- 默认**不使用向量数据库**。检索基于 CJK 分词 + 倒排索引 + BM25-lite。
- 配置、知识、候选、账本、历史必须对用户可读、可编辑、可 git 管理。

### 写入与审批

- 所有会改变权威知识（`knowledge/`）的写操作，都必须经过 DSH 原生人工审批 (`memory_commit`)。
- 模型**不能**自批。`memory_commit` 在 `tools/pre-execute` 中被拦截为 `ask`。
- 候选 (`pending/`) 由模型创建，但只是 `candidate`，不是权威知识。

### 预检与上下文

- 每个用户回合第一步自动预检；幂等键 `(sessionId, turn)`。
- 注入上下文只能是**紧凑索引**（ID、标题、一句话摘要、作用域），不要塞入正文或完整路径。
- 细节由 `memory_get` 按需读取。

### Web 面板

- 面板只读。不提供批准按钮、不绕过审批。
- 面板路由只允许回环请求。
- 不要给面板添加写入权威知识的端点。

### 测试

- **每个核心逻辑改动都必须有测试覆盖或更新现有测试**。
- 运行 `npm run check`（typecheck + build + test）验证。

### 文档

- **完成任何改动后，更新 `docs/00-project/current-state.md`**。
- 新增 ADR、设计、提案、任务时，使用 `docs/07-templates/` 中的模板。
- 中文为主，技术名词、API 名、工具名、文件路径保留原样。

## 推荐工作流

1. 读 `docs/00-project/current-state.md` 了解当前状态。
2. 如果是新功能/大改动，先按 `docs/03-openspec/` 写提案。
3. 小改动直接修改，但须补充/更新测试。
4. 改完运行 `npm run check`。
5. 更新 `docs/00-project/current-state.md`。
6. 提交前检查是否违反了本文件硬规则。

## 不应做的事

- 不要把大量历史会话或完整文件内容直接塞进上下文。
- 不要给模型伪造审批令牌的任何可能。
- 不要让面板或任何 HTTP 端点写入 `knowledge/` 或 `pending/`。
- 不要删除用户 Hub 目录下的记忆文件，除非用户明确授权。
- 不要引入必须联网的依赖或服务。
