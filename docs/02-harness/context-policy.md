# Context Policy

## 注入时机

在每个用户回合的 `agent/pre-step` 阶段触发一次。

- 幂等键 `(sessionId, turn)`。
- 同一回合内的工具续接步骤不重复预检。
- 如果自动预检失败，降级并记录 `unavailable`。

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

模型应调用 `memory_get` 按需读取完整知识内容。

## 引用

模型实际使用某条知识时，调用 `memory_cite` 记录：

- 知识 ID
- 版本
- 用途

这有助于后续审计和优化检索。
