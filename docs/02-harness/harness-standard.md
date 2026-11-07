# Harness Standard

本文件定义 AI agent 在 dsh-memory-hub 上工作时应遵循的行为标准。

## 开始实现前

1. 阅读 `AGENTS.md` 和本文件。
2. 阅读 `docs/00-project/current-state.md` 了解当前状态。
3. 如果改动架构/存储/作用域，阅读 `docs/01-architecture/` 相关文件。
4. 如果新增功能，按 `docs/03-openspec/` 写提案。

## 实现中

- 小步快走，每次只做一件事。
- 优先修改 `src/` 中对应模块；不要跨层调用。
- 新增核心逻辑必须补充测试。
- 不要引入强制性数据库或向量库。
- 不要绕过 DSH 审批写入 `knowledge/`。
- Web 面板路由只允许回环请求；除人工审核（批准/拒绝候选）外不要添加写入端点。
- 中文为主，技术名词保留原样。

## 实现后

1. 运行 `npm run check`。
2. 修复 typecheck / build / test 失败。
3. 更新 `docs/00-project/current-state.md`。
4. 如果是大改动，按 `docs/03-openspec/` 归档。

## 变更工具门禁

- `memory_commit` 之外，所有 mutating tool 默认需要本回合有效预检。
- 预检失败时按 `policy.gate.on_preflight_error` 处理（默认 `allow`）。
- 门禁是最后一道闸；不能替代预检和审批。

## 审批与写入

- `memory_propose` 创建候选，不产生权威知识。
- `memory_commit` 触发 DSH 原生 `ask` 审批。
- 无应答者时失败关闭，候选保持 pending。
- 不要在代码中伪造审批结果。
- 仅限本地测试：`policy.approval.mode: auto` 会让 `memory_commit` 跳过审批，账本 `approvalRef` 记为 `test:auto` 并打 warning 日志。默认必须是 `manual`；测试结束应恢复。

## 上下文注入

- 只注入紧凑索引：`ID`、`title`、`summary`、`scope`。
- 不注入正文、不注入完整路径。
- 保持注入在 600 token 以内。

## 测试要求

- 单元测试覆盖 domain 和 storage 逻辑。
- 集成测试覆盖 service 流程。
- Host 冒烟测试验证工具注册和预检。
- 面板注册测试验证 `client.js` 可加载。
