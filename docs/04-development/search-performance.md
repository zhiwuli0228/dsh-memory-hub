# 检索性能与规模上限（2026-11 实测）

> 回答两个问题：知识条目变多后**查询会不会变慢**、**效果会不会变差**？以及要不要学 Hermes 换 SQLite。
> 结论先行：**现在的瓶颈是内存与启动，不是排序质量**；本次热路径优化把 5k 规模的单次查询从 ~10ms 降到 ~4ms，20k 从 ~57ms 降到 ~29ms。SQLite FTS5 在同规模下快约 2 倍、省约 3/4 内存，但代价是 Node ≥ 22 与一个「非权威索引」的新组件，**暂时不换**；阈值与触发条件见 §5。

## 1. 现状实现与复杂度

`src/search.ts` 的 `KnowledgeIndex` 是纯内存倒排索引：

- 写入：`add()` 对 title×3、tags×2、summary×2、body×1 分词（CJK unigram + bigram），得到 `token → tf`，同时维护 `token → (id → tf)` 的 postings 与总长度。
- 查询：`tokenize(query)` → 每条查询 token 求 IDF（BM25）→ 遍历该 token 的 postings 累加分数 → 过滤/加权（类型、时效、标题、本地优先、`min_score`）→ 取前 `limit`。

单次查询的复杂度：

```
O(N)            可见性/状态过滤（每个 entry 查一次 scope）
+ O(Σ df_t)     postings 遍历，df_t 是该 token 的文档频率
+ O(C · K)      前 K 名选择（K = limit，很小）
```

`Σ df` 是主项：查询 token 越常见、条目越多，候选越多。5k 条目、20 条查询平均触碰 ~27k 候选，20k 条目 ~107k 候选。

启动是另一条成本线：`KnowledgeStore.load()` 每次启动**重新读取并解析所有 Markdown**，再重建索引；watcher 之后只增量 `refreshPath`，不会全量重建。

## 2. 实测数据

合成语料：确定性 PRNG + Zipf 词频（长尾更接近真实中文语料），每条 title 2–3 词、summary 6–9 词、body 3–6 段（平均 227 字符）。20 条两词查询，预热 1 轮后测 2 轮，取中位数/95 分位。Node v24.22.1 / Windows。

| 规模 | 优化前 p50 | 优化后 p50 | 优化后 p95 | 索引堆内存 | FTS5 p50 | FTS5 体积 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1k | 1.32 ms | **0.53 ms** | 1.02 ms | ~24 MB | 0.94 ms | 2.5 MB |
| 5k | 10.58 ms | **3.94 ms** | 5.75 ms | ~90 MB | 3.75 ms | 13.3 MB |
| 20k | 57.03 ms | **29.23 ms** | 38.16 ms | ~190 MB | 14.83 ms | 50.3 MB |

FTS5 侧：`fts5(id UNINDEXED, tokens, tokenize="unicode61")`，把同一套分词结果用空格拼成 `tokens` 列，查询 `tokens MATCH '"词1" AND "词2"' ORDER BY bm25(...)`。注意这是我们**自己分词后喂给 FTS5**，不是让 FTS5 处理中文原文（`unicode61` 不切中文，`trigram` 又不支持 2 字查询）。

读法：

- 1k 以内两边都在亚毫秒，谁都不影响体验。
- 5k 是分水岭：内存版 ~4ms，一次预检 + 一次 `memory_search` 约 8–12ms，可接受。
- 20k 起内存版进入 ~30ms/次；此时真正的压力是**堆内存 ~190MB**（每个条目一份 token→tf Map）和**启动解析 2s+**，不是查询本身。
- 合成语料是「稠密」压力测试：所有文档共享约 30 个高频词，候选量 ≈ 5×N。真实语料词表更长、df 更低，数字应更好看；但**增长趋势**一致。

## 3. 本次优化（行为不变的纯热路径）

1. **时间戳预解析**：`temporalTimesOf()` 在建索引时把 `valid_from` / `expires_at` / `last_verified` / `updated_at` 解析为 epoch ms，存进 `IndexEntry`；查询用 `temporalStateFromTimes()` 直接比较，不再对每个候选 `Date.parse` 4 次。这是原实现最大的隐性热点（10 万候选 ≈ 40 万次日期解析）。
2. **标题归一化缓存**：`titleNormalized` 建索引时算一次，查询里 `includes(normalizedQuery)` 直接比，不再逐候选 `NFKC + toLowerCase`。
3. **前 K 名选择取代全量排序 + 全量命中对象**：原实现对每个过线候选都生成 `KnowledgeHit`（含 `makeSnippet` 的字符串扫描）再整体排序；现在只维护 limit 个轻量 `{id, score, temporal}`，最后只为入选的 8 条生成 snippet 与命中对象。
4. **`nowMs` 统一**：新鲜度衰减改用 `filters.nowMs`（缺省 `Date.now()`），测试可以真正固定「现在」，不再有「时效用假时间、新鲜度用真时间」的割裂。

