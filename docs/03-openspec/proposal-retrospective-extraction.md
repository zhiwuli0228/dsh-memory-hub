# Proposal: 回顾式萃取（从会话记录里补漏）

## Status

Proposed（2026-11-08，未实现）

## 1. Problem

现在的写入只有三条路：模型在会话中主动 `memory_propose`、夜间 `memory_maintenance` 的确定性扫描、以及按工作区定时的 `distill` 晋升。三条路都有同一个盲区：**只要模型在当下没想到要记，那次会话里被验证过的坑、做过的取舍、踩错的路径就永久丢了。**

真实损失的样子：

- 用户说「上次那个上传超时最后是怎么解决的」，模型只能重新翻代码或重新试错。
- 一次会话里改了 3 个方案，最后定的是第 3 个；会话结束时没有 `memory_propose`，于是「为什么否掉前两个」没了。
- 蒸馏只做**跨作用域晋升**（project → core），不会在同一作用域里补漏。

LongMemEval 的结论也指向这里：写侧失败（漏记、覆盖关键信息）发生在检索之前，且按轮粒度的写入优于按会话摘要。

## 2. Goal

提供一个**模型可调用、确定性、只读会话**的回顾入口：

- 新增模型工具 `memory_reflect`：读取**已结束的会话**，返回一段有上限的 digest（用户诉求 + 助手结论 + 失败的工具调用），并明确提示「据此 `memory_propose`」。
- 插件本身不调用任何 LLM、不生成正文、不自动建候选；候选仍由模型显式 `memory_propose` 产生。
- 同一会话重复调用不重复产出：记录水位，已回顾过的会话默认跳过。
- 只能读取 `cwd` 落在本 Hub 已配置工作区内的会话，避免把无关会话带进上下文。
- 宿主没有 `sessionQuery` 时优雅降级：工具返回 `unavailable: true`，不报错、不影响其他工具。

## 3. Scope

包含：

- 新增 `src/reflect.ts`：`SessionDigestSource` 接口 + `HostSessionDigestSource`（通过 `ctx.sessionQuery`）+ `NullSessionDigestSource`。
- digest 规则：只保留 `user` 消息、`assistant` 的最终文本、失败的工具调用（名称 + 一行错误）；丢弃系统提示、成功工具输出、思考过程；总字符数受 `policy.reflect.max_chars` 限制（默认 8000）。
- 新增模型工具 `memory_reflect`，参数 `session_id?`、`limit?`（1..3）、`dry_run?`。
- 新增 `records/reflect-state.json`：`{ version, sessions: { <sessionId>: { reflectedAt, digestHash, proposals: [PRO-…] } } }`，最多保留 200 条，按 `reflectedAt` 淘汰。
- 新增 `policy.reflect.enabled`（默认 `true`）、`policy.reflect.max_chars`（默认 8000）、`policy.reflect.max_sessions`（默认 3）、`policy.reflect.min_messages`（默认 4）。
- 面板「能力」页增加第 11 个工具说明（中英双语）。
- `docs/KNOWLEDGE-FORMAT.md` 的 `source_refs` 一节补一句：回顾式萃取的推荐引用形态是 `session:<id>#<from>-<to>`，区间取 digest 里标注的事件序号。

## 4. Out of Scope

不包含：

- 插件侧调用模型做摘要或抽取（会引入 API key、联网、成本与不可审计）。
- 自动创建候选、自动 commit、修改任一知识条目。
- 定时回顾（复用 `distill` 的 DSH `schedule` 通道放到后续提案；本提案只做工具与状态）。
- 直接解析 `~/.dsh/sessions/**/session.v4.jsonl.zstd`：那是宿主内部格式，且 zstd 在 Node 20 不可用。
- 跨工作区读取；读 subagent 委派会话。
- 面板新增任何写端点或触发按钮（面板仍只有「待审批」的批准/拒绝）。

## 5. Affected Modules

- runtime（服务注入、工具注册）
- store（读写 `records/reflect-state.json`）
- config（`policy.reflect.*`）
- hub（工作区根集合，用于 cwd 过滤）
- tools（`memory_reflect`）
- client.js（能力说明）
- docs

## 6. Storage Impact

