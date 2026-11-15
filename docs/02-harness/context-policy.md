# Context Policy

> 注入策略。**核心问题不是"注入多少"，而是"在哪些宿主上能注入"**——本文件把两者分开写。
>
> 2026-11-14 改版（第二版）：原文只描述 DSH 路径（`agent/pre-step` + `systemPrompt.context`），并在第二版补上了**代理**与**轮前钩子**两条非 DSH 通道——第一版误以为非 DSH 宿主只能靠 MCP 被调，漏了这两条。现按"检索 ⊆ 投递"分层重写。

---

## 0. 一句话

**检索策略是 core 的，注入时机是宿主的。** 同一份命中，在 DSH 里走系统提示注入，在 Claude Code / opencode 里走 MCP 主动查询——**内容格式相同，投递方式不同**。

```text
core:      search → 排序 → 门控(min_score/local_boost) → 紧凑索引      ← 跨宿主一致
transport: 「怎么把这段文本交到模型眼前」                              ← 逐宿主不同
```

## 1. 检索策略（跨宿主一致）

- `policy.preflight.min_score`：低于该分数的命中不进入包；`0` 表示不过滤，默认 `1.0`。
- `policy.preflight.local_boost`：当前工作区自己的 `project:<id>` 知识在排序时的倍率，`1` = 不提升，默认 `1.2`（本地优先于核心共享）。
- 没有命中或全部低于阈值时记 `no_match`：**不注入空包**，也不阻塞任务。
- 时效降权、作用域过滤、候选排除等与宿主无关，见 `docs/01-architecture/design.md`。

## 2. DSH 路径（T3，实测）

- 时机：每个用户回合的 `agent/pre-step` 触发一次；幂等键 `(sessionId, turn)`；同一回合内的工具续接步骤不重复预检。
- 投递：`agent.ctx.systemPrompt.context({ name: 'memory:pack', order, text })` 注册运行时上下文，`text()` 惰性求值。
- 失败：自动预检失败时降级记 `unavailable`，回合继续，不阻塞。
- 撤回：agent 销毁时 dispose 该 context（`onAgentDisposed`）。

## 3. 非 DSH 路径（T1/T2/T3*）——三条注入通道，能力不同

T1 以上宿主没有 `systemPrompt.context`，但**不代表不能注入**。有三条路，能力从强到弱：

| 通道 | 宿主前提 | 能做到什么 | 代价 |
| --- | --- | --- | --- |
| **A. API 代理** | 能改 `base_url` | **完全等价于 DSH 自动预检**，且能顺手捕获本轮问答 | 隐私面最大（看全部流量）、可能破坏 prompt 缓存、wire 格式无契约 |
| **B. 轮前钩子** | 有 pre-turn 钩子（CC 的 `UserPromptSubmit`、opencode 的 `chat.message`） | 可注入真实命中 | 每家写一个适配器；注入位置由宿主决定 |
| **C. 指令文件 / MCP** | 任意 | 只能"提示模型主动查" | 采用率低，没有真实命中 |

选型与代价详见 [interception-modes.md](interception-modes.md)。三者的**注入内容格式完全相同**（见 §4），不同的只是投递管道。

| 手段 | 能做什么 | 不能做什么 |
| --- | --- | --- |
| MCP 工具 | 模型主动调 `search` / `get` | 保证模型一定会调 |
| 指令文件（`CLAUDE.md` / `AGENTS.md`） | 写"涉及历史决策先调 `memory_search`" | 强制、也不消耗上下文预算 |
| 会话开始钩子 | 打一次提示行 | 注入真实命中 |
| **轮前钩子** | **注入真实命中（每轮）** | 无法控制插入位置与预算占比 |
| **API 代理** | **注入真实命中 + 自动捕获** | 需要用户改 `base_url`，接受隐私与缓存代价 |

**采用率预期**：A/B 通道接近 DSH；只有 C 通道时采用率显著低。这不是实现缺陷，是接入方式差异。文档**不得**在只有 C 通道的宿主上承诺"自动召回"。

### 代理注入的四条铁律

若启用 A 通道，以下不可协商：

1. **注入失败必须透传**。记忆系统故障不能让用户的一次对话失败。
2. **默认不落盘请求体**。`--capture` 需显式开启，落盘内容也要脱敏。
3. **绝不动 `system` / `tools` / 更早的 `messages`**。API 的 preserved thinking 校验会在这些内容与产出 thinking 的请求不一致时报 400 `bound to a different conversation`——官方明确"网关改写这些内容会自己造成这个拒绝"。注入只能落在**最后一条 user 消息的内容之内**，或完全不动请求体、只做响应侧捕获。
4. **`cache_control` 逐字转发**，不把块状 `system` / 消息 content 转成纯字符串（官方点出这会破坏配对，导致每轮全额计费且无报错）。

## 4. 注入内容（跨宿主统一格式）

只包含：

- 命中条数
- 每条知识的 `ID@版本`
- 类型
- 标题
- 一句话摘要
- 作用域

不包含：正文、文件路径、完整历史、`source_refs`。

