# 知识文件格式（V0.1）

DSH Memory Hub 的每一条知识都是 `<root>/knowledge/<type>/<ID>.md`。文件是可以直接阅读、编辑、git 管理的普通 Markdown；插件只做校验和索引，不会把格式"藏起来"。

配套总设计见 [DESIGN.md](DESIGN.md)。

## 1. 目录与命名

```text
knowledge/
  decision/DEC-000001.md
  constraint/CON-000001.md
  knowledge/KNO-000001.md
  api-catalog/API-000001.md
  process/PRC-000001.md
  open-questions/OQ-000001.md
  runtime-base/RUN-000001.md
  playbooks/PLAY-000001.md
  assets/AST-000001.md
pending/PRO-000001.md
history/decision/DEC-000001@v2.md
```

| 类型 | 目录 | 前缀 |
| --- | --- | --- |
| `decision` | `decision/` | `DEC` |
| `constraint` | `constraint/` | `CON` |
| `knowledge` | `knowledge/` | `KNO` |
| `api-catalog` | `api-catalog/` | `API` |
| `process` | `process/` | `PRC` |
| `open-questions` | `open-questions/` | `OQ` |
| `runtime-base` | `runtime-base/` | `RUN` |
| `playbooks` | `playbooks/` | `PLAY` |
| `assets` | `assets/` | `AST` |

规则：

- ID 由插件分配，格式 `前缀-六位数字`；手工新建时按当前最大编号 +1，避免冲突。
- 文件名必须与 `id` 一致：`DEC-000001.md`。
- 不要手工创建 `history/`、`pending/archive/`、`records/` 下的文件；它们由插件维护。

## 2. Frontmatter

文件以 `---` 开头和结尾的 YAML 块开始，之后是 Markdown 正文。