排序语义完全保留：先按分数降序，平分按 id 降序；新增测试 `returns the same top-limit slice as a full ranking would` 锁定「截断不改变前 K 名」。

没有做的事（有意）：

- 没有给高频 token 设 df 上限——那会直接伤召回，属于产品决策，不是性能优化。
- 没有把 `allowed` 过滤缓存成「每工作区 id 集合」——它只占 O(N) 的一次 Map 查询，当前 < 1ms；引入缓存会让 watcher/配置热更新多一条失效路径。
- 没有引入新依赖。

## 4. 「数量多了效果会不会变差」

拆成三层看：

**4.1 排序质量：基本稳定。** BM25 的 IDF 由「df / N」决定；同一主题的文档一起增长时 df 与 N 同比例上升，IDF 趋于常数（实测榜首分数 1k→20k 仅从 ~3.7 升到 ~4.0）。所以「越查越差」在这个量级不成立。

**4.2 `min_score` 的绝对阈值会漂移。** 如果新增文档**不**覆盖旧词（df 不变而 N 变大），这些词的 IDF 会涨，分数整体抬高，`min_score: 1.0` 的相对严格度就下降——表现为「预检开始塞不相关命中」。当前默认 `min_score: 1.0`（预检），在 1k–20k 的合成语料里没有观察到明显漂移；但这是一个**应该在真实 Hub 里用引用率验证**的假设，而不是可以忽略的细节。若真出现漂移，改成「相对阈值」（如 `topScore × ratio`）比调大绝对值更稳。

**4.3 竞争变激烈。** 条目越多，同一查询的「近似命中」越多，8 个席位里更容易混入弱相关条目。这不是检索算法退化，而是**知识库卫生问题**：重复与近重复条目该合并。我们已有 `memory_duplicates` + `merge` 与夜间维护，规模上去后应把「近重复对数」当作健康指标看，而不是调检索参数。

## 5. 要不要换 SQLite（Hermes 的 FTS5）

**现在不换。** 理由按重要性排序：

1. **收益区间不对**：SQLite 只在 20k 以上明显赢（29ms → 15ms），而个人 Hub 的合理规模是几百到几千条；5k 时两者打平（3.9ms vs 3.8ms）。
2. **硬规则**：Markdown/YAML/JSONL 是唯一权威格式，不能引入强制性数据库。SQLite 只能做**可重建的派生索引**，这意味着它必须能随时删掉重建，复杂度不低。
3. **运行时门槛**：`node:sqlite` 从 Node 22.5 才有（当前 `engines.node >= 20`）；要用就得抬版本或引入原生依赖（跨平台编译、CI 矩阵）。
4. **收益可以更便宜地拿到**：内存索引的主要成本是「每条目一份 token Map」。真要上 20k，先做**持久化索引快照**（启动直接反序列化，省掉 2s 解析 + 分词）比换检索引擎更划算，且不改变权威存储。

**什么时候值得重新评估**（满足任意两条）：

- 真实 Hub 稳定超过 ~20k 条，或单次预检 + 检索稳定超过 ~50ms；
- 出现「多进程/多客户端共享同一 Hub」的需求（SQLite 的并发读此时有价值）；
- 需要跨会话的**原文全文检索**（`session_search` 那类），这本身就是独立的一层，和知识索引不该混在一起；
- `engines.node` 因其他原因抬到 ≥ 22.5。

**如果将来做，按这个形状做**：

1. 索引文件放 `records/index.sqlite`（或 `cache/`），**可随时删除重建**，不参与备份与 git；
2. 表结构只存 `id` + 预分词文本（空格分隔的 unigram/bigram），查询用 `MATCH` 取候选（top 200），**排序仍在 JS 里用现有 BM25-lite**，保证类型/时效/本地优先/`min_score` 语义不变；
3. 写入走现有 watcher 增量，启动时校验 `mtime`/`size` 或索引版本，不匹配就全量重建；
4. `node:sqlite` 不可用时**自动回退**到当前内存实现，SQLite 永远是可选加速器。

## 6. 还没测的

- 真实语料（当前 Hub 的实际条目）上的数字与榜首分数分布；
- `KnowledgeStore.load()` 全量启动耗时（20k 条文件读取 + YAML 解析），预计是下一个瓶颈；
- 多核心 Hub 的预检并发（金字塔回退可能一次查 2–3 个索引）；
- 面板列表接口在大库上的耗时（它走 `records()` 全量 + 序列化）。

## 7. 复现

```powershell
npx vite-node scripts/bench-search.ts                        # 1k / 5k / 20k
npx vite-node scripts/bench-search.ts --sizes 500,2000 --queries 10
```

基准不写真实 Hub、不联网，只用内存；`node:sqlite` 不可用时自动跳过 FTS5 一列。
