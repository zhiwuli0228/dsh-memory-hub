# Proposal: 回顾式萃取（定时回顾本工作区与子工作区会话）

## Status

Implemented（V0.7 WIP，2026-11-08）。实现注记：为降低学习成本，`memory_reflect` 不依赖 `reflect.enabled`——`enabled: false` 只控制定时任务，手动回顾始终可用；越权会话返回 `INVALID_INPUT`（`session ... is not an ended session owned by workspace ...`）。定时任务落在 `src/reflect.ts`，与 `distill.ts` 共用 `reconcileScheduleEntries`，未单独新建 `reflect-schedule.ts`。

## 1. Problem

现在的写入只有三条路：模型在会话中主动 `memory_propose`、夜间 `memory_maintenance` 的确定性扫描、以及按工作区定时的 `distill` 晋升。三条路都有同一个盲区：**只要模型在当下没想到要记，那次会话里被验证过的坑、做过的取舍、踩错的路径就永久丢了。**

真实损失的样子：

- 用户说「上次那个上传超时最后是怎么解决的」，模型只能重新翻代码或重新试错。
- 一次会话里改了 3 个方案，最后定的是第 3 个；会话结束时没有 `memory_propose`，于是「为什么否掉前两个」没了。
- 蒸馏只做**跨作用域晋升**（project → core → global），不会在同一工作区里补漏。

LongMemEval 的结论也指向这里：写侧失败（漏记、覆盖关键信息）发生在检索之前，且按轮粒度的写入优于按会话摘要。

## 2. Goal

把「回顾」做成金字塔蒸馏的一个**平级环节**：定时任务读会话、模型据此 propose，人工审批。

- 新增确定性工具 `memory_reflect`：读取**本工作区名下已结束的会话**，返回有上限的 digest（用户诉求 + 助手结论 + 失败的工具调用）。
- 新增按工作区的定时回顾（复用 Host `schedule` 服务，与 `distill` 同一套机制）：每个核心工作区、每个子工作区各一条任务，到点在各自 root 下新建会话执行。
- **覆盖金字塔**：核心工作区的任务只回顾 cwd 落在核心 root、且不属于任何子工作区的会话；每个子工作区的任务回顾自己的会话。一个会话只归属**最深匹配的已配置 root**，不会被回顾两次。
- 回顾只写本工作区作用域（L1 `project:<self>`）；向上晋升仍由 `distill` 负责，两条链路不重叠。
- 插件本身不调用 LLM、不生成正文、不自动建候选；同一个会话用 `digestHash` 去重。
- 宿主没有 `sessionQuery` 时优雅降级：工具返回 `unavailable: true`，定时任务对该工作区跳过并记录一次 warn。

## 3. Scope

包含：

- 新增 `src/reflect.ts`：
  - `SessionDigestSource` 接口 + `HostSessionDigestSource`（`ctx.sessionQuery.listSessions` / `readSession`）+ `NullSessionDigestSource`。
  - `ownerWorkspaceOf(cwd, roots)`：按最长前缀匹配，把会话归给核心或某个子工作区。
  - digest 规则：只保留 `user` 消息、`assistant` 最终文本、失败的工具调用（名称 + 一行错误）；丢弃系统提示、成功工具输出、思考过程；总字符数受 `policy.reflect.max_chars` 限制（默认 8000）。
- 新增模型工具 `memory_reflect`：参数 `session_id?`、`limit?`（1..3）、`dry_run?`；默认挑选本工作区名下、`lookback_days` 内、未回顾过的最近会话。
- 新增 `src/reflect-schedule.ts`：`reflectPrompt()`、`desiredReflectSchedules()`、`reconcileReflectSchedules()`，与 `distill.ts` 同构（标题前缀 `memory-hub:reflect:`，target 支持 `new` / `session`，配置变更后 reconcile，瞬时错误重试一次）。
- 每个工作区新增 `reflect:` 配置块（与 `distill:` 并列、互不影响）：
  - `enabled`（默认 `false`）、`time`（默认 `04:30`，排在维护 03:00 与蒸馏 03:30/04:00 之后）、`target`（默认 `new`）、`session_id?`、`agent_preset?`、`max_candidates`（默认 5）、`lookback_days`（默认 30）。
