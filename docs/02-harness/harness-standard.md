# Harness 集成标准

> 适用范围：本文件是整个 `docs/02-harness/` 的入口。它回答一个问题——**"把 Memory Hub 接到某个 agent 运行时上"这件事，最少需要什么、最多允许要什么、缺东西时怎么退化**。
>
> 状态：2026-11-14 改版。原版本假定"宿主只有 DSH"，与 [ADR-0010](../01-architecture/decisions/ADR-0010-panel-transport-portability.md) 的多宿主方向冲突，已按三层模型重写。

---

## 1. 三层与边界

```text
core/          service · store · search · lock · ledger · frontmatter
               ↑ 零宿主依赖：不得 import @deepseek-ai/*，不得出现 ctx.
transport/     mcp-stdio · http-router · cli
               ↑ 只依赖 core：把同一份能力翻译成 MCP 工具 / HTTP 端点 / 子命令
host-glue/     dsh-plugin（webServer 登记、systemPrompt.context、skills.register、client module）
               ↑ 唯一允许 import DSH 的地方；也是唯一允许出现宿主事件名的地方
```

**硬性约束**：`core` 与 `transport` 中出现下列任一符号即为违规——`@deepseek-ai/`、`ctx.inject`、`ctx.get`、`clientModules`、`webServer`、`agent/pre-step`。
目前用一条静态测试守住（见 §7）。违反它的后果不是"代码丑"，而是**换宿主必须改核心**。

## 2. 宿主能力分档

不要求宿主整齐划一。**先分清"四条接入路径"，再谈档位**——详见 [interception-modes.md](interception-modes.md)：

| 方式 | 在途？ | 能注入 | 能捕获 | 覆盖 | 实际可用性 |
| --- | --- | --- | --- | --- | --- |
| ① **API 代理**（改 `base_url`） | 是 | ✅ | ✅ | 支持自定义端点的宿主 | **受组织策略约束**：企业 pin 了 `allowedProviders` 就完全不可用 |
| ② **生命周期钩子** | 否 | ✅（有轮前钩子时） | ✅ | 部分宿主（CC、opencode、DSH） | 最稳：不受网关策略与 preserved thinking 影响 |
| ③ **MCP / 工具** | 否 | ❌ | ❌ | 几乎所有宿主 | 基本盘 |
| ④ **CLI / 文件** | 否 | ❌ | ❌ | 全部 | 兜底 |

**初版的错误**：只想到 ②③，漏了 ①，于是把 Claude Code / Codex 误判为低档。实际上它们都能改 `base_url`，而 Claude Code 还有每轮触发的 `UserPromptSubmit` 钩子。

按三个关键能力定档：

| 档位 | 判据 | 典型宿主 |
| --- | --- | --- |
| **T3** | `inject` + `capture` + `approve` 三者齐备 | DSH（实测）；Claude Code、opencode（文档） |
| **T2** | 有 `inject`，但 `capture` 或 `approve` 缺一项 | — |
| **T1** | 只有工具面，无 `inject`/`capture` | Codex、Cline、Cursor、Zed（均可靠 ① 升级） |
| **T0** | 只有 CLI / 文件 | 任何 shell |

**判据只看三件事**：有没有轮前注入点、有没有轮末捕获点、有没有审批落点。三者全有才值得写原生适配器；缺任一项，一律走 ③ MCP 打底，再评估是否用 ① 补齐。

**优先顺序**：`③` 全覆盖 → 对有轮前钩子的宿主加 `②` → 只有个人用户、确认无组织策略限制、且接受全部代价时才上 `①`。

**不要**为了"统一"就用代理覆盖所有宿主。除了维护成本与隐私面，还有两条硬伤：改写请求体可能触发 preserved thinking 校验（400 `bound to a different conversation`）；企业若钉定 `allowedProviders`，本地代理会被**代码层拒绝**，不是需要申请。

逐宿主明细见 [host-capability-matrix.md](host-capability-matrix.md)。

## 3. 各层允许 / 禁止

### core

允许：纯函数、文件读写、索引、锁、账本。
禁止：读环境变量里的宿主信息、发网络请求（远端由注入的 client 承担）、假设 `cwd` 等于 Hub 根（必须由调用方传入）。

### transport

允许：把 core 的能力映射成协议；做参数校验与错误翻译。
禁止：自己实现检索/排序/作用域判断（那是 core 的事）；在 MCP 层再发明一套错误语义。

### host-glue

允许：监听宿主事件、注册工具/skill/路由/UI、把宿主审批接到 `memory_commit`。
禁止：把业务判断写进 glue（例如"什么算相关"）；glue 只做**时机映射**与**形状转换**。

## 4. 降级阶梯

宿主缺什么就往下退一格，**每一格都必须仍然"有用"**：

