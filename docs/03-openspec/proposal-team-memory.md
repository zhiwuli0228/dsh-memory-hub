# Proposal: team-memory-server（项目组三级记忆 + 实时同步）

> 状态：草案（2026-11-12）· 关联调研：[server-memory-2026.md](../05-domain/server-memory-2026.md)
> 一句话：**沿用现有的 `global / domain / project` 三级，不发明新语法；把上两级的权威搬到一台组内服务器上，用事件流做实时，用版本号做冲突；本地永远是工作副本。**

---

## 1. Problem

现在是单机插件：一个 Hub 根、一个写者、零依赖。项目组的真实诉求正好是三层：

- **项目组**：跨小组的规范、架构决策、公共约定 —— 大家都要看，但只有少数人能写（≈ 现有 `global`）；
- **小组**：3–8 人共享项目背景、接口约定、排障经验 —— 改了要马上看到（≈ 现有 `domain:<id>`）；
- **个人**：自己的决策与踩坑，换机器要能用（≈ 现有 `project:<workspace-id>`）。

现有金字塔已经把这三层**表达**出来了（`scope.ts` 的 `global / domain / project` + 核心祖先链），缺的只有三件事：

1. 上两级**没有服务器权威**：同组的人各自本地一份，靠 git 传来传去；
2. **没有成员与角色**：`domain:<id>` 只是一个字符串，不代表"这个小组的人能写"；
3. **没有实时**：别人今天写的结论，我明天才看到。

反过来，直接换 Mem0 / TencentDB Agent Memory 这类托管形态，会丢掉「文件即真相 + 人审才入」。

所以要做的是：**在不改作用域语法、不改文件格式、不丢本地模式的前提下，把上两级交给一台组内服务器，并让它实时。**

## 2. Goal

1. 部署组内服务后，`domain` / `global` 两层的变更**实时**可见（局域网 p95 ≤ 1s）。
2. 不部署服务器时，插件行为与 0.7.0 **完全一致**（单机、离线、可 git 管理）。
3. 保持三条硬规则：文件是真相、模型不能自批、Markdown/YAML 可读可迁移。
4. 每层都能回答：谁能写、谁批的、什么时候、哪台机器。

## 3. Scope

- 权威分层：`global` / `domain:<id>` 由服务器持有；`project:<id>` 默认本地持有（可选同步）。
- 成员与角色：用户 → 小组（domain）→ 项目组（hub），角色 `reader < proposer < reviewer < admin`。
- 实时同步：SSE 事件流 + `seq` 游标 + 客户端增量更新索引。
- 冲突：`ETag` + `409`，**不自动合并**，交给人看 diff。
- 离线：本地缓存只读 + 个人作用域可写 + 出站队列重放。
- 服务端布局：与本地 Hub 同构（`knowledge/` + `records/`），可整目录备份、可 git 镜像。

## 4. Out of Scope

- 不做同一条知识的实时协同编辑（CRDT）；一条知识一个文件，冲突面天然很小。
- 不做服务端自动抽取 / 自动合并 / 后台改写正文。
- 不做公网 SaaS、计费、多客户隔离（单项目组内网自托管）。
- 不把向量库设为必需（服务端可选另建派生索引，默认仍 BM25 + 词法）。
- 不做跨项目组联邦（留给"记忆包"）。

## 5. 设计总览

```text
        ┌──────────── 项目组服务器（可选，内网）────────────┐
        │  Hub 根（与本地同构）                              │
        │  ├─ global          ── 项目组规范：只读，发布需 admin 二次审批
        │  ├─ domain:<team>   ── 小组知识：成员提案 + reviewer 审批
        │  └─ records/events.jsonl ── 追加式变更流（seq 单调）
        └──────────▲───────────────────────────┬───────────┘
       SSE + ETag  │                           │ 提案 / 审批
                   │                           ▼
  ┌────────────────┴────────────────────────────────────┐
  │ 本地 Hub（始终是工作副本）                              │
  │  project:<workspace>  ── 本地权威（可配置同步）          │
  │  domain/global 缓存   ── 只读 + 提案 outbox             │
  └─────────────────────────────────────────────────────┘
```

三条不变量：

1. 只有服务器能写 `global` / `domain` 的权威文件；本地缓存永不被当成真相。
2. 只有人（或被授权的 reviewer）能批准；服务器和模型都不能自批。
3. 换服务器不换格式：服务端就是若干个普通 Hub，`knowledge/<type>/<ID>.md` 一模一样。

## 6. 作用域与权威矩阵

