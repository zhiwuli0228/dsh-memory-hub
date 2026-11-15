# ADR-0010: 面板不绑死在 DSH——路由单一实现、双挂载，MCP + CLI 才是通用面

## Status

Proposed（2026-11-14）

## Context

当前面板的三件事是 DSH 专属的：`client.js`（React 客户端模块，依赖 `@deepseek-ai/dsh-client-ui-layout` / `-sidebar`）、`runtime.ts` 里 `ctx.inject(['webServer'])` 的 15 行登记代码、以及 DSH 的 `clientModules` 广告机制。Claude Code / opencode / Cline / Codex 没有这三样东西，面板直接不可用。

但**搬出去的成本比想象中低得多**，因为路由处理函数本身已经是 Node `http` 形态，不是 DSH 形态：

- `handleHttp(request, response)` 用的是 `request.socket.remoteAddress`、`request.on('data')`、`response.writeHead/end`（`runtime.ts:1476-1525`）；
- DSH 的 `webServer.register({ kind: 'exact', path, handler })` 只是把原生 `IncomingMessage`/`ServerResponse` 递进来；
- `client.js` 用绝对路径 `/dsh-memory-hub/api/*` 同源 fetch（`client.js:14-19`）。

也就是说：**API 与核心逻辑已经可移植，锁死在 DSH 的只有"登记"和"渲染"两层。**

同时必须承认另一半事实：CC / opencode 里没有 `agent/pre-step` 这类轮前注入点，MCP 工具只能"被调用"。参照 [tabellio 的宿主契约调研](../../05-domain/remote-provider-patterns-2026.md)结论——**MCP/CLI 决定"能不能用"，生命周期适配决定"会不会被用上"**。所以"全 agent 通用"的成立条件不是"面板能跑"，而是**工具面先通用，面板其次**。

## Decision

### 1. 三层，依赖方向单向

```text
core/            service · store · search · lock · ledger         ← 零宿主依赖，不得 import DSH
  ↑
transport/       mcp-stdio · http-router · cli                    ← 只依赖 core
  ↑
host-glue/       dsh-plugin（webServer 登记 + client module）      ← 唯一允许 import DSH 的地方
```

**规则：`core` 与 `transport` 不得出现 `ctx.`、`@deepseek-ai/*`、`clientModules`、`webServer`。** 审计方式：在 `tests/` 加一条静态断言，扫 `src/`（除 `dsh/` 子目录）是否出现 `@deepseek-ai/` 字符串。

### 2. HTTP 路由抽成唯一实现，双挂载

把 `handleHttp` 从 `runtime.ts` 抽到 `src/http/router.ts`，签名为：

```ts
export function createMemoryRouter(deps: { service, panels }): (req: IncomingMessage, res: ServerResponse) => Promise<void>
```

两个挂载点复用同一份 router：

| 挂载 | 触发 | 适用宿主 | 是否需要端口 |
| --- | --- | --- | --- |
| `webServer.register` | 装插件即生效 | DSH（**默认，零配置**） | 否 |
| `memory-hub serve` | 手动/任务启动 | CC / opencode / Cline / 任何开了浏览器的人 | 是（127.0.0.1） |

**关键约定：`serve` 默认不启动。** 装插件不等于开端口——端口是显式动作，符合最小暴露。

### 3. MCP stdio 是通用工具面（优先级高于 UI）

`memory-hub mcp` 起一个 MCP stdio server，暴露同一套 service 方法（`search` / `get` / `propose` / `inbox` / `status` / `cite` / `close_task`）。CC 挂 `~/.claude.json`，opencode/Cline/Codex 挂各自配置，DSH 可选（DSH 已有原生 `memory_*` 工具，MCP 是冗余但可作对照）。

**为什么先做 MCP 而不是先做端口**：没有 MCP，CC 里的模型连一条记忆都读不到，面板再漂亮也没有数据可看。

### 4. CLI 是第三种界面（人类审批的通用路径）

```text
memory-hub status [--json]              只读体检
memory-hub search <query> [--limit 5]   检索（给人和 agent 都能用）
memory-hub get <ID> [--section 结论]    按需读取
memory-hub inbox [--approve <ID>...]    待审批列表 / 批量批准
memory-hub serve [--port 7331|0]        起本地面板
memory-hub mcp                          起 MCP stdio server
```

CC / opencode 没有面板时，`inbox --approve` 就是审批路径——**批准权仍归人**（终端里人敲命令），与 ADR-0003 一致。

### 5. 默认端口与发现

- 默认 `127.0.0.1:7331`；`--port 0` 用临时端口（见安全一节，临时端口是有效防线）。
- 启动后把实际地址写 `records/server.json`：`{ url, pid, startedAt, tokenFile }`，并打印 `memory-hub panel: http://127.0.0.1:7331/?t=<token>`。
- **只允许 loopback**。`config.yaml` 里没有 `allow_remote: true` 时，`host` 只能是 `127.0.0.1` / `::1`，配 `0.0.0.0` 直接拒绝启动并报错。
- 端口被占用：不静默改端口，报错并提示 `--port 0`。

### 6. 安全模型（端口一开，攻击面就变了）

现有守卫只覆盖了审批端点（`x-dmh-review` + Origin + loopback）。固定端口会引入 **DNS rebinding**（页面把 `evil.com` 解析到 127.0.0.1 后直接打本机端口）。三层防护，全部在 router 里、与挂载无关：

