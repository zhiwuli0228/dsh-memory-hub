# Proposal: 时效字段与过期降权

## Status

Accepted（2026-11-08 评审确认：aging 窗口取 90 天；待实现）

## 1. Problem

知识现在只有 `created_at` / `updated_at`，回答不了三个问题：

- 这条事实**从什么时候开始成立**（可能是几周前的事后补记，`created_at` 不等于 `valid_from`）。
- 这条事实**什么时候不再可信**（版本号、供应商政策、内部流程都会变）。
- 这条事实**上次被确认是什么时候**（一年没复核的条目和昨天刚确认的条目同权参与检索）。

真实后果：模型把「2026 年 3 月的发布流程」当成现行流程引用；面板列表里新旧条目混在一起，人工也分不出哪些该复核。HorizonBench 的失败模式就是这个——系统选中已被改掉的旧值。

## 2. Goal

- 知识条目支持三个**可选**时间字段：`valid_from`、`expires_at`、`last_verified`。
- 检索与预检按**新鲜度确定性降权**：过期不删除、不自动废弃，只降权并标记。
- 面板与预检包能一眼看出 `fresh / aging / stale / 未生效`。
- 老文件（没有新字段）**不需要迁移**：以 `updated_at` 作为 `last_verified` 的回退。这会带来一个有意的行为变化——超过 `aging_days` 未更新的条目开始按 0.85 降权（想保持现状就把 `aging_decay` 设为 1.0）。

## 3. Scope

包含：

- `frontmatter.ts` 的 `knowledgeFrontmatterSchema` 增加三个可选字段（复用 `timestampSchema`，必须带时区）。
- `KnowledgeRecord` 增加对应字段（`validFrom: string | null` 等），`serializeKnowledgeFile` 只在非空时输出，避免给老文件平白加行。
- `types.ts` 增加派生状态 `TemporalState = 'fresh' | 'aging' | 'stale' | 'scheduled'`，在读取时计算，**不落盘**。`superseded` 不是时效状态，由 `status` 直接表达。
- 检索降权（`search.ts`，在类型加权之前乘系数）：
  - `scheduled`（`valid_from` 在未来）：× 0.3，仍可检索。
  - `stale`（`expires_at` 已过）：× 0.6，仍可检索。
  - `aging`（`last_verified`/`updated_at` 超过 `policy.temporal.aging_days`，默认 90 天）：× 0.85。
  - `fresh`：× 1.0。
- 预检（`service.preflight`）：
  - 命中项带 `temporal` 标记与一行说明（`过期于 2026-08-01` / `2026-12-01 起生效`）。
  - `scheduled` 默认不进入预检包（避免把未来事实当现行事实注入），但在 `memory_search` 中仍可见。
- `memory_propose` 增加可选参数 `valid_from`、`expires_at`、`last_verified`；`memory_commit` 提交时：
  - 三者缺失时：`last_verified` 回退为提交时刻；`valid_from` / `expires_at` 保持 `null`。
  - 校验：`valid_from <= expires_at`（两者都有时）、`last_verified` 不得晚于当前时间 + 5 分钟。
- `memory_maintenance` 报告新增「时效」段落：`stale` / `aging` / `scheduled` 计数与 ID 列表（只报告，不自动提案）。
- 面板「知识」列表新增「时效」列（chip + tooltip 显示三个时间）；「待审批」卡片展示三个字段。
- `docs/KNOWLEDGE-FORMAT.md` 字段表补三行，并说明 `format` 保持 `1`（新增字段都是可选、向后兼容）。

## 4. Out of Scope

不包含：

- 自动修改条目、自动 `deprecate`、自动刷新 `last_verified`（复核必须是人或模型显式动作）。
- 定时提醒/日历式复核（另立提案）。
- 双时间（valid time + transaction time）完整模型；本提案只做「事实有效期 + 最近确认」两个维度，`superseded_by` 由并行的 merge 提案提供。
- 按时间过滤的检索参数（`as_of`）；先只做降权与标记，等真实需求。
- 修改 `format` 版本号；也不改动 `applies_to` 的语义。

## 5. Affected Modules

- frontmatter（解析/序列化/校验）
- store（写入时规范化字段）
- search（降权系数）
- service（预检标记、propose/commit 参数）
- maintenance（时效报告段落）
- config（`policy.temporal.*`）
- tools（`memory_propose` 三个可选参数）
- client.js（时效列与 chip）
- docs

## 6. Storage Impact

- `config.yaml`：新增 `policy.temporal.aging_days`（90）、`stale_decay`（0.6）、`aging_decay`（0.85）、`scheduled_decay`（0.3）。
- `knowledge/<type>/<id>.md`：新条目可带三字段；老条目不变，除非被更新时显式补齐。
- `pending/PRO-*.md`：提案带三字段（可选）。
- `records/ledger.jsonl`：`knowledge.committed` 事件附带 `temporal` 快照（不新增事件类型）。
- `records/sequences.json`：不变。
- `history/<type>/<ID>@v<N>.md`：不变（旧版本自然保留旧时间字段）。