| 作用域 | 语义 | 权威位置 | 谁能写 | 谁批准 | 断网时 |
| --- | --- | --- | --- | --- | --- |
| `global` | 项目组 | 服务器 Hub | admin（或小组发布晋升） | admin 二次审批 | 只读缓存 |
| `domain:<team>` | 小组 | 服务器 Hub | 成员（提案） | team reviewer | 只读缓存 + outbox |
| `project:<ws>` | 个人 | 本地 Hub | 本人（模型提案） | 本人（DSH 原生审批） | 全功能 |

映射关系（现有实现的语义不变，只补权威与角色）：

- `scope.ts` 的校验规则**不改**：仍是 `global | domain:<id> | project:<workspace-id>`。
- `domain:<id>` 的 `id` 即小组 id，服务器侧把它绑到成员表；本地 Hub 里同名 domain 视为"缓存副本"。
- `project:<ws>` 仍是每台机器自己的；`sync_project: false`（默认）时个人记忆不出本机。

**晋升**（确定性、可审计）：`domain` 条目被 cite ≥ k 次 → 面板提示"可发布到项目组" → 生成 `global` 提案 → admin 审批 → 通过后在服务器写 `global` 记录并在 `source_refs` 指向原 `domain` 条目；**原文件保留**，不是搬家。

## 7. 实时同步协议（最小可行）

鉴权：每台机器一个 token（`Authorization: Bearer`），claims 含 `user`、`hub`、`domains[]`、`role`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/scopes` | 可见作用域 + 我的角色 + 各 scope 的 `lastSeq` |
| GET | `/v1/sync/snapshot?scope=` | 冷启动/游标过期：`{lastSeq, files:[{id,version,etag,hash}]}` |
| GET | `/v1/sync/events?after=<seq>` | 批量补拉：`200 {events,next}`；`410` 表示游标过期 → 重拉 snapshot |
| GET | `/v1/stream?after=<seq>` | **SSE**；`id:` 即 `seq`，15s 心跳注释行，断线用 `Last-Event-ID` 续传 |
| GET | `/v1/knowledge/<id>` | Markdown + `ETag: W/"<version>"`（记录自带 scope） |
| PUT | `/v1/knowledge/<id>` | 条件写：`If-Match: "<version>"`；失配 `412`（返回 base/ours/theirs）；`If-None-Match: *` 才允许创建 |
| POST | `/v1/proposals` | 创建提案（带 `baseVersion` 与幂等键 `clientOpId`） |
| POST | `/v1/approvals/<proposalId>` | reviewer 批准 / 拒绝 |
| POST | `/v1/cites` | 引用计数（可离线批量重放） |

事件（追加式 `records/events.jsonl`，`seq` 单调且永不复用）：

```json
{"seq":1024,"at":"2026-11-12T14:10:00Z","scope":"domain:backend",
 "kind":"proposal.approved","id":"DEC-000021","version":3,
 "actor":"user:alice","proposalId":"PRO-000107"}
