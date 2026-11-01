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
- 结束前调用 `memory_close_task` 并给出回写评估，避免任务停留在 `deferred`；
- 需要完整流程时，用 `skill` 工具加载 `memory-hub`（包尾只提示，不注入全文）。

## 引用

模型实际使用某条知识时，调用 `memory_cite` 记录：

- 知识 ID
- 版本
- 用途

这有助于后续审计和优化检索。

## 系统级 Skill：`memory-hub`

插件通过 Host `skills` 服务注册一个全局 skill：

- **名称**：`memory-hub`
- **来源**：`runtime`（由插件注册，不依赖 Hub 是否已有知识）
- **调用**：模型和用户都可调用；模型在任务涉及历史决策、约束、API、流程或回写时加载
- **定位**：它是**操作流程**，不是权威知识；权威知识仍只来自 `knowledge/`，写入仍必须审批
- **加载方式**：`skill` 工具按需加载，正文不进入每轮上下文；catalog 只显示 description / whenToUse
- **降级**：宿主没有 `skills` 服务时，插件记录 warning 并继续运行，不影响 10 个记忆工具

Skill 覆盖的固定流程：读预检 → `memory_get` → `memory_cite` → 必要时 `memory_search` → 结束前 `memory_close_task`；并规定 `project` / `core` / `domain` / `global` 的作用域选择、候选质量、审批边界、核心回填条件和夜间维护（只生成 pending，不自动提交）。实现见 `src/skill.ts`，注册入口在 `src/runtime.ts` 的 `registerSkill()`。决策记录见 [ADR-0004](../01-architecture/decisions/ADR-0004-system-level-memory-skill.md)。

## 与官方 Skill 的命名冲突审计

审计日期：2026-11-01。当前 catalog 中的非本插件 skill（含官方/内置与已安装第三方）：

`agent-experience`、`cordis-composition-reference`、`cordis-plugin-development`、`diagnose-windows-sandbox-acl`、`dsh-env-manager`、`editing-cordis-compositions`、`office`、`office-docx`、`office-export-pdf`、`office-pptx`、`office-recalculate`、`office-render`、`office-xlsx`。

结论：**没有 `memory-hub`，也没有旧的通用名 `memory-management`**。插件最终采用产品自有名 `memory-hub`，不再使用 `memory-management`。

为什么必须避开通用名：

- DSH skill 名只接受 kebab-case：`^[a-z0-9]+(?:-[a-z0-9]+)*$`，不支持冒号命名空间。
- 同一 layer 内按 rank 升序取第一个：runtime 是 `250`，bundled 是 `600`；因此同名时 **runtime 会盖住官方 bundled**，而不是官方盖住插件。静默遮蔽比报错更危险。
- 同一 layer 内重复 runtime 注册是 first-wins 并打 warning；provider 重名则直接抛错。
- 最近的 scoped layer（项目/preset）会覆盖 global layer；官方项目 skill 仍可合法覆盖同名插件 skill。

因此本插件把“不重名”作为发布前检查项，并用 `tests/skill.test.ts` 锁定当前官方名称快照。如果未来官方新增 `memory-hub`，必须重新审计并改名，不能依赖 runtime 优先级去“赢”。
