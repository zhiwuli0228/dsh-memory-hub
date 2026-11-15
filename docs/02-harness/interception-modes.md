# 接入方式（Interception Modes）

> 回答一个问题：**"我们怎么把记忆塞到模型眼前、怎么把对话读出来"**——有四种方式，不是一种。
>
> 2026-11-14 新建。起因：初版 harness 标准只写了"钩子"和"MCP"，漏掉了**传输层**这一整条路径，导致把 Claude Code / Codex 误判为低档宿主。实际上大多数 CLI 都允许改 `base_url`，那是一个比钩子更"DSH 式"的入口。

---

## 0. 两条正交的轴

先分清两件被我一开始混在一起的事：

| 轴 | 问题 | 选项 |
| --- | --- | --- |
| **在途**（in-band） | 我们是否**插在模型请求与响应之间**？ | 是（代理） / 否（旁路） |
| **时机**（when） | 我们靠什么被唤起？ | 轮前 / 轮末 / 工具调用 / 无人 |

```text
                ┌─ 在途（in-band）───────────┐
                │  ① API 代理（改 base_url）  │  ← 能注入、能捕获、能改工具表
                └────────────────────────────┘
                ┌─ 旁路（out-of-band）───────┐
                │  ② 生命周期钩子             │  ← 能注入（宿主支持时）、能捕获
                │  ③ MCP / 工具               │  ← 只能被调用
                │  ④ CLI / 文件              │  ← 只能被人调用
                └────────────────────────────┘
```

**关键结论**：`②③④` 都要靠宿主"愿意叫我们"；`①` 不需要——**只要流量经过我们，我们就在场**。这是 `①` 为什么最接近 DSH 的原因。

## 1. 方式①：API 代理（最强，代价最大）

### 原理

```text
Claude Code ──ANTHROPIC_BASE_URL──▶ memory-hub proxy ──▶ api.anthropic.com
                                       │
                                       ├─ 请求：往 system / messages 注入紧凑索引
                                       └─ 响应：旁路记录本轮问答，供轮末提炼
```

### 哪些宿主能做

| 宿主 | 配置点 | 验证状态 |
| --- | --- | --- |
| Claude Code | `ANTHROPIC_BASE_URL` 环境变量；**已证实 100% 流量经过** | 文档 + 第三方实测 |
| Codex CLI | `config.toml` → `model_providers.<id>.base_url` | 文档 |
| opencode | provider 配置的自定义 `baseURL` | 文档 |
| Cline | OpenAI 兼容 base URL 设置项 | 文档 |
| Cursor / Continue | 各自的自定义端点设置 | 待核 |
| DSH | 可用但不必要（已有 `systemPrompt.context`） | — |

### 能做什么

- ✅ **轮前注入**：往请求体塞紧凑索引，与 DSH 自动预检等价。
- ✅ **轮末捕获**：读到本轮的 messages，可提炼候选（等价于 `capture`）。
- ✅ **工具注入**：往 `tools[]` 加工具、或把服务端工具换成普通工具（claudish 已验证）。
- ✅ **审批拦截**：可以拦下"模型要调 write 工具"这一步，改成先问人。

### 配置本身有多难：**一个变量**

对个人用户，最小配置是**只设一个环境变量**，不碰任何密钥：

```json
// ~/.claude/settings.json
{ "env": { "ANTHROPIC_BASE_URL": "http://127.0.0.1:7331" } }
```

这条能成立，是因为官方文档写明：**只设 `ANTHROPIC_BASE_URL`、不设网关凭证变量时，订阅登录仍是有效凭证**——"Setting only that variable, without a gateway credential, doesn't replace the subscription. Requests still route through the gateway, but a saved claude.ai login remains the active credential"。流量走网关，认证仍是用户的 claude.ai 登录。

代价是我们必须**逐字转发 `Authorization` 与 `anthropic-beta`**——后者在没有网关凭证时携带 OAuth capability，剥掉就 401。透明代理天然会转发，所以这一点不难。

**所以"配置复杂"这个担心方向不对。** 真正的成本在下面。

### 真正的成本（逐条有官方出处）

