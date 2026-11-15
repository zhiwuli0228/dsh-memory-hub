# Host Capability Matrix

> 各宿主能提供什么、我们因此能做什么。**这张表的用途不是"支持列表"，而是"降级依据"**：缺哪一格，走 [harness-standard.md](harness-standard.md) §4 的对应降级。
>
> 验证状态只有三种，**不要混用**：
> - `实测` — 我们在该宿主上真跑过，有账本/日志/截图。
> - `文档` — 官方文档明确写了（或有一手抓包证据），但我们没跑。
> - `待核` — 二手信息或推测，**不得据它承诺功能**。
>
> 最后更新：2026-11-14（第二版）。**第一版把 Claude Code 误判为 T1，原因是只找了"钩子"一条路，漏了 `UserPromptSubmit` 与 `base_url` 代理两条。本版修正。**

---

## 1. 能力维度

| 代号 | 能力 | 对 Memory Hub 的意义 |
| --- | --- | --- |
| `inject` | 轮前注入（把文本放进本轮上下文） | 自动预检的唯一途径 |
| `capture` | 轮末/在途捕获（读到本轮问答、工具调用） | 自动提炼候选的前提 |
| `approve` | 审批落点（宿主能拦一次并问人） | `memory_commit` 的人审落点 |
| `tools` | 原生工具注册（非 MCP） | 17 个 `memory_*` 工具的直达方式 |
| `mcp` | MCP 客户端 | 跨宿主通用工具面的前提 |
| `lifecycle` | 会话开始/结束钩子 | 一次性提示、会话收尾 |
| `skill` | skill / 指令包机制 | `memory-hub` 操作流程的分发 |
| `ui` | 可渲染界面（组件/面板） | 图形化审批与配置 |
| `schedule` | 宿主定时任务 | 夜间维护、定时蒸馏 |
| `sessions` | 可读历史会话 | 回顾式萃取（`memory_reflect`） |
| `proxy` | 可改 LLM 端点（`base_url`） | 传输层注入：**不依赖任何宿主钩子** |

## 2. 档位定义（按三个关键能力定档，不按品牌）

| 档位 | 判据 | 含义 |
| --- | --- | --- |
| **T3** | `inject` + `capture` + `approve` 三者齐备 | 可与 DSH 对齐：自动召回 + 自动提炼 + 原生审批 |
| **T2** | 有 `inject`，但 `capture` 或 `approve` 缺一项 | 能自动召回；提炼或审批要降级 |
| **T1** | `inject` 与 `capture` 都没有，只有工具面 | 模型必须主动查；审批靠 CLI/面板 |
| **T0** | 只有 CLI / 文件 | 全靠人 |

`proxy` 是**独立加分项**：有 `proxy` 的宿主即使缺 `inject` 钩子，也能通过代理获得 T3 能力——代价见 [interception-modes.md](interception-modes.md) §1。

## 3. 矩阵

| 宿主 | 档位 | inject | capture | approve | tools | mcp | lifecycle | skill | ui | schedule | sessions | proxy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **DSH** | **T3** | ✅ 实测<br>`agent/pre-step` + `systemPrompt.context` | ✅ 实测<br>`sessionQuery` | ✅ 实测<br>`tools/pre-execute` → `ask` | ✅ 实测 | — | ✅ 实测 | ✅ 实测 | ✅ 实测 | ✅ 实测 | ✅ 实测 | 可用（不必要） |
| **Claude Code** | **T3*** | ✅ 文档<br>`UserPromptSubmit` 每轮触发，可追加上下文 | ✅ 文档<br>`Stop` / `SessionEnd` + transcript | ✅ 文档<br>`PermissionRequest` / `PermissionDenied` 钩子 | — | ✅ 文档 | ✅ 文档<br>`SessionStart`/`SessionEnd` | ✅ 文档<br>skill / `CLAUDE.md` | — | — | ⚠️ 文档<br>transcript JSONL | ✅ 文档<br>`ANTHROPIC_BASE_URL`（**第三方已抓包证实 100% 流量经过**） |
| **opencode** | **T3*** | ✅ 文档<br>`chat.message` 可改 message/parts | ✅ 文档<br>`event` + `tool.execute.after` | ✅ 文档<br>`permission.ask` 直接返回 allow/deny/ask | ✅ 文档<br>`tool` 钩子注册 | ✅ 文档<br>`config` 钩子可注入 MCP | ✅ 文档 | ✅ 文档<br>`AGENTS.md` | ⚠️ 待核<br>TUI，非 web | — | ⚠️ 待核 | ✅ 文档<br>自定义 provider `baseURL` |
| **Codex CLI** | **T1+** | — | — | ⚠️ 待核<br>命令确认 | — | ⚠️ 待核 | — | ✅ 文档<br>`AGENTS.md` | — | — | — | ✅ 文档<br>`model_providers.*.base_url` |
| **Cline** | **T1+** | — | — | ⚠️ 待核<br>MCP 工具可要求确认 | — | ✅ 文档 | — | ✅ 文档<br>`.clinerules` | — | — | — | ✅ 文档<br>OpenAI 兼容端点 |
| **Cursor** | **T1+** | — | — | ⚠️ 待核 | — | ✅ 文档 | — | ✅ 文档<br>`.cursor/rules` | — | — | — | ⚠️ 待核 |
| **Zed** | **T1+** | — | — | ⚠️ 待核 | — | ✅ 文档<br>仅 Tools/Prompts | — | ⚠️ 待核 | ⚠️ 待核 | — | — | ⚠️ 待核 |
| **纯 CLI / 脚本** | **T0** | — | — | ✅ 实测<br>`inbox --approve`（待实现） | — | — | — | — | — | — | — | — |

