# Proposal: 夜间记忆维护（只读巡检 + pending 提案）

## Status

Implemented（2026-11-01，V0.1.5 已发布）

## 1. Problem

记忆条目会随使用增长，出现重复、过期候选、长期未引用、作用域异常等问题。用户希望在凌晨自动巡检，第二天上班时直接处理候选，而不是每天手动翻文件。但自动改写或自动 commit 会破坏记忆的可信性，也会在无人值守时绕过审批。

## 2. Goal

提供一个确定性的维护入口：

- 扫描所有 core / sub-workspace；
- 生成 Markdown 巡检报告；
- 对**可确定的安全动作**创建 `pending` 提案，例如精确重复条目的 deprecate、带显式复用标记的 project → core 晋升；
- 任何情况下都不自动 `memory_commit`、不删除、不改写已有正文；
- 由插件内部 Host 定时器在夜间自动执行，也可以手动触发；
- 不依赖 DSH `schedule` 会话，不消耗模型上下文。

## 3. Scope

- 新增 `memory_maintenance` 模型工具。
- 新增确定性分析模块（重复、过期 pending、未引用、加载诊断、作用域异常）。
- 报告写入 `<hub>/reports/`，并提供 `latest.md`。
- 提案带稳定的维护指纹，避免每晚重复创建同一提案。
- 支持 `apply: "report" | "propose"`，默认 `report`。
- 支持全部 core 的**串行**巡检，单个 core 失败不阻塞其他 core。
- 新增 `policy.maintenance.*` 配置与 Host 定时器。
- 新增 `records/maintenance-state.json`，保证当天只跑一次。
- 面板「能力」页加入第 10 个工具说明。

## 4. Out of Scope

- 不做语义合并、正文重写、自动废弃未引用知识。
- 不自动审批，不自动 commit。
- 不删除 pending 或 knowledge 文件。
- 不新增面板的编辑/审批交互；仅更新只读的能力说明。
- 不引入数据库、向量库或外部服务。
- 不创建 DSH `schedule` 任务，因此不显示在官方「自动化任务」栏。

## 5. Affected Modules

- runtime
- service
- store（只读 + 复用 `propose`）
- tools
- config
- ledger
- hub（报告路径）
- client.js（能力说明）
- docs

## 6. Storage Impact

- 新增 `<hub>/reports/*.md`（非权威数据，可删除）。
- 新增 `pending/PRO-*.md`（仅 `apply: "propose"`）。
- 新增 `<configHub-root>/records/maintenance-state.json`。
- 追加 `records/ledger.jsonl` 的 `proposal.created` 事件。
- 不修改 `knowledge/`、`history/`；`config.yaml` 新增 `policy.maintenance`。

## 7. Constraints

- 文件仍是唯一权威数据；报告和候选都不是权威知识。
- `memory_commit` 仍需 DSH 原生审批；维护任务永不调用 commit。
- 手动维护入口要求 admin 工作区；定时器由 Host 内部运行，但同样不 commit。
- 每个 core 最多创建 `max_proposals` 条候选，默认 10，上限 20。
- 确定性、可重复：同一指纹在 pending 中已存在时跳过。
- 多个 core 共用一份全局策略，按配置顺序串行执行。

## 8. Risks

- 精确重复判断过严，可能长期没有可自动提案的条目；这是有意的保守选择。
- 晋升只认显式 `core` / `shared` / `reusable` / `promote` 标签，避免误判。
- 一个 core 失败不会当天重试；状态在整轮结束后统一写入。
- 报告文件会增长；可在后续版本加入保留天数。
- `all_cores: false` 的定时器当前只跑 fallback，语义不直观。
- 内部定时器不出现在官方「自动化任务」栏，用户不能在那里暂停/编辑。

## 9. Verification

- 单元测试：精确重复生成 deprecate 提案；重复运行不重复创建；带复用标签生成 core 晋升提案；report 模式不写 pending；非 admin 拒绝；日期/时间判断。
- 集成测试：`memory_maintenance` 工具注册；`npm run check` 全绿（53 个测试、10 个文件）。
- 宿主冒烟：手动调用 `memory_maintenance({ apply: "report" })`，确认 `product` / `dsh-plugin-dev` / fallback 各自的报告路径和计数；`apply: "propose"` 无候选、无错误。
- 定时验证：本机 23:29 因“当天未跑且已过 03:00”补跑一次，写 `maintenance-state.json`；没有 commit、删除或改写知识。未等待真实的 03:00 点，到点逻辑由 `tests/maintenance-schedule.test.ts` 覆盖。

## 10. Implementation Notes

- 入口：`memory_maintenance`（`src/tools.ts`）→ `MemoryRuntime.maintenance()` → 每个 pack 的 `MemoryService.maintenance()`。
- 定时器：`MemoryRuntime.startMaintenanceTimer()` / `runScheduledMaintenance()`。
- 分析：`src/maintenance.ts`；时间判断：`src/maintenance-schedule.ts`。
- 顺序：`core_workspaces[]` 配置顺序 + fallback；`for...of` + `await`，不并行。
- 状态：一个全局 `maintenance-state.json`；每个 core 独立报告和 pending。
- 当前本机配置：`enabled: true`、`time: '03:00'`、`apply: propose`、`all_cores: true`。