| # | 成本 | 事实 |
| --- | --- | --- |
| 1 | **注入可能触发 400 `bound to a different conversation`** | 这是 API 的 preserved thinking 校验：`system`、`tools` 或更早的 `messages` 与产出 thinking 的那次请求不一致就会失败。官方原话：**"A gateway that rewrites any of that content can cause the rejection itself"**。见下方专项 |
| 2 | 桌面 App 不读这个变量 | 走的是 Third-Party Inference 配置（`Help → Troubleshooting → Enable Developer Mode → Configure Third-Party Inference`），不是 `settings.json` |
| 3 | Remote Control 与语音输入直接不可用 | "Remote Control is also disabled while `ANTHROPIC_BASE_URL` points at a non-Anthropic host" |
| 4 | `/fast` 报网络错误 | 可用性检查**直连 `api.anthropic.com`**、不跟随 `ANTHROPIC_BASE_URL`；网络封锁直连时表现像断网，而推理其实正常 |
| 5 | `/feedback` 只写本地文件 | 不再上传，要人工转发 |
| 6 | HIPAA 配置不适用 | 经网关的会话不具备 HIPAA 配置资格 |
| 7 | 云端会话 / Slack 不适用 | 那两个面不吃 `env` 里的网关变量 |
| 8 | **多一个必须常驻的故障点** | 代理死在会话中途 = 用户的 Claude Code 直接不可用。以前是"记忆坏了"，现在会变成"工具打不开" |

第 8 条是最被低估的：**我们把一个可选功能的故障域，扩大成了主功能的故障域。**

### 专项：prompt caching 与 preserved thinking

两条**不同**的机制，别混：

- **缓存**（成本问题）：注入改变前缀 → cache miss → 输入成本上升。可用"放在缓存断点之后"部分缓解。
- **preserved thinking**（正确性问题）：改 `system` / `tools` / 更早的 `messages` → 400 `bound to a different conversation`。**这条不能缓解，只能绕。**

`cache_control` 必须逐字转发，且不能把块状 `system` 或消息 content 转成纯字符串（官方明确点出这会破坏配对）。

**因此本文件先前版本的"注入到本轮 user 消息的前缀块"是错的**——那样正是在改更早的 `messages`。安全的注入位置只剩：

1. **最后一条 user 消息的内容之内**（不动 `system`、不动 `tools`、不动更早的 `messages`）；
2. 或**完全不动请求体**，只在响应侧旁路捕获（放弃注入，只保留 capture）。

即便如此，第 1 种仍有风险：thinking 签名绑定的是整段对话，而被追加内容会让该轮请求与上一轮产出 thinking 的请求不同。**唯一稳妥的验证方式是实测**：开 thinking 的会话连续多轮，看是否出现 `bound to a different conversation`。

### 企业统一认证（SSO / 公司网关）：**不是复杂，是被拒绝**

这是本轮调研最硬的结论。如果公司用 MDM / `managed-settings.json` 下发了 `allowedProviders`，**我们的本地代理会被主动拒绝，不是需要申请，是代码层拒绝**：

> 把 `allowedProviders` 设为 `["customEndpoint"]` 并把网关的 `ANTHROPIC_BASE_URL` 写进同一份 managed settings 的 `env` 后，"Claude Code then refuses a session pointed anywhere else, including at Anthropic directly or **at a developer's own proxy**, and accepts `ANTHROPIC_BASE_URL` only with the value you set there."

其它四种企业形态会让情况更糟：

| 企业形态 | 后果 |
| --- | --- |
| `forceLoginMethod: "gateway"` / `forceLoginOrgUUID` | 与 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `apiKeyHelper` **不能共存**，直接报 "managed settings require a first-party login" |
| mTLS 客户端证书 | 我们要么持有证书并终止 TLS 重签，要么根本无法握手 |
| TLS 检查（MITM） | 需要 `NODE_EXTRA_CA_CERTS`，且**我们自己的代理进程**也要信任那个 CA |
| 上游是 Bedrock / Vertex / Foundry | **不是 Anthropic Messages 格式**：路径是 `/model/{model}/invoke` 或 `:rawPredict`，body schema 不同，我们的注入逻辑要写三套 |

还有一层：企业网关本身就是"路由"的实现者。我们要插进去，等于**在一条已经路由的链路上再加一层路由**，而 chain 上的每一跳都要过审计。

**结论**：企业场景的正确位置**不是开发者机器上的本地代理，而是公司网关里的一个中间件**。这条路需要和企业网关团队合作，不是我们能单方面交付的能力。

### 定位（修正）

