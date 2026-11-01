# Storage Contract

## 根目录布局

```text
<root>/
  config.yaml                 # 工作区、策略、版本
  README.md                   # 首次创建时生成的说明
  knowledge/
    decision/                 # DEC-*.md
    constraint/               # CON-*.md
    knowledge/                # KNO-*.md
    api-catalog/              # API-*.md
    process/                  # PRC-*.md
    open-questions/           # OQ-*.md
    runtime-base/             # RUN-*.md
    playbooks/                # PLAY-*.md
    assets/                   # AST-*.md
  pending/                    # PRO-*.md（候选）
  pending/archive/           # 已提交/已拒绝候选归档
  history/<type>/<ID>@v<N>.md # 每次接受变更前的旧版本
  records/
    ledger.jsonl              # 任务、预检、引用、提交、汇总审计日志
    sequences.json            # ID 计数器
    maintenance-state.json    # 夜间维护最后运行日期（避免同一天重复）
    .writer.lock              # 单写者锁
  reports/                    # 夜间巡检报告（非权威，可删除/归档）
    <timestamp>.md
    latest.md
  index/                      # 预留：未来索引落盘
```

## `config.yaml`

```yaml
version: 1
core_workspaces:
  - id: product
    name: 产品主仓库
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
