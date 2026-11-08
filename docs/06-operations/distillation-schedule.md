# 定时蒸馏（每个工作区）

V0.5.0 起，核心工作区与子工作区都可以配置**定时蒸馏**：到点在一个指定工作区开始一次记忆蒸馏，把本工作区的 L1 知识整理成上级核心（或 global）的候选，交给人工审批。当前发布版本为 **V0.5.2**（修复 Host 时间格式与 `session-controller` 延迟就绪，见文末「实现注记」）。

与[夜间维护](maintenance.md)不同，定时蒸馏使用 **DSH `schedule` 服务**，因此会出现在官方「自动化任务」栏；夜间维护是插件内部定时器，不出现在那里。

## 配置

面板「配置」页底部是整宽的定时蒸馏表：每行一个工作区，列依次为工作区、启用、时间、投递目标、会话 ID、最多候选、状态；行内状态会显示“已注册 / 待注册 / 注册失败 / 未启用”，表格底部汇总已启用数量、未保存修改与失败数。也可以直接改 `config.yaml`：

```yaml
core_workspaces:
  - id: product
    root: 'D:/projects/product'
    distill:
      enabled: true
      time: '03:30'        # 本地时间 HH:mm
      target: new          # new | session
      max_proposals: 5     # 单次最多候选数 1..20

workspaces:
  - id: backend
    core_id: product
    root: 'D:/projects/product/backend'
    distill:
      enabled: true
      time: '04:00'
      target: session
      session_id: session-xxxxxxxx
```

| 字段 | 含义 |
| --- | --- |
| `enabled` | 是否注册定时任务；关闭会删除同标题的 Host 任务 |
| `time` | 本地时间 `HH:mm`；按 Host 的本地时区注册为 `daily` |
| `target` | `new`：每次新建会话；`session`：投递到已有会话 |
| `session_id` | `target: session` 时必填；会话必须存在，且不能是委派子会话 |
| `agent_preset` | 可选，`target: new` 时指定 Agent 预设 |
| `max_proposals` | 单次蒸馏最多提交多少条候选（1..20） |

约束：

- 启用蒸馏的工作区必须有 `root`（否则保存时返回 `INVALID_INPUT`）；
- `target: session` 没有 `session_id` 时保存失败，不会写入 `config.yaml`；
- 子工作区 `enabled: false` 时不注册任务。

## 到点后做什么

任务提示词是确定性的，不依赖模型自由发挥：

1. 读本工作区 L1：`memory_search` / `memory_get`（`scope "project:<工作区 id>"`）；
2. 挑最多 `max_proposals` 条可复用条目，用 `memory_propose` 提交到**上级核心** `scope: "project:<父核心>"`；
3. 没有上级核心时（金字塔顶端）改用 `memory_consolidate` 晋升为 global 候选；
4. **不调用 `memory_commit`**，候选留在 `pending/`，由人在面板「待审批」批准；
5. `memory_close_task` 记录本次蒸馏。

上级核心由 `workspaces[].core_id` 链推导：工作区 `backend`（`core_id: product`）向上是 `product` 的父核心；核心 `product` 自身若同时是某个核心的子工作区（双角色），也按同一条链上推。

## 任务身份与对齐

- 任务标题固定为 `memory-hub:distill:<hub-id>:core:<工作区 id>` 或 `memory-hub:distill:<hub-id>:workspace:<工作区 id>`；`<hub-id>` 来自 `config.yaml` 的 `hub.id`。
- 插件启动、`config.yaml` 热更新（面板保存或手工编辑）时都会对齐一次：缺失则创建、时间/目标变化则更新、配置删除则删除。
- 对齐是**幂等**的：配置不变时只读不写；已存在的任务保留原任务 id 与投递历史。
- 单条创建/更新失败（例如会话不存在）只记入诊断，不影响其他工作区；面板「配置」页的「定时蒸馏」区域会显示每条的动作与错误。

## 排查

| 现象 | 处理 |
| --- | --- |
| 面板提示 “Host schedule 服务不可用” | 当前 Host 未加载 `schedule` 服务；升级 DSH 或在 profile 中启用它，然后重启 |
| 任务在「自动化任务」里但没投递 | 检查会话是否存在/已归档；`target: session` 的会话不能是被委派的子会话 |
| 到点没有新会话 | 确认 `time` 是本地时间、任务为 active；Host 停机期间错过的调度不会补跑 |
| 改了配置但任务没变 | 保存后等 watcher 热更新（约 300ms）；必要时重启 Host 或重新启用插件 |
| 不再需要任务 | 在面板关闭 `enabled` 并保存，或在「自动化任务」里删除；插件卸载不会自动删除已有任务 |

## 安全边界

- 定时蒸馏只创建候选，不提交、不改写正文、不删除知识；
- 新建会话的 `cwd` 固定为工作区 `root`，不会越界到其他工作区；
- 面板保存蒸馏配置走现有回环 HTTP 配置端点，写入的是 `config.yaml`，不是知识库；
- 任务提示词包含 `不要调用 memory_commit`，与“模型不能自批”的硬规则一致。

## 实现注记

- **时间格式**：DSH 的 `schedule` 服务要求 `daily.time` 为 `HH:mm:ss`（可带 1–3 位小数）。插件对外仍接受更友好的 `HH:mm`，注册时补成 `HH:mm:00`；对齐已有任务时只比较前 5 位，因此不会因为格式差异反复重建。
- **延迟就绪**：Host 的 `session-controller` 可能比 `schedule` 晚挂载，冷启动后的第一次对齐会收到 `This Host cannot create Sessions`。插件对这类可自愈错误做最多 5 次退避重试（2s、4s、6s…上限 15s）；重试成功后报告里的动作变为 `created`，面板诊断也会更新。
- **面板回显**：`/api/config` 会返回每个工作区的 `distill`，保存后表单不会回退成“未配置”。