- `config.yaml`：新增 `policy.reflect` 段；缺失时使用默认值，旧配置可直接启动。
- `knowledge/<type>/<id>.md`：不写。
- `pending/PRO-*.md`：不直接写（由模型后续 `memory_propose` 产生）。
- `records/ledger.jsonl`：新增 `reflect.read` 事件（`sessionId`、`events`、`chars`、`proposals`），只追加。
- `records/sequences.json`：不变。
- `history/<type>/<ID>@v<N>.md`：不写。
- 新增 `records/reflect-state.json`（派生物，可删除；删除后退化为「可重复回顾」）。

## 7. Constraints

- [x] 不引入强制性数据库。
- [x] 默认不使用向量库。
- [x] `memory_commit` 仍需 DSH 审批。
- [x] 文件是真相：digest 只是上下文投影，`reflect-state.json` 可丢。
- [x] 不联网、不调用模型、不读环境变量里的密钥。

## 8. Risks

- **digest 质量依赖宿主事件形状**：若 DSH 的 `SessionEvent` 联合类型变化，适配层要跟着改；用窄接口隔离，形状不匹配时降级为 `unavailable` 而不是崩溃。
- **隐私**：会话里可能含密钥或他人信息。缓解：cwd 白名单 + 只取用户消息/最终答复 + 日志不落 digest 正文（只落字符数与事件区间）。
- **重复回顾**：以 `digestHash`（对 digest 文本做 sha256）判断内容是否变化；未变化则跳过并提示 `already-reflected`。
- **模型不调用**：工具是「发现性」问题而非能力问题。先用 `memory_status` 增加一行「最近未回顾会话数」，再观察 7 天调用率决定是否加 scheduled 回顾。
- **成本**：一次 digest 约 2–3k token；`max_sessions` 默认 3，避免一次塞太多。

## 9. Verification

- 单元测试（`tests/reflect.test.ts`）：
  - 用假 `SessionDigestSource` 验证 digest 只含 user/assistant-final/失败工具，且截断到 `max_chars`。
  - `min_messages` 不足时返回 `skipped: 'too-short'`。
  - 同一 `digestHash` 第二次调用返回 `already-reflected`，不重复写 state。
  - cwd 不在工作区白名单时拒绝，并给出 `session-not-in-workspace`。
  - `enabled: false` 时工具返回 `disabled`，不读写 state。
- 集成测试：`memory_reflect` 后 `memory_propose` 的 `source_refs` 能通过校验；账本出现 `reflect.read`。
- 宿主冒烟：在有 `sessionQuery` 的 Desktop 里回顾一次真实会话；在无该服务的场景确认返回 `unavailable` 而不是报错。
- 人工验收（7 天）：回顾产生的候选被批准率 ≥ 40%；与既有知识重复的候选 < 20%。

## 10. Tasks

### T-001 会话 digest 适配层

- 目标：`src/reflect.ts` 定义 `SessionDigestSource`，实现宿主版本与空实现。
- 依赖：`ctx.sessionQuery`（`listSessions` / `readSession`）；缺失时不影响插件启动。
- 验收：假 source 单测通过；真实宿主能列出最近会话并读到事件。
- 相关文件：`src/reflect.ts`、`src/runtime.ts`、`src/types.ts`。

### T-002 `memory_reflect` 工具

- 目标：注册工具、参数校验、scope 与 cwd 过滤、水位与 `digestHash`。
- 依赖：T-001。
- 验收：单测覆盖正常/过短/已回顾/越权/关闭；`npm run check` 通过。
- 相关文件：`src/tools.ts`、`src/service.ts`、`tests/reflect.test.ts`。

### T-003 配置、账本与面板说明

- 目标：`policy.reflect.*`、`reflect.read` 账本事件、`memory_status` 的未回顾计数、能力页第 11 项。
- 依赖：T-002。
- 验收：旧 `config.yaml` 无该段也能启动；账本事件字段有测试；面板能力页中英文都有。
- 相关文件：`src/config.ts`、`src/ledger.ts`、`src/service.ts`、`client.js`、`locale/*.json`。

### T-004 文档

- 目标：`KNOWLEDGE-FORMAT.md` 补引用形态；`current-state.md` 与 `roadmap.md` 更新。
- 依赖：T-003。
- 验收：文档与实现一致，无未实现承诺。

## 11. Open Questions

- `SessionEvent` 的稳定子集到底是哪几个 kind？实现前需要一次宿主核查（本文按 `user/message`、`assistant/message`、工具失败三类写适配器，其余忽略）。
- 是否需要在 panel 里显示「最近可回顾的会话」列表（只读）？本提案不做，先看工具调用率。
