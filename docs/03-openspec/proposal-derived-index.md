# Proposal: 派生 SQLite 索引（大规模 Hub 的检索路径）

## Status

Implemented（2026-11-08）。前置测量与分档见 [search-performance.md](../04-development/search-performance.md) 与 [scale-plan.md](../01-architecture/scale-plan.md) §6。

## 1. Problem

`KnowledgeIndex` 是纯内存倒排：每条知识的词元、词频、标题归一化与时效时间都常驻。实测（synthetic Zipf 语料，Node 24 / Windows）：

| 条目 | 单查询 p50 | 常驻堆 | 启动重建 |
| ---: | ---: | ---: | ---: |
| 5k | 3.9 ms | 90 MB | 0.5 s |
| 20k | 29 ms | 190 MB | 2.1 s |
| 50k | 107 ms | 647 MB | 5.6 s |
| 100k | 285 ms | 1.1 GB | 11.5 s |

20k 之后内存开始压人，100k 已不适合每次启动重建。文件是真相，所以索引必须是**可删、可重建的派生数据**，而不是新的权威存储。

## 2. Goal

- 新增可选配置 `storage.index: auto | memory | sqlite`（默认 `auto`）：`auto` 在 `node:sqlite` 可用且条目数达到阈值时用 SQLite，否则保持内存索引。
- SQLite 只存**派生索引**：`<hub>/records/index.sqlite`，删除后下次启动自动重建；不改变任何 `knowledge/`、`pending/`、`ledger` 文件。
- **排序逻辑只有一份**：分词、BM25 系数、类型加成、时效降权、recency、`local_boost`、`min_score`、`limit` 全部在 `src/search.ts`；SQLite 只负责取候选与元数据。
- 启动不重建：校验条目数 + 知识目录最近 mtime + 索引格式版本，一致则直接加载。
- 回退安全：`node:sqlite` 不可用、版本过旧、文件损坏、只读 Hub → 记一条诊断并退回内存索引。

## 3. 实现方式

### 3.1 为什么是「FTS5 取候选 + JS 精排」

FTS5 的 `unicode61` 不切中文、`trigram` 不支持 2 字查询，直接 `MATCH` 会改变现有 OR 语义。这里把**自己的分词结果**（CJK 单字 + 双字、英文词）用空格拼成 `tokens` 串写进 FTS5：FTS5 只按空格切词，中文词元因此可以精确命中，查询也先经同一 `tokenize()` 再 `OR` 起来。

纯 postings 表方案实测不可用：100k 时一条查询要把 ~50 万 postings 行搬进 JS 再逐行取元数据，p50 1.5–2.4 s。FTS5 阶段把候选压到 `index_candidate_limit`（默认 2000），JS 只对这 2000 条做精确打分。

### 3.2 schema（`format_version = 1`）

```sql
docs(rowid INTEGER PRIMARY KEY, id TEXT UNIQUE, length INTEGER, tokens TEXT,
     type TEXT, status TEXT, updated_ms, valid_from_ms, expires_at_ms,
     last_verified_ms, title_norm TEXT)
terms(token TEXT PRIMARY KEY, df INTEGER) WITHOUT ROWID
docs_fts USING fts5(tokens, content='', tokenize='unicode61')   -- contentless，只存倒排
meta(key TEXT PRIMARY KEY, value TEXT)
```

- `tokens` 是「按 tf 重复、空格分隔」的词元串：既给 FTS5 建倒排，也能在 JS 里按词元边界数回 `tf`，不额外存 postings。
- `terms.df` 提供 idf；重建时在内存累计后批量写入，单条增删时逐词元 ±1。
- 查询：`SELECT rowid FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT ?` 只取 rowid（宽行不进排序），再回表一次取元数据。

### 3.3 语义与误差边界

- 命中数 ≤ `index_candidate_limit` 时，候选集等于内存索引的 postings 并集，**结果与内存索引逐位一致**（单测覆盖 id 顺序与分数，容差 1e-9）。
- 命中数超过上限时是两阶段检索：FTS5 `bm25` 先截断，再由同一 JS 函数精排。此时可能漏掉被截断但精排会进前 8 的条目；synthetic 最坏语料（每条查询命中 ~2 万条、Zipf 头部词）recall@8 实测 0.925（候选 2000）。真实语料查询的命中集远小于此，误差更低。
- 需要绝对精确时可把 `index_candidate_limit` 调大（上限即全量精确，代价是延迟），或直接用 `storage.index: memory`。

## 4. Scope

包含：

- `config.yaml` 新增可选块：

  ```yaml
  storage:
    index: auto              # auto | memory | sqlite
    sqlite_min_entries: 30000 # auto 的切换阈值
    index_candidate_limit: 2000
  ```

  未知/非法值按 `auto` 处理并记诊断；`readOnly` 时不写索引文件。
