# Proposal: 派生 SQLite 索引（>20k 条时的检索路径）

## Status

Proposed（2026-11-08）。前置测量与分档见 [search-performance.md](../04-development/search-performance.md) 与 [scale-plan.md](../01-architecture/scale-plan.md) §6。

## 1. Problem

`KnowledgeIndex` 是纯内存倒排：每条知识的词元、词频、标题归一化与时效时间都常驻。实测（synthetic Zipf 语料，Node 24 / Windows）：

| 条目 | 单查询 p50 | 常驻堆 | 启动重建 |
| ---: | ---: | ---: | ---: |
| 5k | 3.9 ms | 90 MB | 0.5 s |
| 20k | 29 ms | 190 MB | 2.1 s |
| 50k | 107 ms | 647 MB | 5.6 s |
| 100k | 285 ms | 1.1 GB | 11.5 s |

20k 之后内存与启动开始压人，100k 已不适合每次启动重建。文件是真相，所以索引必须是**可删、可重建的派生数据**，而不是新的权威存储。

## 2. Goal

- 新增可选配置 `storage.index: auto | memory | sqlite`（默认 `auto`）：`auto` 在 `node:sqlite` 可用且条目数超过阈值时用 SQLite，否则保持内存索引。
- SQLite 只存**派生索引**：`<hub>/records/index.sqlite`，删除后下次启动自动重建；不改变任何 `knowledge/`、`pending/`、`ledger` 文件。
- **检索语义逐位不变**：分词、BM25 系数、类型加成、时效降权、recency、`local_boost`、`min_score`、`limit` 全部沿用现有 JS 实现；SQLite 只承担「按词元取 postings」和「取文档元数据」。
- 启动不重建：校验条目数 + 最近 mtime + 索引格式版本，一致则直接加载；不一致后台重建（或同步重建并记诊断）。
- 回退安全：`node:sqlite` 不可用、版本过旧、文件损坏、磁盘只读 → 记录一次警告并退回内存索引，功能不受影响。

## 3. Scope

包含：

- `config.yaml` 新增可选块：
  ```yaml
  storage:
    index: auto        # auto | memory | sqlite
    sqlite_min_entries: 20000   # auto 的切换阈值
  ```
  未知/非法值按 `auto` 处理并记诊断；`readOnly` 时只用现有文件，不写索引文件。
- 新模块 `src/index-sqlite.ts`：
  - schema：`docs(id TEXT PRIMARY KEY, type, scope, status, length INTEGER, title_norm TEXT, times_json TEXT)`；`postings(token TEXT, id TEXT, tf INTEGER, PRIMARY KEY(token, id))`；`meta(key TEXT PRIMARY KEY, value TEXT)`。
  - 写入：`add(record)` / `remove(id)` / `replace(record)`，与 `KnowledgeIndex` 同形；`save` 用事务批量写入。
  - 查询：`search(query, filters, limit)` 先按 `token IN (...)` 取 postings（`SELECT token, id, tf FROM postings WHERE token IN (...)`) 得到 df 与候选集，再在 JS 里用与 `src/search.ts` 相同的 `bm25`/加成/降权/排序函数打分，返回同样的 `KnowledgeHit` 形状。
  - 校验：`meta.format_version`（=1）、`entry_count`、`max_mtime_ms`；不匹配则全量重建。
- `KnowledgeIndex` 抽成接口（`add/remove/search/size/clear`），内存与 SQLite 两个实现；`store.load` 负责选择实现并填充。
- `scripts/bench-search.ts` 增加 `--engine sqlite`，输出与内存路径相同的 p50/p95/top-score，便于对照语义。
- 启动诊断：`index.backend`、`index.rebuilt`、`index.stale_reason` 出现在 `/api/overview` 与 `memory_status`。

## 4. Out of Scope

- 不把知识正文写进 SQLite（只存 id、词元、长度、时间与标题归一化）。
- 不引入 FTS5 排序（`unicode61` 不分中文，`trigram` 不支持 2 字查询；`MATCH ... AND` 也会把现在的 OR 语义改成 AND）。
- 不引入外部依赖、服务或守护进程。
- 不做跨 Hub 的联合索引；多 core 仍各建各的。
- 不改 `knowledge/` 文件格式（`format` 仍为 1）。