`T3*`：**是文档判定的 T3，但我们没实测**。这两家是继 DSH 之后最值得先做原生适配的宿主——它们的钩子面已经足够完整，不需要用代理这种重手段。

`T1+`：档位仍是 T1，但因为有 `proxy`，**理论上可达 T3**；需要用户接受代理的隐私与缓存代价。

> **`proxy` 列的重要限定（2026-11-14 二次调研）**：`proxy` 可用 ≠ 我们能插进去。企业若通过 MDM / managed settings 下发 `allowedProviders: ["customEndpoint"]` 并钉定自己的 `ANTHROPIC_BASE_URL`，**Claude Code 会主动拒绝指向其他任何地址的会话，包括开发者自己的本地代理**。`proxy` 只是"宿主机支持改端点"，不保证"组织允许改端点"。详见 [interception-modes.md](interception-modes.md) §1 的企业场景。

> `—` 表示该宿主没有这个能力，不是"我们没做"。
> `✅/⚠️` 只表示有/文档提到，**不表示我们已经接好**。

## 4. 每档的最小可用集

| 档位 | 我们交付什么 | 用户要做的 |
| --- | --- | --- |
| **T3（DSH）** | 全部：自动预检、17 工具、skill、面板、定时、回顾 | 装插件 |
| **T3*（CC / opencode）** | MCP 工具 + 钩子适配器（注入/捕获/审批） + 指令文件 | 配 MCP + 装钩子 + 写指令文件 |
| **T1+** | MCP 工具 + 指令文件 + CLI 审批；可选开代理升级到 T3 | 配 MCP + 写指令文件（+ 可选配 base_url） |
| **T0** | CLI（`search` / `get` / `inbox` / `serve`） | 直接敲命令 |

## 5. 新增一个宿主：按顺序做六件事

1. **先测 `proxy` 那一列**——它最便宜地决定"能不能自动注入"。
2. **再测 `inject` / `capture` / `approve`** 三个钩子点，别急着写适配器。这三格决定天花板。
3. 定档 → 选最小可用集（§4），不追求对齐 DSH。
4. 若写 glue：**只做时机映射与形状转换**；业务判断回到 core。
5. 补一行矩阵（含验证状态与证据链接），并加进 `tests/host-matrix.test.ts` 的快照。
6. 在 `docs/06-operations/` 加安装说明（配置片段 + 验证命令 + 常见错误）。

**优先做 MCP 路径**：一次接入覆盖 T1 及以上的全部宿主。glue 只在这家能力明显更强时才值得写——**Claude Code 与 opencode 是明确的例外**，它们已经接近 T3，值得为它们各写一层薄适配器。

## 6. 未验证清单（不得据此承诺）

- `UserPromptSubmit` 追加的内容在上下文预算里占多少、超限时怎么截断。
- Claude Code 的 MCP 工具能否**单独**强制 `ask`（而不是每会话确认）。
- opencode 插件钩子在 pre-turn 时机的实际可用性（`chat.message` 是"收到后"还是"发给模型前"）。
- opencode TUI 是否允许叠加可视化面板。
- Codex CLI 当前版本的 MCP 支持程度与工具白名单。
- 各宿主改 `base_url` 后 **prompt 缓存是否真的失效**（需实测成本差）。
- Zed / Cursor 是否支持带参数的 MCP 资源读取（影响 `memory_get` 的分节读取）。
- 各宿主对 MCP 工具**数量**的容忍度（8 个全暴露 vs 只暴露只读 5 个）。

以上任一项确认后，更新本表与 [interception-modes.md](interception-modes.md)，**同时**检查 [tool-surface.md](tool-surface.md) 的暴露集合是否需要调整。

## 7. 与 DSH 的差异要点（避免"照抄 DSH 设计"）

| 差异 | 影响 |
| --- | --- |
| 没有 `systemPrompt.context` 惰性求值 | 提示要提前生成；不能"模型想起来才渲染" |
| 没有 `tools/pre-execute` 拦截 | 审批前移到钩子（CC 的 `PermissionRequest`、opencode 的 `permission.ask`）或代理 |
| 没有 `schedule` | 定时能力靠 cron / 任务计划程序 + CLI |
| 没有 `webServer` | 面板必须 `memory-hub serve` 自开端口 |
| 没有 `sessionQuery` | 回顾式萃取退化为解析 transcript 文件（格式不稳定，**不保证**） |
| 多进程并发写 | 写锁租约（ADR-0009）成为必需，不是可选 |
| 请求可能要经过我们（代理模式） | 隐私面、缓存失效、流式转发——三件事都是 DSH 里不存在的负担 |