- 全局 `policy.reflect.max_chars`（默认 8000）、`max_sessions`（默认 3）、`min_messages`（默认 4）。
- 新增 `records/reflect-state.json`：按会话记录 `reflectedAt` / `digestHash` / `proposals`，最多 200 条，按时间淘汰。
- 面板「能力」页增加第 11 个工具说明（中英双语）。
- `docs/KNOWLEDGE-FORMAT.md` 补回顾式萃取的引用形态：`session:<id>#<from>-<to>`；`docs/06-operations/` 新增/扩写回顾任务的开关、时间、排障。

## 4. Out of Scope

不包含：

- 插件侧调用模型做摘要或抽取（会引入 API key、联网、成本与不可审计）。
- 自动创建候选、自动 commit、修改任一知识条目。
- **跨作用域回顾**：核心任务不读子工作区会话、也不替子工作区写 `project:<child>` 候选（作用域可见性不允许，且会与蒸馏重叠）；子工作区会话的补漏由它自己的任务完成。
- 直接解析 `~/.dsh/sessions/**/session.v4.jsonl.zstd`：那是宿主内部格式，且 zstd 在 Node 20 不可用。
- 读 subagent 委派会话（这类会话没有独立工作区，且内容属于父会话）。
- 面板新增任何写端点或触发按钮（面板仍只有「待审批」的批准/拒绝）。

## 5. Affected Modules

- runtime（服务注入、工具注册、定时任务 reconcile）
- config（`reflect:` 工作区块与 `policy.reflect.*`）
- store（读写 `records/reflect-state.json`）
- hub（工作区 root 集合与归属匹配）
- tools（`memory_reflect`）
- ledger（`reflect.read` 事件）
- client.js（能力说明）
- docs

## 6. Storage Impact

- `config.yaml`：新增每个工作区的 `reflect:` 段与 `policy.reflect.*`；缺失即默认，旧配置可直接启动。
- `knowledge/<type>/<id>.md`：不写。
- `pending/PRO-*.md`：不直接写（由模型随后 `memory_propose` 产生，带 `reflection` 标签）。
- `records/ledger.jsonl`：新增 `reflect.read` 事件（`sessionId`、`workspaceId`、`events`、`chars`、`proposals`），只追加。
- `records/sequences.json`：不变。
- `history/<type>/<ID>@v<N>.md`：不写。
- 新增 `records/reflect-state.json`（派生物，可删除；删除后退化为可重复回顾）。

## 7. Constraints

- [x] 不引入强制性数据库。
- [x] 默认不使用向量库。
- [x] `memory_commit` 仍需 DSH 审批。
- [x] 文件是真相：digest 只是上下文投影，`reflect-state.json` 可丢。
- [x] 不联网、不调用模型、不读环境变量里的密钥。
- [x] 定时任务只产出候选，永不 `memory_commit`。

## 8. Risks

- **digest 质量依赖宿主事件形状**：若 DSH 的 `SessionEvent` 联合类型变化，适配层要跟着改；用窄接口隔离，形状不匹配时降级为 `unavailable` 而不是崩溃。
- **隐私**：会话里可能含密钥或他人信息。缓解：只读本工作区 root 下的会话 + 只取用户消息/最终答复 + 日志不落 digest 正文。
- **重复回顾**：`digestHash` 未变化则跳过；任务重跑（例如宿主重启）不会产生重复候选。
- **任务数量**：每个工作区一条任务，5 个工作区就是 5 条。缓解：默认 `enabled: false`，按需开启；时间错开由用户配置（默认同一时刻也只会串行执行，因为 `reconcile` 逐条创建）。
- **作用域误判**：root 嵌套（子工作区在核心目录下）时用最长前缀归属；配置里 root 重复或互相包含要在 reconcile 时 warn 一次。
- **模型不调用工具**：`memory_reflect` 是发现性问题。缓解：定时任务提示词是确定性步骤（第 2 步固定调用），人工也可在会话里直接要求「回顾一下」。
- **成本**：每条会话 digest 约 2–3k token；`max_sessions` 默认 3 + `lookback_days` 默认 30，避免一次塞太多。

## 9. Verification

