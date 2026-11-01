# Proposal: 夜间记忆维护（只读巡检 + pending 提案）

## 1. Problem

记忆条目会随使用增长，出现重复、过期候选、长期未引用、作用域异常等问题。用户希望在凌晨自动巡检，第二天上班时直接处理候选，而不是每天手动翻文件。但自动改写或自动 commit 会破坏记忆的可信性，也会在无人值守时绕过审批。

## 2. Goal

提供一个确定性的维护入口：

- 扫描当前 Hub 的所有 core / sub-workspace；
- 生成 Markdown 巡检报告；
- 对**可确定的安全动作**创建 `pending` 提案，例如精确重复条目的 deprecate、带显式复用标记的 project → core 晋升；
- 任何情况下都不自动 `memory_commit`、不删除、不改写已有正文；
- 可由 DSH `schedule` 在夜间调用，也可以手动触发。

## 3. Scope

- 新增 `memory_maintenance` 模型工具。
- 新增确定性分析模块（重复、过期 pending、未引用、加载诊断、作用域异常）。
- 报告写入 `<hub>/reports/`，并提供 `latest.md`。
- 提案带稳定的维护指纹，避免每晚重复创建同一提案。
- 支持 `apply: "report" | "propose"`，默认 `report`。
- 支持全部 core 的串联巡检，单个 core 失败不阻塞其他 core。

## 4. Out of Scope

- 不做语义合并、正文重写、自动废弃未引用知识。
- 不自动审批，不自动 commit。
- 不删除 pending 或 knowledge 文件。
- 不修改 Web 面板；本阶段只提供工具、报告与 CLI/定时调用入口。
- 不引入数据库、向量库或外部服务。

## 5. Affected Modules

- runtime
- service
- store（只读 + 复用 `propose`）
- tools
- hub（报告路径）
- docs
- tests

## 6. Storage Impact

- 新增 `<hub>/reports/*.md`（非权威数据，可删除）。
- 新增 `pending/PRO-*.md`（仅 `apply: "propose"`）。
- 追加 `records/ledger.jsonl` 的 `proposal.created` 事件。
- 不修改 `knowledge/`、`config.yaml`、`history/`。

## 7. Constraints

- 文件仍是唯一权威数据；报告和候选都不是权威知识。
- `memory_commit` 仍需 DSH 原生审批；维护任务永不调用 commit。
- 维护入口要求 admin 工作区。
- 单个任务最多创建 `max_proposals` 条候选，默认 10，上限 20。
- 确定性、可重复：同一指纹在 pending 中已存在时跳过。

## 8. Risks

- 精确重复判断过严，可能长期没有可自动提案的条目；这是有意的保守选择。
- 晋升只认显式 `core` / `shared` / `reusable` / `promote` 标签，避免误判。
- 夜间任务若在非 admin 工作区触发会失败；需要在调度提示中指定 admin 会话。
- 报告文件会增长；可在后续版本加入保留天数。

## 9. Verification

- 单元测试：精确重复生成 deprecate 提案；重复运行不重复创建；带复用标签生成 core 晋升提案；report 模式不写 pending；非 admin 拒绝。
- 集成测试：`memory_maintenance` 工具注册；`npm run check` 全绿。
- 宿主冒烟：手动调用 `memory_maintenance({ apply: "report" })`，确认报告路径和计数；再调用 `apply: "propose"`，确认 pending 新增但不 commit。
- 定时验证：在独立维护会话创建每日 03:00 的 schedule，确认触发后只产生报告/候选。