## 5. Affected Modules

- config（新增 `storage` 块与校验）
- store（索引实现选择、启动校验、写入同步）
- search（抽接口，导出可复用的打分函数）
- hub（`indexPath()`、只读与磁盘不可用判定）
- runtime / service（`memory_status` 与 overview 暴露 backend/diagnostics）
- scripts（bench 增加引擎开关）
- docs（本提案、search-performance、scale-plan、current-state）

## 6. Storage Impact

- `config.yaml`：新增可选 `storage` 块；旧配置无该块时行为不变（`auto`）。
- `knowledge/<type>/<id>.md`：**不变**。
- `pending/PRO-*.md`：不变。
- `records/index.sqlite`：**新增派生文件**，可删除；不参与 git，不进 `history/`。
- `records/ledger.jsonl`：不变（索引重建不写账本，只在诊断里体现）。
- `records/sequences.json`：不变。

## 7. Constraints

- [x] 不引入强制性数据库：SQLite 只是可删除的派生索引，Markdown 仍是唯一真相。
- [x] 默认不使用向量库。
- [x] `memory_commit` 仍需 DSH 审批；索引不参与写入决策。
- [x] 文件是真相：删掉 `records/index.sqlite` 后功能完全等价。
- [x] `node:sqlite` 是可选运行时能力，不作为安装依赖；`engines.node` 保持 `>=20`（不回退则用内存索引）。

## 8. Risks

- **语义漂移**：SQL 取 postings 与内存打分若有一处不一致，排序就会变。缓解：打分函数只保留一份，SQL 只做取数；bench 对两个引擎逐查询比较 top-10 与分数（容差 1e-9）。
- **同步 API 阻塞事件循环**：`node:sqlite` 是同步 API，单次查询在 100k 下预计 20–40 ms（含取行与打分），会阻塞其他请求。缓解：本地插件、单用户面板可接受；若实测 >80 ms，改为只把 postings 读入内存 LRU，或分片。
- **索引与文件不一致**（外部编辑器改动、git checkout）：用 `entry_count + max_mtime_ms` 校验；不一致重建。重建期间新请求走内存索引。
- **包体/兼容**：`node:sqlite` 在 Node 20 不存在，动态 import 失败必须静默回退，不能影响启动。
- **多进程写**：同一 Hub 同时被两个 DSH 实例打开时，各自持有索引；写连接用 `busy_timeout` 并接受“最后写入者赢”，因为索引可重建。

## 9. Verification

- 单元测试：
  - 同一批记录在内存与 SQLite 两个实现上 `search` 返回相同 id 顺序与分数（容差 1e-9），覆盖类型加成、时效降权、`local_boost`、`min_score`、`limit`。
  - `add/remove/replace` 后两个实现一致；`clear` 后为空。
  - 删除 `index.sqlite` 后启动自动重建；`meta` 计数/mtime 不匹配触发重建；损坏文件（随机字节）→ 回退内存并记诊断。
  - `storage.index: memory` 时绝不创建 SQLite 文件；`readOnly` 时不写索引。
- 基准：`npx vite-node scripts/bench-search.ts --engine sqlite --sizes 20000,50000,100000`，要求 100k 下 p50 < 120 ms、常驻堆 < 200 MB、重启不重建（加载 < 2 s）。
- 冒烟：真实 Hub 复制一份 2 万条数据集，面板检索、预检、`memory_search` 结果与内存引擎一致。
- 回退：Node 20（无 `node:sqlite`）启动，日志出现一条回退警告，检索正常。

## 10. Rollout

1. 先合入接口与内存实现重构（无行为变化）。
2. 再加 SQLite 实现，默认 `storage.index: memory`，用 bench 与真实数据验证。
3. 验证通过后把默认改为 `auto`（>20k 才启用），并在 `current-state.md` 记录实测。
