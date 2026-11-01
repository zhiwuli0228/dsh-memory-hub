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

未知字段会被保留但忽略；插件不会因为未知字段而拒绝文件。

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
