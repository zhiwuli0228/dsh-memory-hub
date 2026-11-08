# Proposal: 去重与合并（近重复检测 + 可审计的 merge 提交）

## Status

Proposed（2026-11-08，未实现）

## 1. Problem

同一条结论经常以不同措辞被记两三次：不同会话各写一版、蒸馏又生成一版、手工补一条。现在的处理只有两种：

- `memory_maintenance` 对**精确重复**（类型 + 标题 + 摘要 + 正文哈希完全一致）会生成 deprecate 候选；对近重复只做**标题 bigram 相似度 ≥ 0.82** 的提示（`duplicate-near`，severity `info`），不比较摘要与正文、不过滤作用域、不给建议保留项、也没有任何后续动作。
- 发现重复后，用户只能手工 `deprecate` 或拆成多条 `supersedes`，容易漏、也容易把正文细节丢掉。

结果是检索时同义条目互相稀释分数，模型看到三条「差不多」的摘要，反而更不知道该读哪条；面板上也看不出哪些是同一件事的不同版本。

## 2. Goal

- **确定性检测**近重复：在既有「标题 bigram」信号之外，补上摘要与正文的分片相似度，并按同一类型、同一作用域成对比较，给出建议保留项（keeper）。
- **可审计合并**：新增提案操作 `merge`，由模型写出合并后的正文并指定被合并的 ID 列表；人工在面板看到「旧 → 新」diff 与受影响条目后批准；提交后被合并条目进入 `superseded`，保留 `history/` 快照。
- **只读展示**：检测结果只读呈现，批准仍走既有 `/api/pending` 审核端点；面板不新增写入能力。

## 3. Scope

包含：

- 新增 `src/duplicates.ts`（把 `maintenance.ts` 里的 `findNearDuplicateTitles` 迁出并扩展）：
  - 相似度 = 0.6 × 标题/摘要词元 Jaccard + 0.4 × 正文 3-gram 分片 Jaccard；词元复用 `search.ts` 的 `tokenize`（CJK 二元组）。
  - 只在 `type` 相同、`scope` 完全相同（含 global/domain/project 精确匹配）的 `accepted` 条目之间比较。**这是行为变化**：现有报告只按类型过滤，同一结论写在 project 与 core 两个作用域时也会被提示；迁移后不再跨作用域提示。
  - keeper 选择顺序：`version` 高 → `updatedAt` 新 → `sourceRefs` 多 → `id` 字典序；保证确定性。
  - 阈值 `policy.dedupe.threshold` 默认 0.72（组合分），`policy.dedupe.max_pairs` 默认 20；标题单项仍保留 0.82 的保守阈值作为「高置信」标记。
- `memory_maintenance` 报告继续用 `duplicate-near` 段落，但此行改为展示 `similarity`、keeper 与「可 `memory_propose` merge」的提示。
- 新增只读工具 `memory_duplicates`：参数 `scope?`、`threshold?`、`limit?`（默认 10），返回成对结果与建议。
- 提案支持 `operation: 'merge'`：
  - 新增字段 `merged_ids: string[]`（1..10，不能含 target，不能重复）。
  - 校验：target 必须 `accepted`、`merged_ids` 必须全部 `accepted`、类型与作用域必须与 target 一致、`merged_ids` 不能已带 `superseded_by`。
  - 正文即合并稿，由模型在 `memory_propose` 时给出。
- 提交语义（`commitProposal` 的 merge 分支，纯确定性）：
  1. target：`body` ← 提案正文；`version + 1`；`related` 与 `source_refs` 取并集；`updated_at` 刷新；`last_verified` 刷新（若该字段已落地）。
  2. 每个被合并项：`status = superseded`、`superseded_by = target`、`version + 1`、`updated_at` 刷新；旧版本写 `history/`。
  3. 账本：`knowledge.merged`（`target`、`merged`、`version`）+ 既有 `proposal.committed`。
- 知识新增可选字段 `superseded_by: string | null`；提案新增 `merged_ids`。
- 面板「待审批」卡片：显示 `合并 N 条`、被合并 ID 列表、以及 target 旧正文与提案正文的**行级 diff**（只读，上限 200 行；超出折叠为「仅显示前 200 行」）。
- `docs/KNOWLEDGE-FORMAT.md` 记录 `superseded_by` 与 `merged_ids`。

## 4. Out of Scope

不包含：

- 自动合并、自动批准、自动改正文。
- 插件调用 LLM 生成合并稿（合并文本由模型在提案里写，人审批）。
- 跨作用域合并（project 与 core 之间只做晋升，不做合并）；跨类型合并（类型不同视为不同知识）。
- 面板编辑正文、删除文件、批量合并。
- 修改现有 `supersedes` 语义（仍表示「本条取代了谁」，`superseded_by` 是反向指针）。

## 5. Affected Modules

- service（propose 校验、commit 分支、overview 视图）
- store（提案与知识读写、`history/` 快照）
- search（新字段不参与打分；`superseded` 仍默认不检索）
- frontmatter（`merged_ids`、`superseded_by`）
- ledger（`knowledge.merged`）
- config（`policy.dedupe.*`）
- maintenance（近重复段落）
- tools（`memory_duplicates`、`memory_propose` 参数）
- client.js（diff 视图）
- docs

## 6. Storage Impact

