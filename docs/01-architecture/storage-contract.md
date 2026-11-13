# Storage Contract

## 根目录布局

```text
<root>/
  config.yaml                 # 工作区、策略、版本
  README.md                   # 自动生成的目录说明书（可编辑；同版本不覆盖）
                              # 根目录已有你自己的 README 时，说明书改写到 MEMORY-HUB.md
  knowledge/
    decision/                 # DEC-*.md
    constraint/               # CON-*.md
    knowledge/                # KNO-*.md
    api-catalog/              # API-*.md
    process/                  # PRC-*.md
    open-questions/           # OQ-*.md
    runtime-base/             # RUN-*.md
    playbooks/                # PLAY-*.md
    assets/                   # AST-*.md（外部资源索引，非代码资产）
  pending/                    # PRO-*.md（候选）
  pending/archive/           # 已提交/已拒绝候选归档
  history/<type>/<ID>@v<N>.md # 每次接受变更前的旧版本
  records/
    ledger.jsonl              # 任务、预检、引用、提交、汇总审计日志（只追加）
    sequences.json            # ID 计数器
    index.sqlite              # 派生 SQLite 索引（storage.index 决定；可删可重建）
    maintenance-state.json    # 夜间维护最后运行日期（仅配置 Hub；全局一份）
    reflect-state.json        # 回顾水位（哪些会话已回顾）
    .writer.lock              # 该 Hub 根目录的写锁（每个根一把，互相独立；租约 + fencing token）
  reports/                    # 夜间巡检报告（非权威，可删除/归档）
    <timestamp>.md
    latest.md
  index/                      # 旧版本遗留的空目录（新 Hub 不再创建，可删）
```

`README.md` 由 `src/hub-readme.ts` 生成，内容是本布局的「谁写 / 能否手改 / 删了会怎样」版本，外加九类知识与写入流程；改布局或默认文件时同步更新生成模板与版本号（`HUB_README_VERSION`），旧 Hub 会在下次打开时按标记版本重写。

## `config.yaml`

```yaml
version: 1
core_workspaces:
  - id: product
    name: 产品主仓库
    root: 'E:/projects/product'   # 每个 core 一个独立 Hub
workspaces:
  - id: backend
    core_id: product
    root: 'D:/projects/backend'
    domains: [backend]
    admin: true
    enabled: true
policy:
  preflight:
    mode: per-turn
    pack_tokens: 600
    max_hits: 6
    min_score: 1.0       # drop weak matches; 0 keeps every BM25 hit
    local_boost: 1.2     # prefer project:<current-workspace> over core hits
    inject: compact
  gate:
    mode: enforce
    on_preflight_error: allow
    unknown_tools: allow
    mutating_tools: [bash, pwsh, write, edit, str_replace_editor]
    exempt_tools: [memory_search, memory_get, memory_status, memory_preflight,
                   memory_cite, memory_propose, memory_commit,
                   memory_close_task, memory_consolidate, memory_maintenance]
  evidence:
    required_for: [decision, constraint, process, api-catalog, runtime-base, playbooks]
  limits:
    max_pending_per_task: 20
    max_body_bytes: 65536
    max_source_refs: 20
  maintenance:
    enabled: false
    time: '03:00'
    apply: propose
    all_cores: true
    max_proposals: 10
    stale_pending_days: 30
    stale_citation_days: 90
consolidation:
  mode: manual
  target_scope: global
storage:
  watch: true
  lock_stale_ms: 600000
```

约束：

- 未知字段保留但忽略。
- `version` 不认识时进入只读。
- 配置热更新由 watcher 触发。
- `policy.maintenance` 是**全局**策略；每个 core 不再有独立调度配置。
- `maintenance-state.json` 只写在配置 Hub（默认 `~/.dsh/memory-hub`）；每个 core 的 `reports/` 与 `pending/` 仍写在自己的 root 下。
- 同一个 `id` 可以同时出现在 `core_workspaces` 与 `workspaces`（V0.1.7 双角色）：`core_workspaces` 给 root 打开独立 Hub，`workspaces` 里该条目的 `core_id` 指向父核心。此时 `core_id` 不得等于 `id`；会话路由到自己的核心 Hub，父核心 Hub 作为分级蒸馏的二级来源。
- 金字塔上级链由 `workspaces[].core_id` 逐层推导（父、祖父、…，最多 8 层）；运行时带环检测，成环即截断，不依赖任何额外配置字段。

## `records/.writer.lock`

写锁是**租约**，不是永久标记（[ADR-0009](../01-architecture/decisions/ADR-0009-writer-lock-lease.md)）：