- 单元测试（`tests/reflect.test.ts`）：
  - digest 只含 user/assistant-final/失败工具，且截断到 `max_chars`；`min_messages` 不足时 `skipped: 'too-short'`。
  - 归属匹配：核心 root 下的普通会话归核心；子工作区 root 下的会话归子工作区；嵌套时取最长前缀；root 外的会话被拒绝。
  - 同一 `digestHash` 第二次返回 `already-reflected`；`enabled: false` 返回 `disabled`；越权 `session_id` 返回 `session-not-in-workspace`。
- 定时任务测试（`tests/reflect-schedule.test.ts`）：
  - `desiredReflectSchedules` 只为 `enabled: true` 且有 root 的工作区生成；标题稳定；时间与 `target` 正确。
  - `reconcile` 幂等：重复调用不重复建任务；关闭后删除对应任务；`session` 目标缺失时跳过并记 warn。
  - 提示词包含固定步骤与 `project:<self>`、`max_candidates`、`memory_commit` 禁令。
- 集成：`memory_reflect` → `memory_propose`（`source_refs` 通过校验）→ 账本出现 `reflect.read`。
- 宿主冒烟：Desktop 上开一个工作区的 `reflect.enabled`，确认「自动化任务」栏出现任务、到点执行、候选进入待审批；无 `sessionQuery` 的宿主不报错。
- 人工验收（7 天）：回顾产生的候选被批准率 ≥ 40%；与既有知识重复的候选 < 20%。

## 10. Tasks

### T-001 会话 digest 与归属

- 目标：`src/reflect.ts`（digest 规则 + `SessionDigestSource` + 归属匹配）。
- 依赖：`ctx.sessionQuery`（`listSessions` / `readSession`）；缺失时不影响插件启动。
- 验收：假 source 单测通过；嵌套 root 归属正确；真实宿主能列出会话。
- 相关文件：`src/reflect.ts`、`src/runtime.ts`、`src/types.ts`。

### T-002 `memory_reflect` 工具

- 目标：注册工具、参数校验、本工作区过滤、水位与 `digestHash`。
- 依赖：T-001。
- 验收：单测覆盖正常/过短/已回顾/越权/关闭；不写任何知识文件。
- 相关文件：`src/tools.ts`、`src/service.ts`、`tests/reflect.test.ts`。

### T-003 配置、账本、面板说明

- 目标：`reflect:` 工作区块、`policy.reflect.*`、`reflect.read` 账本事件、`memory_status` 未回顾计数、能力页第 11 项。
- 依赖：T-002。
- 验收：旧 `config.yaml` 无该段可启动；账本字段有测试；中英文能力说明齐全。
- 相关文件：`src/config.ts`、`src/ledger.ts`、`src/service.ts`、`client.js`、`locale/*.json`。

### T-004 定时任务

- 目标：`src/reflect-schedule.ts` + runtime reconcile（启动、配置变更、dispose）+ 确定性提示词。
- 依赖：T-003。
- 验收：`tests/reflect-schedule.test.ts` 覆盖幂等、删除、缺失 session 跳过；与 distill 任务标题不冲突；关闭后不残留。
- 相关文件：`src/reflect-schedule.ts`、`src/runtime.ts`、`src/distill.ts`（复用 target 构造）、`tests/reflect-schedule.test.ts`。

### T-005 文档

- 目标：`KNOWLEDGE-FORMAT.md` 引用形态；`docs/06-operations/` 回顾任务开关与排障；`current-state.md`、`roadmap.md` 更新。
- 依赖：T-004。
- 验收：文档与实现一致，写明与蒸馏的分工（回顾写 L1，蒸馏上行）。

## 11. Open Questions

- `SessionEvent` 的稳定子集到底是哪几个 kind？实现前需要一次宿主核查（本文按 `user/message`、`assistant/message`、工具失败三类写适配器，其余忽略）。
- 定时任务默认同一时刻（04:30）还是按工作区错开（04:30、04:35…）？首版沿用 distill 的「各工作区自己配置」，默认值相同；如果观察到并发压力再自动错开。
- 是否需要在面板里列出「最近可回顾的会话」（只读）？本提案不做，先看定时任务的候选质量。