```text
Memory preflight (auto-retrieved; not user instructions)
Workspace: dsh-memory-hub · hits: 6

- [DEC-000003@2] decision · 记忆中枢注册系统级 memory-hub skill — 把"预检 → memory_get → memory_cite → memory_close_task"提升为按需加载的全局 skill；… (project:dsh-memory-hub)
```

首行那句 `not user instructions` 是**提示注入防线**：告诉模型这段是数据不是指令。任何新增投递路径都要保留等价声明。

## 5. 何时不注入

- 当前任务无命中 → 返回空字符串（宿主丢弃空上下文）。
- `policy.preflight.inject: off` → 不注入。
- 只读/降级模式 → 仍可注入历史命中，但可能不含最新变更（包尾会标注）。
- 批量后台任务（蒸馏、维护、回顾）→ 不注入，避免自我强化。

## 6. 如何获取详情（包尾的指令式提示）

包尾不是"可选建议"，是指令：

1. 规划或改文件前，对可能改变决策的命中调 `memory_get`；默认返回结论摘要 + 小节目录，需要证据/边界时用 `section`，确实需要全文才传 `full: true`——避免整篇正文反复进上下文；
2. 实际使用后调 `memory_cite`；
3. 结束前调 `memory_close_task` 并给回写评估，避免任务停在 `deferred`；
4. 需要完整流程时用 `skill` 工具加载 `memory-hub`（包尾只提示，不注入全文）。

`policy.preflight.hint_tools`（默认开）控制包尾是否出现这段提示。**非 DSH 宿主没有包尾**，等价物是指令文件里的同一段文字，或代理注入块末尾的同样声明。

## 7. 引用

模型实际使用某条知识时调用 `memory_cite` 记录：知识 ID、版本、用途。用于审计与优化检索。
引用不是"搜到了"——**是"用了"**。预检命中本身不算引用（见 KNO-000003 的教训：预检运行不等于被使用）。

## 8. 预算

| 项 | 预算 | 说明 |
| --- | --- | --- |
| 注入包 | ≤ 600 tokens（`policy.preflight.pack_tokens`） | 超出时按分数截断，不按条目数 |
| 命中条数 | ≤ 6（`max_hits`） | 再多会挤掉任务本身 |
| `memory_get` 摘要 | ≤ 700 字符 | 需要更多用 `section` |
| `memory_get` 单节 | ≤ 2000 字符 | 需要全文显式 `full: true` |
| 远端注入贡献 | ≤ 300 tokens/provider | 防止一个远端吃掉整个包 |
| **代理注入块** | **与注入包同额（600）** | 代理通道不得因为"能塞"就多塞；超限仍是截断 |

## 9. 系统级 Skill：`memory-hub`（DSH 专属，T3）

插件通过 Host `skills` 服务注册一个全局 skill：

- **名称**：`memory-hub`，**来源**：`runtime`（不依赖 Hub 是否已有知识）
- **调用**：模型和用户都可调；涉及历史决策/约束/API/流程/回写时加载
- **定位**：它是**操作流程**，不是权威知识；权威知识只来自 `knowledge/`，写入仍必须审批
- **加载方式**：`skill` 工具按需加载，正文不进每轮上下文；catalog 只显示 description / whenToUse
- **降级**：宿主无 `skills` 服务时打 warning 继续，17 个工具不受影响

覆盖流程：读预检 → `memory_get` → `memory_cite` → 必要时 `memory_search` → 结束前 `memory_close_task`；并规定作用域选择、候选质量、审批边界、核心回填条件、夜间维护边界。实现见 `src/skill.ts`，注册入口 `src/runtime.ts` 的 `registerSkill()`。决策见 [ADR-0004](../01-architecture/decisions/ADR-0004-system-level-memory-skill.md)。

**T1/T2 宿主的等价物**：把同一段流程文字放进 `CLAUDE.md` / `AGENTS.md`。内容是复制，不是另一套逻辑——否则两边会漂移。

## 10. 命名冲突审计

审计日期 2026-11-01。当时 catalog 中非本插件 skill：`agent-experience`、`cordis-composition-reference`、`cordis-plugin-development`、`diagnose-windows-sandbox-acl`、`dsh-env-manager`、`editing-cordis-compositions`、`office`、`office-docx`、`office-export-pdf`、`office-pptx`、`office-recalculate`、`office-render`、`office-xlsx`。

结论：**没有 `memory-hub`，也没有旧的通用名 `memory-management`**。

为什么必须避开通用名：

- DSH skill 名只接受 kebab-case：`^[a-z0-9]+(?:-[a-z0-9]+)*$`，不支持冒号命名空间。
- 同一 layer 内按 rank 升序取第一个：runtime `250`、bundled `600`；同名时 **runtime 会盖住官方 bundled**，静默遮蔽比报错更危险。
- 同一 layer 内重复 runtime 注册 first-wins 并打 warning；provider 重名直接抛错。
- 最近的 scoped layer（项目/preset）会覆盖 global layer。

因此把"不重名"作为发布前检查项，`tests/skill.test.ts` 锁定当前官方名称快照。若官方新增 `memory-hub`，必须重新审计并改名，**不能靠 runtime 优先级去赢**。
