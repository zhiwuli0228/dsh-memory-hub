# 兼容性契约：怎么做到「先简单、后不变形」

> 真实 Hub 是多年积累，最怕的不是今天慢一点，而是**一开始设计的形状，两年后改不动**。
> 这份契约说明：哪些属性是从现在起就必须守住、不能事后补的；哪些可以用「加字段、加索引」的方式演进；哪些是真的会逼你迁移的坑。

## 1. 已经具备的前向兼容属性（有测试锁定）

| 属性 | 为什么重要 | 证据 |
| --- | --- | --- |
| **文件是唯一真相，索引是派生的** | 换检索引擎（内存 → SQLite）、加缓存、改分词，都不动已有文件 | `src/search.ts` 只读 `KnowledgeRecord`；`scripts/bench-search.ts` 用同一份记录喂两种引擎 |
| **scope 写在 frontmatter，不由目录决定** | 从「一个库」拆成「按业务域/客户分库」时，只改元数据，不搬文件 | `store.commit` 路径恒为 `knowledge/<type>/<id>.md`；`scope` 由 `parseScope` 解析 |
| **未知 frontmatter 字段被保留并回写** | 新版本加字段，旧版本读写一轮不会把字段吃掉 | `pickExtra` + `...record.extra`；`tests/frontmatter.test.ts` → `preserves unknown frontmatter keys` |
| **`format` 版本闸门** | 新版本写的新语义，旧版本**拒绝**而不是猜着读 | `CURRENT_FORMAT` 与 `format > CURRENT_FORMAT` 拒绝；`tests/frontmatter.test.ts`、`tests/store.test.ts` |
| **候选与知识同格式、账本只追加** | 审批、审计、回滚在规模变化后仍然可读 | `pending/PRO-*.md`、`records/ledger.jsonl` |
| **ID 与显示名分离** | 标题可以改，引用不失效 | `memory_cite` 记 `id + version` |

## 2. 写入纪律（现在就要遵守，不需要改结构）

1. **新字段必须可选 + 有默认值**，且旧代码能安全忽略。禁止「必填新字段」——那等于 format bump。
2. **不改已有字段的语义**。要改就加新字段、双写一段时间、确认没有旧读者后再切换，并 bump `format`。
3. **批量信息用 tag，不加新字段**：`batch:<id>`、`source:<系统>`、`topic:<主题>`。tag 上限 12 个，够用且零迁移。
4. **一条知识 = 一个可复用判断**。不要把整篇文档塞进 `body`；摘要（≤240 字）是给检索看的，正文是给 `memory_get` 看的。
5. **作用域先小后大**：先写 `project:<当前项目>`，验证有共性再 `supersede`/上推到 core。上推容易，**下沉很难**（已经 global 的结论很难安全地收回项目级）。

## 3. 会逼你迁移的三个坑（先记下来，别踩）

### 3.1 两个 Hub 合并会撞 ID

每个 Hub 的 `DEC-000001` 等序列是**独立**的。把公司 Hub 与个人 Hub 合并、或把子工作区整体迁到另一个 Hub，会出现同 ID 不同内容。

**约定**：合并时由工具重新编号，并把旧 ID 写入 `extra.legacy_ids`，`source_refs` 原样保留；不要手工改文件名。

### 3.2 新知识类型 = format bump

`KnowledgeType` 是封闭枚举（九类），解析时校验。想加「客户」「合同」这类业务类型，不能临时塞：先用 `type: knowledge` + `tags: [customer]` 表达，稳定三个月后再提升为正式类型，并写迁移脚本（`format: 2`）。

### 3.3 早期把一切写成 `global`

`global` 对所有工作区可见。如果早期把客户 A 的细节写成 global，后面想隔离就得逐条改作用域 + 撤引用。**默认 project，共性再上推。**

## 4. 规模演进不需要迁移的三件事

1. **索引**：≤5k 内存、5k–20k 加持久化快照、>20k 换派生 SQLite（postings 表 + 现有 JS 打分）。文件不动，删掉索引即可重建。
2. **分库**：配置层加 core workspace、设 `core_id` 上级链；已有文件靠 `scope` 归属，不需要搬。
3. **候选吞吐**：批次用 tag 表达；面板按批次过滤；`pending/` 的启动解析可以延后，不涉及文件格式。

## 5. 需要谨慎的演进（要提案 + 迁移脚本）

- 修改 `summary` 长度上限、`tags` 数量上限（会影响已有文件校验）；
- 给 `KnowledgeRecord` 增加必填字段；
- 改变 BM25 系数或 `min_score` 语义（影响排序，需重标定，不改文件）；
- 改变 `merge` / `supersede` 的链式语义（影响已有引用）。

## 6. 测试与文档的对应

| 契约 | 测试 |
| --- | --- |
| 未知字段保留 | `tests/frontmatter.test.ts` › preserves unknown frontmatter keys |
| 未来格式拒绝 | `tests/frontmatter.test.ts` › refuses a file written by a newer format version |
| store 跳过未来格式并给诊断 | `tests/store.test.ts` › skips knowledge written by a newer format version |
| 作用域不依赖目录 | `tests/store.test.ts` › commits pending proposal（路径断言） |
| 排序语义稳定 | `tests/search.test.ts` › returns the same top-limit slice as a full ranking would |

## 7. 一句话总结

**格式只加不改，作用域由小到大，索引随时可换，批量靠 tag。** 满足这四条，今天的「简单」不会变成明天的迁移债。