**代理不是"可选加速器"，而是"个人极客场景的可选实验功能"。**

- 对个人、自付费用、只用 CLI 的用户：值得做，配置一个变量，能拿到接近 DSH 的体验——但要先解决 preserved thinking 那条。
- 对企业统一认证用户：**默认不提供**，文档明确写"你的环境不支持"，不要给一个会 400 的方案。
- 覆盖率提升的正解仍是 **② 钩子**（Claude Code 的 `UserPromptSubmit`、opencode 的 `chat.message`）——它们在请求进入客户端之后才注入，天然没有 preserved thinking 与网关策略的问题。

## 2. 方式②：生命周期钩子

宿主在固定时机执行我们注册的命令/函数。

- **Claude Code**：`SessionStart` / `UserPromptSubmit`（**每轮**，可向上下文追加内容）/ `PreToolUse` / `PostToolUse` / `Stop` / `SessionEnd`。这套比我最初以为的强得多——`UserPromptSubmit` 就是轮前注入点。
- **opencode**：插件 JS 钩子，`chat.message`（可改 message 与 parts）、`tool.execute.before/after`、`permission.ask`（可直接决定 ask/deny/allow）、`config`（可注入 MCP server 定义）。
- **DSH**：`agent/pre-step` + `systemPrompt.context`，等价物。

**相对代理的优势**：只拿宿主主动给的那一点数据，不碰全量流量；不会破坏 prompt 缓存（宿主自己决定放哪）；有官方契约定，不易随 wire 格式漂移。

**劣势**：需要每家写一个钩子适配器；不是所有宿主都有。

> opencode 的 `permission.ask` 值得单独注意：它能直接返回 `ask/deny/allow`，这意味着 **`memory_commit` 的审批在 opencode 里可以落在宿主自身的权限系统上**，不需要 CLI 兜底。

## 3. 方式③：MCP / 工具

模型主动调用。**跨宿主覆盖面最广，但采用率最低**——模型可以完全不调。

这就是"能读到记忆"与"会用到记忆"的差别。tabellio 的总结值得抄在本文件里：**MCP/CLI 决定「能不能用」，生命周期适配决定「会不会被用上」**。

## 4. 方式④：CLI / 文件

无任何集成时的兜底。人敲命令，或模型自己去读一份生成好的索引文件。

## 5. 选型决策表

| 你想要 | 选 |
| --- | --- |
| 覆盖面最大、实现成本最低 | **③ MCP**（默认，所有宿主） |
| 自动召回、和 DSH 对齐 | **① 代理**（若宿主支持改 base_url）或 **② 钩子**（若宿主有轮前钩子） |
| 审批不降级 | **② 钩子**（宿主权限系统） > **① 代理**（拦工具调用） > **④ CLI** |
| 零隐私顾虑 | **③ MCP** 或 **④ CLI**（永不看全量流量） |
| DSH | 原生 glue（`systemPrompt.context` + `tools/pre-execute`） |

**优先顺序**：`③` 全覆盖 → 对有轮前钩子的宿主加 `②` → 只有用户明确要求且接受代价时才上 `①`。

**不要**为了"统一"就用代理覆盖所有宿主——代理的维护成本和隐私面远高于它省下的适配器。

## 6. 组合，而不是互斥

实际部署通常是叠加的：

```text
Claude Code  = MCP（工具面） + UserPromptSubmit 钩子（轮前注入） + CLI（审批兜底）
opencode     = MCP（工具面） + 插件钩子（注入 + permission.ask 审批）
Codex/Cline  = MCP（工具面） + 指令文件（提示模型主动查）
要极致体验   = 上面任一 + 代理（自动注入 + 自动捕获）
```

**每一层都要能单独关掉**，关掉后剩下的仍可用——这是分层的目的。

## 7. 未验证清单

- `UserPromptSubmit` 追加的内容在上下文预算里占多少、超限时怎么截断。
- Claude Code 的 MCP 工具能否单独强制 `ask`（而不是每会话确认）。
- 各宿主改 `base_url` 后，**prompt 缓存是否真的失效**（需实测成本差）。
- opencode 插件钩子在 TUI 下能否叠加可视化面板。
- Codex CLI 当前版本对 MCP 与自定义 provider 的具体字段名。

确认后更新本文件与 [host-capability-matrix.md](host-capability-matrix.md) 的验证状态。