| 缺失能力 | 退化行为 | 用户看到什么 |
| --- | --- | --- |
| 无轮前注入钩子 | 先用 ① 代理补（宿主可改 `base_url` 时）；否则不自动预检，模型靠 MCP 主动查 | 指令文件写"涉及历史决策先调 `memory_search`"；`status.mounts.inject = false` |
| 无原生审批钩子 | 用 ① 代理拦工具调用；否则转 CLI 或面板 | `memory-hub inbox --approve <ID>`；模型侧只产出候选 |
| 无 UI 渲染 | 用 `memory-hub serve` 的 standalone 面板 | 打印一次 URL + token |
| 无 skills 服务 | 跳过 skill 注册，打 warning 继续 | 17 个工具仍可用；`status.mounts.skills = false` |
| 无 schedule 服务 | 不做定时蒸馏/回顾/维护 | `status.mounts.schedule = false`；可外部 cron 调 CLI |
| 无远端可达 | 全部远端角色降级为诊断 | `lastError` 有值、outbox 增长、回合正常结束 |

**降级不允许静默**。每一格都要在 `memory_status` 里有一个显式字段说明"这块为什么没开"，而不是让用户猜"面板怎么不出现"。

> **当前实现状态**：只有 `clientModules` 一项有等价字段（`{ advertised, reason }`，见 §7 的兼容 shim）。`status.mounts.*` 这组字段**尚未实现**，是本标准要求的落点——回填时应同时覆盖 `inject` / `skills` / `schedule` / `webServer` / `clientModules` 五项，并各带 `reason`。

## 5. 审批在 harness 层的四种落点

不变量"人批准才能进 `knowledge/`"在各宿主层各有实现，**语义必须一致**：

| 宿主形态 | 落点 | 账本标记 |
| --- | --- | --- |
| DSH | `tools/pre-execute` 把 `memory_commit` 拦成 `ask` | `approvalRef: <native>` |
| Claude Code | `PermissionRequest` 钩子 / MCP 工具权限 | `approvalRef: <native>` |
| opencode | `permission.ask` 钩子返回 `ask` | `approvalRef: <native>` |
| 代理模式 | 拦下"模型要调 write 工具"这一步，转成询问 | `approvalRef: <native>` |
| DSH / standalone 面板 | 「待审批」人工点击 | `panel:human` |
| T0/T1（无宿主审批） | CLI `memory-hub inbox --approve`，人在终端确认（**待实现**；当前 T0/T1 用 `memory-hub serve` 的 standalone 面板审批，`cli:human` 落点随 CLI 写路径一起落） | `cli:human` |

共同点：**决定由人做出，动作由程序记录**。模型在任何一条路径上都不能自己变成"人"。

## 6. 工具面契约

原生 17 个工具（DSH）与 MCP 工具集**不要求一一对应**，但要求：

- **同一语义同名**：`search` / `get` / `propose` / `cite` / `close_task` 在各宿主下语义完全一致，不允许 DSH 里"search 会顺带预检"而 MCP 里"search 是纯检索"。
- **只读集合稳定**：`search` / `get` / `status` / `preflight` / `duplicates` / `scenario_list` / `reflect` 在**任何**宿主都不得产生 `knowledge/` 变更。
- **写集合最小**：只有 `propose`（产出候选）和 `commit`（需人批）能改变知识状态。
- **新增工具必须先有 core 方法**：禁止在 glue 里拼业务逻辑凑一个工具。

细节见 [tool-surface.md](tool-surface.md)。

## 7. 测试要求

- **core 纯净性**：静态扫描 `src/`（除 DSH glue 目录）是否出现 DSH 符号。这是一条会失败的测试，不是注释。
- **传输等价**：同一组输入分别经 MCP 与经 service 直接调用，结果必须一致（工具名与错误码之外逐字段相等）。
- **降级可见**：人为移除 `skills` / `schedule` / `webServer` 服务，断言插件仍加载、`status.mounts` 里对应字段为 `false` 且带 `reason`（字段待实现，见 §4 备注；实现前用现有 `advertised` 字段的同类断言代替）。
- **审批不可伪造**：任何 transport 层都不存在"跳过审批"的参数；`memory_commit` 在无审批环境必须失败关闭，而不是自动通过。
- **代理注入可失效**：代理模式下，注入逻辑抛错时**必须透传原请求**，不得让用户的一次对话因为记忆系统故障而失败；同时 `status` 要记一次 `injectFailed`。

## 8. 相关文档

- [interception-modes.md](interception-modes.md) — **四接入方式**（代理 / 钩子 / MCP / CLI）的能力、代价与选型。先读这篇再读矩阵。
- [context-policy.md](context-policy.md) — 注入什么、注入多少、何时不注入（含三条注入路径的差别）。
- [host-capability-matrix.md](host-capability-matrix.md) — 各宿主逐项能力与验证状态。
- [tool-surface.md](tool-surface.md) — 原生工具 / MCP / CLI 的映射与命名规则。
- [ADR-0010](../01-architecture/decisions/ADR-0010-panel-transport-portability.md) — 为什么是这套分层。