- 新模块 `src/index-sqlite.ts`：`add/remove/clear/search/size`、`rebuild(records)`、`setFingerprint()`、`close()`。
- `src/search.ts` 抽出 `SearchIndex` 接口与共享打分函数：`queryTokensOf`、`searchSetup`、`bm25Term`、`passesFilters`、`rankScored`；内存索引与 SQLite 索引都调用 `rankScored`。
- `store.load` 选择实现、启动校验、写入后刷新指纹；`closeIndex()` 释放句柄（Windows 上不关闭无法删除）。
- `/api/overview` 与 `memory_status` 暴露 `index.backend`、`index.rebuilt`。
- `scripts/bench-search.ts` 输出三档：内存、纯 FTS5 命中、派生索引（p50/p95/磁盘/候选数）。

## 5. Out of Scope

- 不把知识正文写进 SQLite（只存词元串与元数据）。
- 不引入外部依赖、服务或守护进程。
- 不做跨 Hub 的联合索引；多 core 仍各建各的。
- 不改 `knowledge/` 文件格式（`format` 仍为 1）。
- 不保证超过候选上限时与内存索引逐位一致（见 §3.3）。

## 6. Storage Impact

- `config.yaml`：新增可选 `storage` 块；旧配置无该块时行为不变（`auto`）。
- `knowledge/`、`pending/`、`records/ledger.jsonl`、`records/sequences.json`：不变。
- `records/index.sqlite`（含 `-wal`/`-shm`）：**新增派生文件**，可删除，不进 git、不进 `history/`。

## 7. Constraints

- [x] 不引入强制性数据库：SQLite 只是可删除的派生索引，Markdown 仍是唯一真相。
- [x] 默认不使用向量库。
- [x] `memory_commit` 仍需 DSH 审批；索引不参与写入决策。
- [x] 删除 `records/index.sqlite` 后功能完全等价（下次启动重建）。
- [x] `node:sqlite` 是可选运行时能力，不作为安装依赖；`engines.node` 保持 `>=20`，动态 import 失败即回退。

## 8. Risks

- **两阶段截断的漏检**：见 §3.3；通过 `index_candidate_limit` 可调，recall 在文档中量化。
- **同步 API 阻塞事件循环**：`node:sqlite` 是同步 API。100k 实测 p50 ~400 ms（候选 2000），比内存路径慢 10–15%，但堆占用从 ~1.1 GB 降到 ~250 MB 磁盘。本地单用户面板可接受。
- **索引与文件不一致**（外部编辑器改动、git checkout）：`entry_count + 知识目录 max mtime` 指纹不一致即重建；会话内写入后刷新指纹。
- **多进程写**：同一 Hub 被两个实例打开时各自持有索引，接受「最后写入者赢」，因为索引可重建。
- **Windows 文件锁**：`closeIndex()` 在重新 `load()` 与测试清理时关闭句柄。

## 9. Verification

- 单测（`tests/index-sqlite.test.ts`，6 项）：
  - 小语料下内存与 SQLite 的 id 顺序与分数一致（容差 1e-9），覆盖类型/状态/作用域过滤、`local_boost`、`preferProject`、`min_score`、`excludeTemporal`、`limit`。
  - 指纹匹配时复用、不匹配时重建；损坏文件返回 reason 而非抛异常。
  - `add/remove/clear` 与内存实现一致。
  - store 集成：`index: sqlite` 切换、提交后可检索、重启复用（`indexRebuilt === false`）；`index: memory` 不创建文件。
- 基准：`npx vite-node scripts/bench-search.ts --sizes 20000,50000,100000 --candidates 2000`。
- 回退：Node 20（无 `node:sqlite`）启动 → 一条诊断、检索正常（`indexWarning`）。

### 实测（synthetic Zipf，Node 24 / Windows，候选上限 2000）

| 条目 | 内存 p50 | 派生索引 p50 | 内存堆 | 索引磁盘 | 重建 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 20k | 39 ms | 112 ms | ~210 MB | 50 MB | 3.0 s |
| 50k | 158 ms | 231 ms | ~600 MB | 124 MB | 8.5 s |
| 100k | 352 ms | 399 ms | ~1.1 GB | 246 MB | 18.7 s |

结论：派生索引不是延迟优化，而是**内存上限**方案。`auto` 因此只在 30k 以上切换；30k 以下内存索引更快。

## 10. Rollout

1. 接口与共享打分重构（无行为变化）。
2. SQLite 实现 + 配置 + 启动校验 + 回退 + 测试。
3. 默认 `auto`、阈值 30k；`current-state.md` 与 `search-performance.md` 记录实测。
