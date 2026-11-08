# 回顾式萃取（定时回顾本工作区会话）

V0.7.0 起，每个工作区可以配置**定时回顾**：到点回顾本工作区名下已结束的会话，把当时没记下来的结论补成候选，交给人工审批。它与[定时蒸馏](distillation-schedule.md)平级、互不重叠：**回顾写本工作区 L1（`project:<self>`）的漏记项，蒸馏负责向上晋升。**

与蒸馏一样，回顾使用 **DSH `schedule` 服务**，因此会出现在官方「自动化任务」栏。

## 配置

```yaml
core_workspaces:
  - id: product
    root: 'D:/projects/product'
    reflect:
      enabled: false       # 默认关闭
      time: '04:30'        # 排在维护 03:00、蒸馏 03:30/04:00 之后
      target: new          # new | session
      max_candidates: 5    # 单次最多候选数 1..20
      lookback_days: 30    # 只看最近 N 天创建的会话

workspaces:
  - id: backend
    core_id: product
    root: 'D:/projects/product/backend'
    reflect:
      enabled: true
      time: '04:35'
      target: session
      session_id: session-xxxxxxxx
```

| 字段 | 含义 |
| --- | --- |
| `enabled` | 是否注册定时任务；关闭会删除同标题的 Host 任务。**只影响调度**，不禁止手动 `memory_reflect` |
| `time` | 本地时间 `HH:mm` |
| `target` | `new`：每次新建会话（cwd = 工作区 root）；`session`：投递到已有会话 |
| `session_id` | `target: session` 时必填；缺失时该工作区跳过并记入诊断 |
| `agent_preset` | 可选，`target: new` 时指定 Agent 预设 |
| `max_candidates` | 单次回顾最多提交多少条候选（1..20） |
| `lookback_days` | 会话创建时间超过该天数则不回顾（1..365） |

全局上限在 `policy.reflect`：

```yaml
policy:
  reflect:
    max_chars: 8000     # 单会话 digest 字符上限（500..40000）
    max_sessions: 3     # 一次 memory_reflect 最多读几个会话（1..10）
    min_messages: 4     # 少于该消息数的会话按 too-short 跳过
```

## 会话归属

一个会话只会归属**最深匹配的已配置 root**（最长前缀）：

- cwd 落在核心 root、且不在任何子工作区 root 下 → 归核心任务；
- cwd 落在子工作区 root 下 → 归该子工作区任务；
- 不在任何 root 下 → 不回顾；
- `origin: subagent`、`delegationDepth > 0` 或有 `parentSession` 的委派会话 → 不回顾（内容属于父会话）。

因此核心任务**不会**读子工作区的会话，也不会替子工作区写 `project:<child>`；子工作区的漏记由它自己的任务补。

## 到点后做什么

提示词是确定性的，不依赖模型自由发挥：

1. `memory_preflight`（query 用「记忆回顾」）；
2. `memory_reflect`（不传 `session_id`），读本工作区名下最近可回顾的 digest；
3. 从 digest 里挑仍成立、且 `memory_search` 查重后没有覆盖的结论；
4. 最多 `max_candidates` 条 `memory_propose`：`scope: "project:<self>"`、`source_refs: ["session:<id>#<from>-<to>"]`、`tags` 加 `reflection`；
5. **不调用 `memory_commit`**，候选留在 `pending/`；
6. `memory_close_task` 记录本次回顾。

## digest 包含什么

| 保留 | 丢弃 |
| --- | --- |
| 用户消息文本 | 系统提示、注入的记忆包 |
| 每轮最后一个助手文本 | 中间过程、思考内容 |
| 失败的工具调用（名称 + 一行错误） | 成功工具输出、日志正文、密钥 |

单个会话超过 `max_chars` 时保留头 60% + 尾 40%，中间标注「已截断」。工具返回的 `seqRange` 就是 `session:<id>#<from>-<to>` 的可用区间。

## 任务身份与对齐

- 标题固定为 `memory-hub:reflect:<hub-id>:core:<id>` 或 `memory-hub:reflect:<hub-id>:workspace:<id>`，与蒸馏前缀不同，互不覆盖；
- 插件启动、配置热更新、`/api/config` 保存后都会对齐一次：缺失则创建、时间/目标变化则更新、配置删除则删除；
- 对齐幂等，单条失败只记诊断；瞬时错误（如 `cannot create Sessions`）沿用蒸馏的 5 次退避重试。

## 水位与去重

- `records/reflect-state.json` 记录每个会话的 `digestHash`、`reflectedAt`、`workspaceId`，最多 200 条，按时间淘汰；
- 同一 digest 第二次调用返回 `skipped: [{ sessionId, reason: 'already-reflected' }]`，不会重复消耗上下文；
- 该文件是**派生物**，可安全删除；删除后退化为可重复回顾（候选仍需人工审批，不会重复提交）；
- 账本追加 `reflect.read`（`sessionId`、`workspaceId`、`events`、`chars`、`proposals`），只追加、不改写。

## 排查

| 现象 | 处理 |
| --- | --- |
| `memory_reflect` 返回 `available: false` | Host 未提供 `sessionQuery` 服务；升级 DSH，或改用会话内手动记录 |
| 返回 `session-not-in-workspace`（`INVALID_INPUT`） | 指定的 `session_id` 不属于当前工作区，或不是已结束的主会话 |
| 会话一直是 `already-reflected` | digest 未变化；删除 `records/reflect-state.json` 中对应行可强制重读 |
| `skipped: too-short` | 会话消息数少于 `policy.reflect.min_messages`；可调低 |
| 核心任务看不到子工作区会话 | 设计如此：子工作区有自己的任务 |
| 到点没有任务 | 确认该工作区 `reflect.enabled: true` 且有 `root`；Host 停机期间错过的调度不补跑 |

## 安全边界

- 插件本身**不调用模型**、不生成正文、不自动建候选、不 `memory_commit`；
- 只读本工作区 root 下的会话；digest 不含成功工具输出与密钥；
- 回顾只写本工作区 `project:<self>` 候选，不跨作用域、不写 `global`；
- 面板仍只有「待审批」的批准/拒绝，不新增任何写端点。