```markdown
---
id: DEC-000001
type: decision
scope: project:backend
status: accepted
version: 1
title: 缓存广播使用版本号
summary: 广播消息携带单调版本号，接收端丢弃过期消息。
tags: [cache, broadcast]
source_refs:
  - session:6f0c1a2b#120-138
related: [CON-000002]
supersedes: []
promoted_from: null
created_at: '2026-11-01T09:00:00+08:00'
updated_at: '2026-11-01T09:00:00+08:00'
---

## 结论

广播消息只携带单调递增的版本号；接收端按版本号丢弃过期消息，不使用本地时间戳判断。

## 依据

- 旧实现使用时间戳，时钟漂移会导致消息被误判为过期。
- 版本号在发送端单点递增，比较没有歧义。

## 适用与限制

- 适用于 `main` 分支的 1.x 版本；离线重放场景尚未验证。

## 证据

- `session:6f0c1a2b#120-138`：定位问题的对话与测试输出。
- `file:src/cache/broadcast.ts`：发送端版本号实现。
```

### 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | `类型前缀-六位数字`，全局唯一 |
| `type` | 是 | 九个类型之一，必须与目录一致 |
| `scope` | 是 | `global`、`domain:<id>`、`project:<workspace-id>` |
| `status` | 是 | `candidate` / `accepted` / `rejected` / `superseded` / `deprecated` |
| `version` | 是 | 从 1 开始的正整数；每次接受变更 +1 |
| `title` | 是 | ≤200 字符，单行 |
| `summary` | 是 | ≤240 字符，一句话结论；注入上下文时只显示这一行 |
| `tags` | 否 | ≤12 个短标签 |
| `source_refs` | 视类型 | 证据引用；`decision/constraint/process/api-catalog/runtime-base/playbooks` 提交时至少 1 条 |
| `related` | 否 | 相关条目 ID |
| `supersedes` | 否 | 本条目取代的旧条目 ID |
| `promoted_from` | 否 | 汇总晋升来源，形如 `project:backend/DEC-000001@2` |
| `created_at` | 是 | ISO 8601，带时区；**必须加引号**，避免 YAML 解析成日期对象 |
| `updated_at` | 是 | 同上；每次写入更新 |
| `applies_to` | 否 | `{branches: [...], versions: [...]}`，V0.1 只记录、不自动过滤 |
| `valid_from` | 否 | 事实开始成立的时刻；未来时刻表示「尚未生效」 |
| `expires_at` | 否 | 事实不再可信的时刻；过了只降权、不删除 |
| `last_verified` | 否 | 上次确认仍然正确的时刻；创建/更新提交时缺省补成提交时刻 |
| `superseded_by` | 否 | 反向指针：本条被哪条知识合并/取代；只有 merge 提交会写 |

未知字段会被保留但忽略；插件不会因为未知字段而拒绝文件。

### 2.1 时效字段

三个字段都可选、都必须是带时区的 ISO 8601（如 `2026-12-01T00:00:00+08:00`）。**派生状态不落盘**，读取时按下面规则实时计算：

| 状态 | 条件（按优先级） | 检索降权 | 预检 |
| --- | --- | --- | --- |
| `stale` | `expires_at` ≤ 现在 | × `stale_decay`（默认 0.6） | 注入并标「已过期，需复核」 |
| `scheduled` | `valid_from` > 现在 | × `scheduled_decay`（默认 0.3） | **不注入**（`memory_search` 仍可查到，带 `temporal: "scheduled"`） |
| `aging` | `last_verified`（缺失时用 `updated_at`）早于 `aging_days`（默认 90 天） | × `aging_decay`（默认 0.85） | 注入并标「长期未确认」 |
| `fresh` | 其余 | × 1 | 正常注入 |

约束与行为：

- `valid_from` 不得晚于 `expires_at`；`last_verified` 不得晚于「现在 + 5 分钟」（时钟偏差容忍）。违反时 `memory_propose` 直接拒绝。
- 过期**不等于**废弃：条目仍是 `accepted`，仍可检索、可引用；只是排序变低并在维护报告里列为 `expired`。要不要废弃由人决定（deprecate 提案）。
- 老文件不需要迁移：没有 `last_verified` 时用 `updated_at` 回退，因此「超过 90 天没更新」的老条目会开始按 0.85 降权。想完全保持旧排序，把 `policy.temporal.aging_decay` 设为 `1.0`。
- 更新提案缺省**保留**原条目的三个字段（补 `last_verified` 为提交时刻）；文件模型无法区分「未提供」与「清空」，要清空请用新的 create 条目替代旧条目。
- 所有阈值与系数在 `config.yaml` 的 `policy.temporal` 下，改完由 watcher 热加载。

### 2.2 合并（merge）

近重复条目用 `operation: "merge"` 的**候选**合并，仍要人工批准：

```yaml
operation: merge
target: DEC-000001          # 保留项
expected_version: 2
merged_ids: [DEC-000004, DEC-000007]   # 1..10，同类型同作用域，不能含 target 或已合并项
```

批准提交时（`memory_commit` 或面板）：

- `target`：正文替换为提案正文，`version + 1`，`related` 与 `source_refs` 取并集，`updated_at` / `last_verified` 刷新；
- 每个被合并项：`status: superseded`、`superseded_by: <target>`、`version + 1`、`updated_at` 刷新，旧版本各写一份 `history/`；
- 账本追加 `knowledge.merged`（`target`、`merged`、`version`），随后是既有的 `proposal.committed`；
- 被合并项默认不再出现在检索结果里，需要时用 `memory_search({ statuses: ["superseded"] })` 查看。

候选文件因此多一个可选 `merged_ids`；检测用只读的 `memory_duplicates`，阈值见 `policy.dedupe.threshold`（默认 0.72）。跨作用域（project 与 core 之间）不做合并——那是蒸馏/晋升，不是去重。

## 3. 正文约定

正文没有强制的语法，但建议使用以下二级标题，便于人和模型快速定位：

```markdown
## 结论
## 依据
## 适用与限制
## 证据
```

- 正文不能为空。
- 单个文件 ≤ 64KB；更大的内容拆成多条 `knowledge` 并用 `related` 连接。
- 不要在正文里粘贴密钥、令牌、完整生产日志；`source_refs` 用路径或证据区间即可。
- 中文、英文、混合语言都可以；检索会做 CJK 二元组分词。

## 4. 状态与版本

```text
candidate ──批准提交──► accepted ──被新决策取代──► superseded
    │                      │
    └──拒绝──► rejected     └──显式废弃──► deprecated