- `config.yaml`：新增 `policy.dedupe.threshold` 与 `policy.dedupe.max_pairs`。
- `knowledge/<type>/<id>.md`：merge 提交时更新 target 正文与版本；被合并项改写 `status`/`superseded_by`/`version`/`updated_at`。
- `pending/PRO-*.md`：新增 `operation: merge` 与 `merged_ids`。
- `records/ledger.jsonl`：新增 `knowledge.merged`。
- `records/sequences.json`：不变（不新增 ID 序列）。
- `history/<type>/<ID>@v<N>.md`：target 与被合并项各写一份旧版本快照。

## 7. Constraints

- [x] 不引入强制性数据库。
- [x] 默认不使用向量库（相似度是词法 Jaccard，可离线复算）。
- [x] `memory_commit` 仍需 DSH 审批；面板批准仍需 `x-dmh-review` + 同源 + 回环。
- [x] 文件是真相：diff 是派生视图，检测结果不落盘为权威数据。
- [x] 任何 `merge` 都必须由人确认；模型只能提出。

## 8. Risks

- **阈值误报**：0.72 可能把「同一主题的两条不同决策」判成重复。缓解：只在同类型同作用域内比较；keeper 与 similarity 一起展示；批准率 < 50% 就上调阈值。
- **报告行为变化**：跨作用域的近似标题不再出现在维护报告里。这是有意的（跨作用域走蒸馏而非合并），但要在 `current-state.md` 的已知限制里写清楚，避免用户以为检测退化了。
- **合并丢细节**：模型写的合并稿可能省略被合并项里的限定条件。缓解：diff 里同时展示被合并条目的摘要；提案正文必须保留各条的「适用与限制」。
- **supersede 链变复杂**：A 合并 B、C 后，若 B 之前 `supersedes` 了 D，需要人工判断 D 是否仍然有效。首版不自动传递，只在 diff 里提示。
- **性能**：成对比较是 O(n²)；n > 2000 时按类型与作用域分桶，且正文分片只算前 4KB。
- **面板 diff 体积**：单条正文 ≤ 64KB，diff 必须截断，避免拖慢渲染。

## 9. Verification

- 单元测试（`tests/duplicates.test.ts`、`tests/merge.test.ts`）：
  - 相似度对同义改写 > 阈值、对同主题不同结论 < 阈值；同一输入两次结果完全一致。
  - keeper 选择在 version/updatedAt/sourceRefs 打平时仍然确定。
  - `merge` 提案校验：self-merge、重复 ID、跨类型、跨作用域、非 accepted、已 superseded 全部拒绝。
  - 提交后：target 版本 +1 且正文更新；被合并项 `superseded` + `superseded_by`；`history/` 各一份；账本 `knowledge.merged` 字段正确。
  - `memory_search` 默认不再返回被合并项；`status: superseded` 过滤可见。
- 面板测试（`tests/client.test.ts`）：`merged` 与 `diff` 字段渲染；超 200 行截断文案。
- 宿主冒烟：一次真实 merge 提案 → 面板看到 diff → 批准 → 文件与账本状态正确。
- 人工验收（7 天）：维护报告里「新增近重复对」数量下降 ≥ 50%；merge 提案批准率 ≥ 60%。

## 10. Tasks

### T-001 近重复检测

- 目标：把 `findNearDuplicateTitles` 迁到 `src/duplicates.ts` 并扩展为组合相似度；加 `policy.dedupe.*`；维护报告段落带 similarity 与 keeper。
- 依赖：现有 `tokenize` 与 store 遍历。
- 验收：单测覆盖阈值、keeper、作用域过滤、确定性；现有维护测试按新行为更新；`npm run check` 通过。
- 相关文件：`src/duplicates.ts`、`src/maintenance.ts`、`src/config.ts`、`tests/duplicates.test.ts`、`tests/maintenance.test.ts`。

### T-002 `memory_duplicates` 工具

- 目标：只读工具，按 scope/threshold/limit 返回成对结果。
- 依赖：T-001。
- 验收：默认 limit 10；越界参数报 `INVALID_INPUT`；不写任何文件。
- 相关文件：`src/tools.ts`、`src/service.ts`、`tests/duplicates.test.ts`。

### T-003 merge 提案与提交

- 目标：`merged_ids` 字段、校验、commit 分支、`superseded_by`、账本事件、history 快照。
- 依赖：T-002。
- 验收：单测覆盖全部拒绝路径与提交副作用；`memory_commit` 审批门禁不变。
- 相关文件：`src/frontmatter.ts`、`src/store.ts`、`src/service.ts`、`src/ledger.ts`、`src/types.ts`、`tests/merge.test.ts`。

### T-004 面板 diff 与文档

- 目标：overview 增加 `merged`/`diff`；审核卡片展示；`KNOWLEDGE-FORMAT.md` 与 `current-state.md` 更新。
- 依赖：T-003。
- 验收：diff 截断；无新增写端点；文档与实现一致。
- 相关文件：`src/service.ts`、`client.js`、`locale/*.json`、`docs/KNOWLEDGE-FORMAT.md`。

## 11. Open Questions

- `merge` 是否应该同时继承被合并项的 `tags`？首版只继承 `related` 与 `source_refs`，`tags` 由模型在提案里显式给。
- 面板 diff 用「行级」还是「段落级」？行级实现简单，但长段落会整块变色；先做行级，观察可用性。
