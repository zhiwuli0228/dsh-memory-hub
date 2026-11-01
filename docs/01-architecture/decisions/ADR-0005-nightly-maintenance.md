# ADR-0005: Nightly Maintenance Is Report-Only

## Status

Accepted（2026-11-01）

## Context

记忆会增长并出现重复、长期未引用、作用域异常、过期 pending 等问题。用户希望夜间自动巡检，第二天上班时处理候选，而不是每天手动翻文件。

自动改写、自动废弃或自动 commit 会在无人值守时破坏权威知识，也违背 `memory_commit` 必须人工审批的边界。多个 core workspace 还带来调度范围、顺序、失败隔离和状态归属问题。

## Decision

采用**夜间确定性巡检 + pending 提案**：

- 新增 `memory_maintenance` 工具，`apply: "report"` 只写报告，`apply: "propose"` 额外创建 pending 提案。
- 维护任务永不调用 `memory_commit`，不删除文件、不改写已有正文；不做语义合并。
- 只有**精确重复**（类型 + 标题 + 摘要 + 正文哈希一致）才生成 `deprecate` pending。
- 只有带 `core` / `shared` / `reusable` / `promote` 标签的子工作区知识才生成核心晋升 pending；晋升只到所属 core。
- 近似重复、过期 pending、长期未引用、加载诊断、超长正文、作用域异常只写报告。
- 使用**插件内部 Host 定时器**（`setInterval`），不创建 DSH `schedule` 任务：
  - 默认每日 `03:00` 本地时间，当天只跑一次；
  - Host 关闭时错过，下一次启动且当天未跑过时补跑一次；
  - 不绑定会话，不消耗模型上下文。
- 多个 core：一个全局定时器，按 `core_workspaces[]` 配置顺序**串行**执行，fallback 最后；每个 core 独立写 `<core-root>/reports/` 和 `pending/`。
- 一个全局状态文件 `~/.dsh/memory-hub/records/maintenance-state.json` 记录最后运行日期。
- 同一指纹已有 pending 时跳过；`max_proposals` 是每个 core 各自的上限。
- 手动调用工具要求 admin 工作区；定时器由插件内部以 `admin: true` 运行，不经过会话审批。
- 该定时器**不显示在 DSH 官方「自动化任务」栏**；官方栏只展示 `schedule` 服务创建的任务。

## Consequences

- 权威知识仍只通过人工审批进入；夜间只产生可审查候选。
- 多个 core 之间互不阻塞，但一个 core 失败不会当天重试；状态在整轮结束后统一写入。
- 串行使总耗时相加；一个慢 core 会拖慢后续 core。
- 报告分散在每个 core 的 `reports/latest.md`，没有全局合并报告。
- `all_cores: false` 的定时器当前只跑 fallback，不是“只跑当前 core”；这是已记录的语义限制。
- 维护依赖 Host 运行；Host 整晚关闭则不会在 03:00 执行。
- 若未来需要官方可见、可暂停/编辑的自动化，需要另建 `schedule` 任务；那会引入会话和模型回合成本。

## Alternatives Considered

- 自动 commit / 自动废弃：无人值守写入风险不可接受，且绕过人工审批。
- 用 LLM 做语义合并：不确定、不可重复、成本高；当前只做确定性判断。
- 用 DSH `schedule`：能出现在官方自动化任务栏，但绑定会话、每次触发消耗模型上下文，且需要维护会话。
- 多 core 并行：理论可行，但共享状态、报告去重和失败语义复杂；当前选择串行。