```

| 状态 | 参与默认检索 | 说明 |
| --- | --- | --- |
| `candidate` | 否 | 候选，位于 `pending/`，不是正式知识 |
| `accepted` | 是 | 已批准；权威事实 |
| `rejected` | 否 | 被拒绝；留在归档 |
| `superseded` | 否 | 已被新条目取代；保留可查 |
| `deprecated` | 否 | 显式废弃；保留可查 |

- `version` 只在接受变更时递增；修改草稿不递增。
- 旧版本归档到 `history/<type>/<ID>@v<旧版本>.md`，插件自动完成。
- 手工编辑 `accepted` 文件时，请同时把 `version` +1 并更新 `updated_at`；否则账本对账会记录一次 `recovered` 变更。
- `open-questions` 永远不能自动变成 `accepted`；它需要新的证据或被关闭。

## 5. 引用格式

`source_refs` 只接受以下前缀：

| 前缀 | 形式 | 说明 |
| --- | --- | --- |
| `session:` | `session:<sessionId>#<from>-<to>` | 当前/历史会话的事件区间（半开） |
| `file:` | `file:<path>` | 项目内相对路径或绝对路径；只记路径，不读内容 |
| `url:` | `url:<https-url>` | 外部链接；插件不抓取 |
| `note:` | `note:<一句话>` | 无法归类的口头依据；应尽量少用 |

示例：

```yaml
source_refs:
  - session:6f0c1a2b#120-138
  - file:src/cache/broadcast.ts
  - url:https://example.com/rfc/xxxx
```

回顾式萃取（`memory_reflect`）返回的 `seqRange` 就是可填的区间：把 `session:<会话ID>#<from>-<to>` 直接写进候选的 `source_refs`，即可让人在审批时回到原始会话核对。`<from>` / `<to>` 是事件序号，不是时间戳。

## 6. 手工编辑与校验

插件在启动、watcher 变更、`memory_status` 时校验文件。常见错误与处理：

| 错误 | 处理 |
| --- | --- |
| frontmatter 不是合法 YAML | 修正 YAML；文件不会进入索引 |
| `id` 与文件名不一致 | 改名或改 `id` |
| `type` 与目录不一致 | 移动到对应目录 |
| `scope` 格式错误 | 改为 `global` / `domain:<id>` / `project:<id>` |
| 时间缺时区 | 改成 `2026-11-01T09:00:00+08:00` |
| `summary` 缺失 | 补一句话结论 |
| 正文为空 | 补内容或删除文件 |

错误会出现在 `memory_status` 的 `index.errors` 中，包含文件路径与字段；不会导致插件崩溃。

## 7. 备份、git 与迁移

- **备份**：复制整个 Hub 根目录即可（含 `config.yaml`、`knowledge/`、`pending/`、`records/`）。
- **git**：可以把 Hub 根目录放进私有仓库；`records/ledger.jsonl` 与 `history/` 可选，`index/` 不需要提交。
- **迁移**：把目录复制到新机器，修改 `config.yaml` 中 workspace 的 `root`，重启或等待 watcher。
- **格式升级**：frontmatter 的 `format`（可选）标记格式版本；未知版本只读，不会被静默改写。

## 8. 示例合集

### 约束

```markdown
---
id: CON-000002
type: constraint
scope: project:backend
status: accepted
version: 1
title: 渲染进程不得直接访问磁盘
summary: 所有文件操作必须经主进程 IPC，渲染进程只处理内存数据。
source_refs: [file:src/main/ipc.ts]
created_at: '2026-11-01T09:10:00+08:00'
updated_at: '2026-11-01T09:10:00+08:00'
---

## 结论

渲染进程禁止 `fs` 调用；文件读写统一走主进程 IPC 白名单。

## 依据

- 渲染进程加载远程内容，直接磁盘访问扩大攻击面。
- 现有 IPC 层已覆盖全部文件操作。
```

### 未决问题

```markdown
---
id: OQ-000001
type: open-questions
scope: global
status: accepted
version: 1
title: 是否支持多个 Hub 实例共享记忆？
summary: 需要评估多进程写锁与增量索引的可行性；V0.1 先不支持。
source_refs: [note:2026-11-01 设计评审]
created_at: '2026-11-01T09:20:00+08:00'
updated_at: '2026-11-01T09:20:00+08:00'
---

## 问题

同一台机器上 Desktop 与 CLI 同时使用同一 Hub 时，是否允许并发写？

## 当前倾向

V0.1 单写者 + 只读降级；等真实需求出现再设计多实例协议。
```