## 7. Constraints

- [x] 不引入强制性数据库。
- [x] 默认不使用向量库。
- [x] `memory_commit` 仍需 DSH 审批。
- [x] 文件是真相：派生状态实时计算，不写回、不新增状态机。
- [x] 不删除任何过期条目；过期只是降权与标记。
- [x] 老文件零迁移：缺字段即回退到 `updated_at`。

## 8. Risks

- **时间语义被误用**：用户可能把 `expires_at` 当「删除时间」。缓解：文档明确「到期 = 降权 + 标记，不删除」，面板用「需复核」而不是「已过期」。
- **降权掩盖重要旧知识**：历史决策即使过期也常常重要。缓解：`stale` 系数 0.6 而非 0；`memory_search` 的 `status` 过滤与 `full: true` 仍可读到全文；预检只在同分竞争时才落后。
- **时钟/时区错误**：所有时间必须带时区；比较统一转 UTC 毫秒。写入时校验，读取时容错（解析失败按 `fresh` 处理并记入 `index.errors`）。
- **`scheduled` 被藏起来**：未来生效的条目不出现在预检里，可能让用户以为没记住。缓解：`memory_status` 显示 scheduled 计数；`memory_search` 正常返回。
- **与 merge 提案耦合**：`superseded_by` 由并行的 merge 提案引入；本提案不依赖它，时效状态只看 `status` 与三个时间字段。

## 9. Verification

- 单元测试（`tests/temporal.test.ts`）：
  - 三字段的解析/序列化往返；缺字段时序列化不输出多余行。
  - 非法时间（无时区、`valid_from > expires_at`、`last_verified` 超前）被拒绝且错误信息可读。
  - 老文件（无新字段）在 `aging_decay: 1.0` 下检索分数与改动前完全一致；默认配置下只有 ≥ 90 天未更新的条目被降权。
  - `stale`/`aging`/`scheduled` 的乘数按配置生效；`scheduled` 不出现在预检包但出现在 `memory_search`。
  - 边界：`expires_at` 恰好等于当前时刻 → `stale`；`valid_from` 恰好等于当前时刻 → `fresh`。
- 维护测试：报告出现时效段落，计数与列表正确。
- 面板测试：时效 chip 与 tooltip 渲染；缺失字段显示「未标注」。
- 人工验收（7 天）：预检包中出现 `过期` 标记的条目时，用户/模型不再把它当现行事实引用（抽查 10 次，误用 ≤ 5 次）。

## 10. Tasks

### T-001 字段与解析

- 目标：schema、`KnowledgeRecord`、序列化、校验、`index.errors` 容错。
- 依赖：无。
- 验收：往返与非法值单测通过；老文件不变。
- 相关文件：`src/frontmatter.ts`、`src/types.ts`、`src/store.ts`、`tests/temporal.test.ts`。

### T-002 派生状态与检索降权

- 目标：`temporalState(record, now, policy)` + `search.ts` 乘数 + 配置项。
- 依赖：T-001。
- 验收：各状态分数符合预期；老文件基线不变；`policy.temporal.*` 缺省可用。
- 相关文件：`src/search.ts`、`src/time.ts`、`src/config.ts`。

### T-003 预检、提案与提交

- 目标：预检标记与 `scheduled` 排除；`memory_propose` 三参数；提交回填 `last_verified`。
- 依赖：T-002。
- 验收：预检包文案与标记正确；提交后 `last_verified` 为当前时刻；校验错误有测试。
- 相关文件：`src/service.ts`、`src/tools.ts`、`tests/temporal.test.ts`。

### T-004 维护报告、面板与文档

- 目标：维护报告段落；知识列表时效列；待审批字段；`KNOWLEDGE-FORMAT.md` 更新。
- 依赖：T-003。
- 验收：报告与列表数据一致；无新增写端点；文档与实现一致。
- 相关文件：`src/maintenance.ts`、`src/service.ts`、`client.js`、`locale/*.json`、`docs/KNOWLEDGE-FORMAT.md`。

## 11. Open Questions

- `aging_days` 默认已定为 90 天。用户在 2026-11-08 评审时明确「180 天太久，90 天」，因此按 90 上线；若观察期发现 ≥ 40% 条目落入 aging，再考虑放宽到 120/180。
- 是否需要在 `memory_get` 的 digest 顶部固定输出时效行？本提案只在预检与搜索结果里带标记，`memory_get` 保持原样，避免改变模型已习惯的输出。
- `valid_from` 对「长期有效的约束」意义不大，是否需要按类型关闭该字段（例如 `constraint` 不显示）？先全部支持，面板按是否有值显示。