```

**`seq` 与 `version` 是两件事**：`seq` 是日志位置（单调、可重放、用于游标）；`version` 是单文件 CAS 版本（用于 `If-Match`）。混用会把"日志走到哪"误判成"文件被谁改过"。

客户端行为：

1. 启动 → `GET /v1/scopes` 取游标 → 无缓存则 `/v1/sync/snapshot`，有缓存则 `after=<lastSeq>` 补拉或直接订阅 SSE。
2. 收到事件 → 更新对应作用域的缓存文件 + **增量**更新索引（不重建）；**应用成功后才推进落盘的 `lastSeq`**（同一事务，宁重复勿漏）。
3. 事件 `seq` 出现空洞 → 停订、`/v1/sync/events?after=` 补齐；返回 `410` 就重拉 snapshot。
4. 写 `domain/global` → `POST /v1/proposals`（或由 reviewer 直接条件写）；写 `project` → 本地照旧。
5. **412** → 不重试、不合并：把 `base / ours / theirs` 三方 diff 交给用户（覆盖 / 追加 / 放弃）；离线重放遇到 412 时进"待人审"队列。

**冲突语义**：不同 `ID` 永不冲突（一条一文件是天然分片）；同一条知识并发写 → 先到者生效，后到者 `412`。`409` 只用于"创建时已存在"或"并发删除"。

**四个最容易出错的点**：

1. **代理缓冲**：SSE 经 nginx 会被缓冲，看起来"没实时"；要 `X-Accel-Buffering: no` + 关 `proxy_buffering` + 15s 心跳注释行。
2. **`Last-Event-ID` 只作提示**：以本地落盘的 `lastSeq` 为准，落后太多直接重拉 snapshot，不要硬放 SSE。
3. **`seq` 当版本号**：见上；两者必须分离。
4. **把"收到事件"当"已应用"**：cursor 必须与应用同事务推进，否则断线就丢一条。

**鉴权细节（SSE 特有）**：`EventSource` 不能自定义头，token 放 query 会进访问日志；因此客户端用 `fetch` 的流式响应（或 Cookie + `withCredentials`）携带 `Authorization`，不要用裸 `EventSource`。

## 8. 离线与本地模式

- `server.enabled: false`（默认）：完全不连服务器，行为与 0.7.0 一致。
- 启用后断网：
  - 读：用本地缓存（上次同步的 `knowledge/` + 本地索引），结果标 `stale: true`；
  - 写：`project` 正常写；`domain/global` 写进 `records/outbox.jsonl`；
  - 重连：按 `clientOpId` 幂等重放，逐条处理 `200` / `409` / `412`（`412` 进"待人审"队列，不自动覆盖）。
- **手改文件**：离线期间直接编辑缓存 `knowledge/*.md` 不会进事件流；启动时用 `hash` 比对发现本地漂移，标为"本地草稿"，提示转为提案。
- `sync_project`（默认 false）：打开后个人条目上传为私有副本（仅本人可见），用于换机与备份。

## 9. 权限模型

- 角色（按 scope）：`reader` < `proposer` < `reviewer` < `admin`。
- 成员关系：`user → domain:<team>`、`domain:<team> → global`（可多组）。
- 鉴权：**scope 即 ACL**（`domain:<id>` / `global`），不做通用 RBAC 引擎；token 只带被授予的 scope 列表。
- 审批人不能是提案人（服务器强制 `actor ≠ reviewer`），与我们"模型不能自批"同构。
- 审计：`ledger.jsonl` 增 `actor` / `role` / `clientOpId`；服务器另记 `access.jsonl`（谁在何时读了哪个 scope）。

## 10. 服务器部署与数据布局

```text
<server-root>/
├── config.yaml                 # domains / members / roles；token 只存哈希
├── knowledge/<type>/<ID>.md     # global 与 domain:* 记录，格式与本地完全一致
├── records/{ledger.jsonl,events.jsonl,sequences.json}
├── pending/PRO-*.md             # 服务端待审提案
└── index/index.sqlite           # 派生，可删可重建
```

- 单进程 Node 服务 + 纯文件存储（SQLite 仅派生索引）；TLS 交给反向代理；内网部署。
- 备份 = 复制目录；可选 git 镜像，事件流与知识文件都可 diff。
- 与本地同构：任何机器拿到的 `knowledge/` 都能被现有插件直接打开（只读也行）。

## 11. 与现有实现的映射

| 现有 | 变化 |
| --- | --- |
| `memory_search` / `memory_get` | 命中 `domain/global` 时从服务器取（或读缓存），结果带 `stale` 标记 |
| `memory_propose` | 增 `scope` 解析：本地 scope 走原路径，远程 scope 转 `POST /v1/proposals` |
| `memory_commit` | 不变（本地 `project`）；远程 scope 由 reviewer 在服务器/面板批准 |
| 新增 `memory_sync_status` | 游标、缓存新鲜度、outbox 长度、上次成功同步时间 |
| `config.yaml` | 新增 `server: {enabled, url, token, sync_project}` |
| 索引 | 客户端增量更新沿用现有写入路径；缺口触发重扫 |

## 12. Affected Modules

- runtime / service / store / search / frontmatter / ledger / config / hub / scope / lock / tools / client.js / docs
- 新增：`sync.ts`（SSE + outbox + 游标）、`server/`（HTTP + 事件流 + 鉴权）

## 13. Storage Impact

- `config.yaml`：新增 `server` 段。
- `knowledge/<type>/<id>.md`：不变（`scope` 取值不变）。
- `pending/PRO-*.md`：新增 `baseVersion`（远程提案用）。
- `records/ledger.jsonl`：新增 `actor` / `clientOpId`（向后兼容）。
- `records/sequences.json`：不变。
- 新增 `records/outbox.jsonl`（仅客户端，可删）。
- 新增服务端 `records/events.jsonl`（追加式，不可删；删除等于丢历史）。
- 索引：增量按 `id` 删旧行插新行；**contentless FTS5 的 DELETE 必须提供插入时相同的列值**，否则索引不可预测（要么保留 `content` 副本，要么用 `contentless_delete` 的 tombstone 方案），实现时必须先确认这一条再动 `index-sqlite.ts`。

## 14. Constraints

- [x] 不引入强制性数据库（SQLite 仅派生索引，服务端存的是文件）。
- [x] 默认不使用向量库。
- [x] `memory_commit` 仍需 DSH 审批；远程 scope 的审批人是 reviewer，且必须 `actor ≠ reviewer`。
- [x] 文件是真相。
- [x] 不启用服务器时行为与 0.7.0 完全一致（回归测试保证）。

## 15. Risks

1. **服务器成了单点**：宕机时 `domain/global` 只读。缓解：本地缓存 + `stale` 标记；状态可整目录恢复。
2. **"本地是权威"的直觉被打破**：用户可能以为改本地缓存就生效。缓解：缓存只读、写只走提案、面板显示权威位置。
3. **权限误配泄露知识**：scope 即 ACL，写错就漏。缓解：默认拒绝 + 越权测试矩阵 + 越权读返回 404（不泄露存在性）。
4. **事件流断裂**：`seq` 空洞导致静默不一致。缓解：空洞即停订、强制 `/sync`、`lastSeq` 落盘。
5. **复杂度失控**：实时 + 权限 + 离线叠加。缓解：M1/M2/M3 分阶段，M1 不含审批与离线。

## 16. Verification

- 回归：不配置 `server` 时，现有测试全绿（行为等价）。
- 实时：两台客户端，A 批准后 B 收到事件并命中新知识，p95 ≤ 1s（局域网）。
- 冲突：并发对同一 ID 提案 → 后到者 `412`，本地不被覆盖，且返回三方 diff。
- 断网：团队写作入 outbox、个人可写；重连幂等重放，无重复条目；离线手改被判为"本地草稿"。
- 权限：`reader` 提案 → 403；`reviewer` 批 `global` → 403；越权读 → 404。
- 规模：单 scope 1 万条，冷启动 `/sync` + 增量索引 ≤ 5s；检索 p50 与单机持平。

## 17. 分阶段落地

| 阶段 | 内容 | 验收 | 量级 |
| --- | --- | --- | --- |
| M1 | 服务端骨架（scopes / token / 读 / SSE）+ 客户端同步 + 缓存 | 实时可见、本地模式不变 | 1–2 周 |
| M2 | 提案 / 审批 / outbox / 面板状态 | 多人写入闭环、断网可恢复 | 2–3 周 |
| M3 | `global` 层 + 晋升 + 审计 + 部署文档 | 三级复用跑通、可备份恢复 | 2–3 周 |

## 18. Alternatives

- **借船（建议先花半天验证）**：部署 [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) 的 v2.0.1-beta 四件套，按它的 INSTALL 把 `llm-deepseek.baseURL` 指到 `/dsh/<spaceId>`，让它在每轮注入 L2/L3 + Skill。**它的团队/权限/面板已经能用**，我们要的"三级 + 实时"它近似满足。代价是：真相在 `~/.memory-tencentdb`（不是我们的 Markdown）、写入靠 LLM 自动抽取（不是人审）、没有推送（每轮现拉）。**结论：用它做一次真实项目的对照实验，量出"它够不够用"，再决定要不要自建**——这是最省钱的一步。
- **纯 git 中继**：零开发，但没有实时与角色；可作为 M1 之前的过渡。
- **纯 SaaS（Mem0 Cloud / 百炼记忆库）**：最快，但放弃文件即真相与零依赖，与定位冲突。

## 19. 协议依据

- [WHATWG — Server-Sent Events](https://html.spec.whatwg.org/dev/server-sent-events.html)：`Last-Event-ID` 续传、`id:` 游标、重连语义。
- [MDN — If-Match](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/If-Match)：`412` 用于条件写失配，`If-None-Match: *` 用于仅创建。
- [AWS S3 — Conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)：对象存储上的 CAS 语义与并发边界。
- [SQLite FTS5](https://sqlite.org/fts5.html)：contentless 表的删除约束（增量索引的坑）。
- [Kafka — Log compaction](https://docs.confluent.io/kafka/design/log_compaction.html)：`seq` 单调、offset 不复用、顺序不变。
- [git-sync](https://github.com/kubernetes/git-sync) / [obsidian-git](https://github.com/Vinzent03/obsidian-git)：git 做同步的现实边界（快照式、移动端脆弱），只适合备份与审计。
- [Automerge](https://automerge.org/) / [Yjs](https://github.com/yjs/yjs)：CRDT 的定位是多人协作文档，不适用于"一知识一文件 + 人审"。
