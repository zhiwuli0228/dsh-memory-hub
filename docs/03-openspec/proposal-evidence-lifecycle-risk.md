# Proposal: P0 三件套 — 原文取证、引用生命周期、写入风险标记

## Status

Accepted / Implemented（2026-11-08）。来源：`docs/05-domain/memory-landscape-2026.md` §6.7（Hermes Agent 对照）与 PRO-000044 的取舍结论。只抄三件事，不抄模型直写、字符硬上限、SQLite 当权威、向量依赖、自动归档。

## 1. Problem

1. **回顾只有摘要，没有原文**：`memory_reflect` 目前只返回 digest。模型若想确认某个数字/承诺的原始措辞，只能凭摘要猜，`source_refs` 也写不出可信的序号区间。
2. **引用只做计数，不进生命周期**：`memory_cite` 已写账本，但维护只判断「是否被引用过」。一条半年前被大量引用、三个月前刚被引用的条目，仍会按 `last_verified` 报 aging；一条从未被引用的条目与一条上周引用过的条目也区分不出来。
3. **写入风险完全靠人读**：注入短语、凭据形态、零宽字符混进候选时，面板与账本没有任何提示。我们的闸门是人，所以应该**标记给人看**，而不是静默拒绝。

## 2. Goal

- `memory_reflect` 增加 `mode: "search"`：调用宿主 `sessionQuery.searchEvents` 做会话内原文检索，返回 `seq/type/time/snippet`，供模型写出 `session:<id>#<from>-<to>` 证据。只读，不写水位、不写账本。
- 维护报告与 aging 判断参考**最近引用时间**：`lastCitedAt` 取账本 `citation.added` 的最大 `createdAt`；aging 判定用 `max(last_verified/updated_at, last_cited_at)`；未被引用的条目按「最近引用/创建时间」计算天数，并在报告里写明依据。
- `store`/服务在创建候选时扫描正文，产出 `risk: { level: "none" | "review", signals[] }`；账本记录 `riskLevel`/`riskSignals`，面板显示风险标签，工具返回把 risk 告诉模型。**不阻断写入，不自动改正文。**

## 3. Scope

包含：

- `src/risk.ts`（新）：纯函数 `assessProposalRisk(input)`，规则：
  - `invisible-characters`：零宽空格/连接符、BOM、bidi 控制符（U+200B–200F、U+202A–202E、U+2060–2064、U+FEFF）。
  - `prompt-injection`：中英文「忽略以上/之前指令」「ignore/disregard previous instructions」「system prompt」「你现在是」「<|im_start|>」等。
  - `credential-material`：`sk-…`、`ghp_…`、`AKIA…`、私钥块、JWT 形态、`password/token/api_key = …`。
  - `override-phrase`：`system:`/`assistant:` 行首角色伪造、`</instructions>` 等闭合标签。
- `src/reflect.ts`：
  - `SessionQueryLike` 增加可选 `searchEvents(request)`；`SessionDigestSource` 增加可选 `searchEvents`。
  - `HostSessionDigestSource` 透传并容错（非数组 items → 空）。
- `src/service.ts`：
  - `reflect()` 支持 `mode: 'digest' | 'search'`；search 模式可带 `session_id`（必须属于本工作区），缺省时最多扫最近 3 个已结束会话；`limit` 默认 20、上限 50。
  - `propose()` 计算 risk，写入账本并在返回值中给出。
  - `maintenance()` 把 `this.citations` 聚成 `knowledgeId → lastCitedAt` 传给分析。
  - `overview()` 的知识行补 `lastCitedAt`；pending 行补 `risk`。
- `src/maintenance.ts`：`citations` 从 `Set<string>` 改为 `ReadonlyMap<string, string>`；aging/uncited 用最近引用；totals 增加 `cited`。
- `src/tools.ts`：`memory_reflect` 增加 `mode`/`query`，更新描述；`memory_propose` 描述补充 risk 提示。
- `client.js` + locale：pending 卡片显示风险标签；中英文文案。
- 测试：`tests/risk.test.ts`；`tests/reflect.test.ts` 增加 search 模式；`tests/maintenance.test.ts` 或 service 测试覆盖引用生命周期；client 测试覆盖风险标签。
- 文档：本提案、`current-state.md`、`docs/05-domain/memory-landscape-2026.md` 的实现状态。

不含：

- 不做跨会话的全文搜索 UI；不把原文事件搬进知识正文。
- 不自动 archive/降级；未被引用只报告，归档仍走人批准的 `deprecate` 候选。
- 不改变 `format` 版本；risk 不落盘到 pending frontmatter（读取时重算，避免迁移）。

## 4. 数据与兼容

- 账本 `proposal.created` 事件新增可选 `riskLevel` / `riskSignals`；旧账本读取不受影响。
- `MaintenanceAnalysisOptions.citations` 内部签名变化，不涉及文件格式。
- risk 不写入 `pending/*.md`：同一份正文在任何时候重算结果一致；面板打开时实时计算，避免格式升级。
- 无新端点；面板仍只读 + 批准/拒绝。

## 5. 风险

- 注入短语误报：只标 `review`，文案说明「需人工确认」，不阻止提交。
- 凭据形态误报（如文档里的示例 key）：同上；`source_refs` 与正文都扫。
- `searchEvents` 在宿主未配置全文索引时抛 `SESSION_QUERY_SEARCH_DISABLED`：包装成 `available: false` + `reason`，不影响 digest 模式。
- 引用时间跨 Hub：`citation.added` 事件里可能带 `coreId`；本实现只按本 Hub 账本统计，跨 Hub 引用在各自 Hub 内计。

## 6. Verification

- `npx vitest run tests/risk.test.ts tests/reflect.test.ts tests/maintenance.test.ts tests/client.test.ts`
- `npm run check`（typecheck + build + 全部测试）
- 手工：`memory_reflect({ mode: "search", query: "超时" })` 返回命中事件；面板 pending 卡片出现「需确认」标签。
