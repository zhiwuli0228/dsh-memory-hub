# ADR-0007: Per-Workspace Distillation Uses the Host Schedule Service

## Status

Accepted（2026-11-08）

## Context

用户希望在插件管理界面为每个工作区配置定时蒸馏：到点在某个工作区开始一次记忆蒸馏，可选投递到指定会话。

夜间维护（[ADR-0005](ADR-0005-nightly-maintenance.md)）已经覆盖了确定性巡检，但它只做重复/过期/作用域等规则判断，不产生跨层语义蒸馏；而 L1→L2 蒸馏需要读正文、判断复用价值、写出去项目化的候选，必须有模型会话参与。维护也明确不使用 `schedule`，因为它不绑定会话。

因此需要新的调度通道：既要出现在官方「自动化任务」栏便于查看/暂停，又要在到点后拥有一个真实会话（带 memory 工具、正确的 `cwd`），由提示词约束其行为。

## Decision

为每个核心/子工作区增加可选的 `distill` 配置，用 **DSH `schedule` 服务**注册每日任务：

- `target: new`：每次投递新建会话，`create.cwd` = 工作区 `root`，保证记忆按工作目录路由到正确 Hub；
- `target: session`：投递到已有会话（由用户填写 `session_id`），适用于常驻会话；
- 任务标题固定为 `memory-hub:distill:<hub-id>:core:<id>` / `:workspace:<id>`，以标题作为插件侧身份；
- 插件启动、`config.yaml` 热更新、`schedule` 服务延迟挂载时执行幂等对齐：缺失创建、时间/目标变化更新、配置移除删除；
- 蒸馏提示词固定步骤：读 L1 → `memory_propose` 到上级核心（`project:<父核心>`；顶端用 `memory_consolidate` 到 global）→ `memory_close_task`；**禁止** `memory_commit`；
- 单条任务失败只记诊断并显示在面板，不阻塞其他工作区；
- 面板「配置」页为每个工作区提供启用开关、时间、投递目标、会话 ID、候选上限，保存走现有回环配置端点。

## Consequences

- 定时蒸馏会出现在官方「自动化任务」栏，用户可查看、暂停、删除。
- 每次触发都会消耗一次模型会话与上下文；`target: new` 每次新建会话，`target: session` 复用会话。
- Host 停机期间错过的调度不会补跑（与 `schedule` 语义一致），这与维护的内部定时器“启动后补跑”不同。
- 任务身份依赖 `hub.id` + 工作区 id；修改 `hub.id` 会产生新任务并删除旧任务。
- 插件卸载不会自动删除 Host 中已注册的任务，需要用户在「自动化任务」里清理；文档已注明。
- `target: session` 的会话必须存在且不是委派子会话，否则该条任务创建失败并回填错误。
- 若需要“无会话、纯确定性”的蒸馏，应扩展 `memory_maintenance`，而不是把语义蒸馏塞进内部定时器。

## Alternatives Considered

- 复用夜间维护的内部定时器：不消耗会话，但无法做语义蒸馏，且不会出现在官方栏，不满足“指定会话”的需求。
- 插件自己起 Node `setInterval` 并直接调用模型：需要绕过会话与审批边界，且无法投递到指定会话。
- 每次蒸馏自动 commit：违背“模型不能自批”的硬规则。
- 预先为所有工作区建任务、用任务 id 存进 `config.yaml`：任务 id 由 Host 生成，跨重装/换机器不稳定；用标题做幂等身份更稳。