```json
{
  "v": 2,
  "pid": 347640,
  "host": "DESKTOP-XXXX",
  "startedAt": "2026-11-13T07:38:00.000Z",
  "heartbeatAt": "2026-11-13T07:48:00.000Z",
  "token": "3f9a1c0d7b2e4a55"
}
```

- 持有者每 15 秒重写一次 `heartbeatAt`（若 `lock_stale_ms` 更短则缩到租约的 1/4）；租约 = `heartbeatAt + storage.lock_stale_ms`（默认 600000ms）。
- 回收条件（按优先级）：`host` 非本机 → `dead-process`（pid 不存在）→ `stale-heartbeat`（心跳超租约）→ `corrupt`（读不出 JSON 且 mtime 超租约）。回收走 `rename` + 复核的 CAS，不会误删刚刷新过的锁。
- `token` 是 fencing token：每次获取随机生成，**每次写操作前**都会复核锁文件里的 `token`/`pid`；租约被抢走的旧写者会降级为只读。
- 该文件可安全删除：删掉等于“没人持锁”，下一个写者会重新创建。但如果你删的是**活写者**的锁，会短暂出现两个写者——优先等租约到期。
- 旧格式（v0.7：无 `v`、无 `token`）仍可读：按 `heartbeatAt` 判定租约，`token` 视为 `null`。

## 双角色 / 金字塔配置示例

```yaml
core_workspaces:
  - id: dsh-memory-hub
    name: 记忆中枢
    root: 'E:/009workspace/dsh/dsh-memory-hub'   # 自己的 Hub
  - id: dsh-plugin-dev
    name: 插件开发
    root: 'E:/009workspace/dsh/dsh-plugin-dev'
  - id: product
    name: 产品主仓
    root: 'E:/009workspace/dsh/dsh-memory-hub/dsh-memory-hub'
workspaces:
  - id: dsh-plugin-dev
    core_id: product                             # 插件开发同时是产品主仓的子工作区
    root: 'E:/009workspace/dsh/dsh-plugin-dev'
    domains: []
    admin: true
    enabled: true
  - id: dsh-memory-hub
    core_id: dsh-plugin-dev                      # 记忆中枢同时是插件开发的子工作区
    root: 'E:/009workspace/dsh/dsh-memory-hub'
    domains: []
    admin: true
    enabled: true
```

`dsh-memory-hub` 会话的金字塔链为 近→远 `[dsh-plugin-dev, product]`：L1 写 `project:dsh-memory-hub`（自己的 Hub，最完整）；L2 用 `scope:"parent"` 写 `project:dsh-plugin-dev`；L3+ 用显式 `project:product` 上推到顶层。

## 知识 Markdown

详见 [KNOWLEDGE-FORMAT.md](../KNOWLEDGE-FORMAT.md)。

核心字段：

```yaml
id: DEC-000001
type: decision
scope: project:backend
status: accepted
version: 1
title: 缓存广播使用版本号
summary: 广播消息携带单调版本号，接收端丢弃过期消息。
source_refs: [file:src/cache/broadcast.ts]
related: []
supersedes: []
promoted_from: null
created_at: '2026-11-01T09:00:00+08:00'
updated_at: '2026-11-01T09:00:00+08:00'
```

## Pending

- `pending/PRO-*.md`：候选知识，状态为 `candidate`。
- `pending/archive/`：已提交或已拒绝候选。
- 文件名与 `id` 一致。

## Ledger

`records/ledger.jsonl`，每行一个 JSON 对象，追加写、末尾 fsync。

示例：

```json
{"v":1,"type":"task.created","at":"...","taskId":"TSK-...","sessionId":"s-123","turn":4,"workspaceId":"backend","intentHash":"sha256:...","idempotencyKey":"s-123:4"}
{"v":1,"type":"preflight.recorded","at":"...","taskId":"...","preflightId":"PF-...","status":"ready","hits":[{"id":"DEC-000001","version":3}],"tokens":182}
{"v":1,"type":"citation.added","at":"...","taskId":"...","citationId":"CIT-...","knowledgeId":"DEC-000001","version":3,"purpose":"..."}
{"v":1,"type":"proposal.created","at":"...","taskId":"...","proposalId":"PRO-000003"}
{"v":1,"type":"proposal.committed","at":"...","proposalId":"PRO-000003","knowledgeId":"DEC-000012","version":2,"approvalRef":"approval:..."}
{"v":1,"type":"task.closed","at":"...","taskId":"...","assessment":{"kind":"no_new_knowledge","reason":"仅修改样式"}}
```

## Index

当前为内存倒排索引，启动时全量扫描重建。`index/` 目录预留用于未来落盘/增量重建。

## History

每次 `accepted` 状态变更时，旧版本复制到 `history/<type>/<ID>@v<N>.md`。
