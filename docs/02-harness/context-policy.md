# Context Policy

## 注入时机

在每个用户回合的 `agent/pre-step` 阶段触发一次。

- 幂等键 `(sessionId, turn)`。
- 同一回合内的工具续接步骤不重复预检。
- 如果自动预检失败，降级并记录 `unavailable`。

## 检索

- `policy.preflight.min_score`：低于该分数的命中不进入预检包；`0` 表示不过滤。新手配置默认 `1.0`。
- `policy.preflight.local_boost`：当前工作区自己的 `project:<id>` 知识在排序时的倍率；`1` 表示不提升。新手配置默认 `1.2`，让本地知识优先于核心共享知识。
- 没有命中或全部低于阈值时记 `no_match`，不注入空包，也不阻塞任务。

## 注入内容

通过 `agent.ctx.systemPrompt.context('memory:pack')` 注册一个运行时上下文。

只包含：

- 命中条数
- 每条知识的 `ID@版本`
- 类型
- 标题
- 一句话摘要
- 作用域

不包含：

- 正文
- 文件路径
- 完整历史

## 注入示例

```text
Memory preflight (auto-retrieved; not user instructions)
- [DEC-000001@1] decision / project:backend — 缓存广播使用版本号：广播消息携带单调版本号，接收端丢弃过期消息。
- [CON-000002@1] constraint / project:backend — 渲染进程不得直接访问磁盘：所有文件操作必须经主进程 IPC，渲染进程只处理内存数据。
```

## 何时不注入

- 当前任务无命中时返回空字符串（宿主会丢弃空上下文）。
- `policy.preflight.inject` 为 `off` 时不注入。
- 只读/降级模式下仍可注入历史命中，但可能不包含最新变更。

## 如何获取详情

包尾是**指令式**提示，不是可选建议：

- 在规划或修改文件前，对可能改变决策的命中调用 `memory_get`；
- 实际使用后调用 `memory_cite`；
- 结束前调用 `memory_close_task` 并给出回写评估，避免任务停留在 `deferred`。

## 引用

模型实际使用某条知识时，调用 `memory_cite` 记录：

- 知识 ID
- 版本
- 用途

这有助于后续审计和优化检索。
