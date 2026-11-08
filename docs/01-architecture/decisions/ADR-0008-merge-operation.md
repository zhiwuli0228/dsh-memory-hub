# ADR-0008: Deduplication Uses an Independent Merge Operation

## Status

Accepted（2026-11-08）

## Context

同一结论常被写成多条：不同会话各写一版、蒸馏再生成一版、手工补一条。已有的处理只有两种：

- 维护任务对**精确重复**（类型 + 标题 + 摘要 + 正文哈希一致）生成 deprecate 候选；
- 对近重复只比较标题 bigram，输出一条 `info` 级提示，不给保留建议，也没有后续动作。

用户发现重复后只能手工 `deprecate`（丢正文）或拆成多条 `supersedes`（记不清谁并进了谁）。需要一次可审计的合并：人能看到「旧 → 新」的正文变化与受影响条目，批准后留有「谁被并进了谁」的单点记录。

可选方案是把合并表达为 `update` + 多条 `supersedes`，或新增独立操作。评审选择了后者。

## Decision

1. 新增提案操作 `operation: "merge"`，字段 `merged_ids`（1..10，同类型、同作用域、不能含 target、不能重复、不能已是 `superseded_by`）。
2. 提案正文即合并稿，由模型在 `memory_propose` 时写出；插件不调用 LLM 生成合并文本。
3. 提交是纯确定性的：target 正文替换、`version + 1`、`related`/`source_refs` 取并集；被合并项 `status: superseded` + `superseded_by: <target>` + `version + 1`；target 与被合并项各写一份 `history/` 快照；账本追加 `knowledge.merged`，随后是既有的 `proposal.committed`。
4. 检测放在独立的只读模块 `src/duplicates.ts`：组合相似度 = 0.6 × 标题/摘要词元 Jaccard + 0.4 × 正文 3-gram Jaccard；只在同类型、同作用域之间比较；keeper 顺序为 `version` → `updatedAt` → `sourceRefs` → `id`，保证确定性。阈值 `policy.dedupe.threshold` 默认 0.72。
5. 只读工具 `memory_duplicates` 暴露检测结果；维护报告复用同一实现，展示 similarity 与 keeper。
6. 面板「待审批」对 merge 候选只读展示被合并条目与行级 diff（上限 200 行）；批准仍走既有回环审核端点，没有新增写端点。

## Consequences

- 合并是**一条提案影响多条知识**，审批时一次可见全部受影响条目；不会出现「拆成 5 条 supersedes、漏掉 2 条」。
- `superseded_by` 是反向指针，`supersedes` 语义不变（本条取代了谁）。首版不自动传递 supersede 链：A 合并 B、C 后，B 以前取代的 D 需要人工判断。
- 维护报告的近重复段落**不再跨作用域**提示（以前只按类型过滤，core 与 project 的同名条目也会被提示）。这是有意的：跨作用域走蒸馏/晋升，不走合并。
- 合并稿可能丢细节；缓解是 diff 同时展示被合并条目的摘要，并在 skill 里要求逐条保留「适用与限制」。
- 成对比较是 O(n²)，按 `type + scope` 分桶、正文只取前 4KB；5k 条规模下的耗时仍需压测。
- 阈值 0.72 可能误报同主题的不同决策；批准率低时应上调阈值，而不是放宽合并校验。

## Alternatives Considered

- `update` + 多条 `supersedes`：复用现有操作，但一次写入只产生一条 `proposal.committed`，无法表达「B、C 并入了 A」，也无法在面板一次性展示全部受影响条目。
- 自动合并/自动批准：违背「模型不能自批」与「只有人能改权威知识」的硬规则。
- 插件调用 LLM 生成合并稿：引入网络依赖、成本与不可复现性；让模型在提案里写、人来审更简单。
- 向量相似度：需要 embedding 服务或本地模型，违背「默认不使用向量库、可离线复算」的约束。