1. **Host 头白名单**：`Host` 必须是 `127.0.0.1:<port>` / `localhost:<port>` / `[::1]:<port>`，否则 421。这是 rebinding 的正解（攻击者域名过不了 Host 校验）。
2. **Origin 本地**：带 `Origin` 时必须本地，否则 403（沿用现有 `isLocalOrigin`）。
3. **写操作令牌**：所有 `POST` 需 `x-dmh-token`，值来自 `records/server-token`（0600）。服务端渲染面板 HTML 时把 token 注入页面（同源页面可读，跨源脚本读不到）。DSH 内嵌挂载不需要 token（没有跨源面）——但**校验逻辑同一份**，内嵌时由 glue 注入一个哨兵值。

`records/server-token` 不进 git、不进备份包、不在日志里出现。

### 7. 写锁：standalone 是正常写者，不是特权进程

`memory-hub serve` 启动的 Hub 就是一个普通进程，与 DSH 进程按既有租约 + fencing 互斥（ADR-0009）。拿不到锁时 `readOnlyReason: lock`，面板顶部显示"另一进程正持有写锁"，审批按钮禁用并解释原因。**不做"面板优先"特权**——那会破坏 ADR-0009 的单写者不变量。

DSH 与 `serve` 同时运行是**支持但要解释**的状态：常见做法是只留一个。文档里明确写"两个进程同时开会让其中一个只读"。

### 8. UI 渲染层允许两套，API 只允许一套

| | DSH 内嵌 | standalone |
| --- | --- | --- |
| 渲染 | React client module（现有，功能全） | 静态 HTML/JS（`site/panel/`，最小可用：总览 / 待审批 / 配置） |
| 数据 | 同源 `/dsh-memory-hub/api/*` | 同源，同一套路径 |
| 维护成本 | 高 | 刻意做窄 |

**这是本 ADR 唯一接受的重复。** 理由是渲染必然跟着宿主走（React 组件树 vs 纯 DOM），而 API 契约才是真正的成本中心。硬规则：**standalone 面板不允许新增任何内嵌面板没有的端点**；反向允许（内嵌可以先有）。

## Consequences

**正面**

- 面板从"DSH 专属"变成"任何宿主 + 浏览器"，而改动集中在 15 行登记代码 + 一次 router 抽取。
- CC / opencode 获得 MCP 工具面与 CLI 审批路径，`memory_search` 在哪儿都能用。
- 核心被迫保持无宿主依赖，未来接第三个宿主不需要动 core。

**代价与风险**

1. **两套 UI**：standalone 面板功能永远落后于 DSH 面板，必须接受。缓解——它只做三件事（看总览、批候选、改配置）。
2. **端口是长期攻击面**：token 泄漏、日志误打印、备份外泄都会变成事故。缓解——token 只在 `records/`（已在 `.gitignore` 语义之外，需确认）、0600、不进日志；文档写清"不要把 `records/server-token` 给别人"。
3. **生命周期**：Windows 没有 systemd，`serve` 停不掉会留孤儿进程占端口。缓解——写 pid 到 `records/server.json`，`memory-hub serve --stop` 读 pid 优雅停；文档给"任务计划程序"示例。
4. **CC 的采用率天然低**：没有轮前注入点，模型可以完全不调 `memory_search`。缓解——`CLAUDE.md` / `AGENTS.md` 指令 + CC 的 `SessionStart` 钩子做一次性提示；文档**不承诺**"自动注入"在非 DSH 宿主成立。
5. **`webServer` 服务缺失时静默降级**：DSH 某些模式下没有 `webServer`，面板就不出现。缓解——`status` 里明确报 `panel: { mounted: false, reason }`，并提示用 `serve`。

## Alternatives Considered

- **A. 继续只做 DSH 内嵌**：放弃"全 agent 通用"的目标，且越往后 client.js 越重。否决。
- **B. 默认开固定端口（8080 / 3000）**：端口冲突高频，且固定端口 + 反射型攻击面更大。否决；改为"显式 `serve` + 默认随机可用、固定 7331"。
- **C. 做成 Electron / Tauri 桌面应用**：多一个需要签名的二进制、多一套更新渠道，且仍然需要 HTTP API。与"零依赖、可 git 管理"的定位冲突。否决（可作为未来独立分发形态，不影响本 ADR）。
- **D. 用 MCP 的 resources / prompts 承载面板**：MCP 没有渲染能力，Zed 明确只支持 Tools 与 Prompts。否决。
- **E. 面板只提供 CLI 输出（`--json` 给脚本）**：最省事，但"人审候选"这种需要看 diff 的动作在终端里很难受，会实际降低审批率。作为兜底保留，不做主线。

## 分阶段

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| S1 | router 抽取 + DSH 双挂载保持等价 | 现有面板测试全绿，`handleHttp` 只被 router 调用 |
| S2 | `memory-hub mcp`（stdio）+ 3 个宿主配置片段 | 在 CC 里能 `memory_search` / `memory_get` |
| S3 | `memory-hub serve` + Host/token 守卫 + `records/server.json` | 非 loopback 拒绝、Host 伪造 421、无 token 401 |
| S4 | standalone 静态面板（总览 / 待审批 / 配置） | 能从浏览器批准一条候选，账本 `panel:human` |

## 与既有 ADR 的关系

- **不推翻 ADR-0003（人审写入）**：三条审批路径（DSH 原生审批 / DSH 面板 / CLI + standalone 面板）都要求人，模型永不自批。
- **不推翻 ADR-0009（写锁租约）**：`serve` 是普通写者，不享受特权。
- **与 [proposal-remote-providers](../03-openspec/proposal-remote-providers.md) 正交**：远端接入是"记忆往哪同步"，本 ADR 是"界面/工具面在哪暴露"。两者共用同一份 config 写入路径。
