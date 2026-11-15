# Proposal: remote-providers（本地权威 + 可插拔远端记忆）

> 状态：M0 已实现（2026-11-14）· 关联：[proposal-tencent-bridge.md](proposal-tencent-bridge.md)（已实现的腾讯桥）、[proposal-team-memory.md](proposal-team-memory.md)（自建组内服务器）、[remote-provider-patterns-2026.md](../05-domain/remote-provider-patterns-2026.md)（全网调研）
> 一句话：**把"腾讯桥"从硬编码的一条通道，抽成"一条本地权威 + 若干按角色挂载的远端 provider"；腾讯只是第一个 adapter，换家只换配置，不动数据模型。**

---

## 1. Problem

V0.7.2 已经跑通了腾讯桥（pull/push/outbox/游标/幂等），但它有三个结构性限制，恰好卡住"本地 + 远端协同、自由度要高"这个诉求：

1. **写死了一家**：`config.tencent` 是独立顶层段，`TencentClient` 只在 `service.tencentPull/Push` 里被实例化。想接第二家（自建团队服务器、Mem0、Basic Memory、任何 REST 记忆服务）必须再抄一遍 `tencent-sync.ts`（385 行里约 200 行是 provider 无关的 outbox/游标/幂等逻辑）。
2. **语义不对称**：pull 会生成候选、push 只会追加消息、**删不掉**。本地一条知识被 `deprecate` 或 `merge` 掉之后，远端那份会永远留着——这正是 [atlas 调研](https://github.com/neoneye/agent-memory-atlas/blob/21afbd103c6e6097db5df307921dfafad7b121e8/content/patterns/pluggable-memory-provider.md) 点名的"跨边界最先丢的治理能力：`forget` 与 per-call `scope`"。
3. **能力不可知**：我们默认腾讯"只能追加、不能删改"，但腾讯其实有 `atomic/delete`、`scenario/rm`（见[官方适配器说明](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/9742dfa3cb524bf52c82fe7b5fe9a1e45ec11d15/adapters/plandex/README_CN.md)）。反过来，未来的 provider 可能只读、可能有原生变更流。**接口不声明能力，宿主只能按最弱的假设走。**

## 2. Goal

1. **换家只改配置**：新增 `remote.providers[]`，腾讯作为 `kind: tencent` 的第一个实现；接口、outbox、游标、审计、降级全部复用。
2. **本地永远权威**：文件是事实源；远端只有四种角色（`feed` / `mirror` / `authority` / `index`），角色决定它能不能写回本地。
3. **治理不丢**：`scope` 进每一次调用签名；删除/deprecate 能跨边界传播，删不掉要记成显式孤儿，不许假装成功。
4. **能力可声明、可拒答**：每个 provider 报 `capabilities()`，不支持的操作返回 `unsupported` 而不是静默 no-op。
5. **零网络默认**：`remote.enabled: false`（默认）时行为与 V0.7.2 完全一致，不初始化任何 client、不注册定时器（回归测试锁定）。
6. **向后兼容**：现有 `tencent:` 配置段**继续有效**，内部 desugar 成 `remote.providers[0]`；现有 3 个 `memory_tencent_*` 工具保留为别名。

## 3. Scope

- 新增 `src/remote/types.ts`：`RemoteAdapter` 接口、`RemoteRecord`、`RemoteCapability`、错误词汇表。
- 新增 `src/remote/registry.ts`：kind → factory 注册表 + 配置校验 + 实例生命周期。
- 新增 `src/remote/sync.ts`：provider 无关的同步引擎（游标、outbox、幂等、角色编排），从 `tencent-sync.ts` 抽取。
- 新增 `src/remote/adapters/tencent.ts`：把现有 `tencent-client.ts` 包成 adapter（不改协议实现）。
- 新增 `src/remote/adapters/http-json.ts`：声明式 HTTP 适配器（见 §5.6），让"其他家"不写代码也能接。
- 改造 `src/config.ts`：新增 `remote` 段 + `tencent` 兼容 desugar。
- 改造 `src/service.ts` / `src/tools.ts`：`memory_remote_status` / `memory_remote_sync` / `memory_remote_forget`，旧工具转别名。
- 删除传播：`deprecate` / `merge` 提交后入 outbox（`op: forget`）。

## 4. Out of Scope

- 不做远端侧的审批（远端没有人工审批模型，一律走"候选/追加 + 本地人审"）。
- 不做双向自动合并（CRDT / 三方合并算法）：冲突只标记、交人审。
- 不做公网 SaaS 托管、计费、多租户隔离引擎。
- 不把任何远端设为必需依赖。
- 不改 `knowledge/` 文件格式（`format` 仍为 1）。

## 5. 设计

### 5.1 角色，而不是厂商

远端按"它对本地记忆系统扮演什么角色"接入，一个 provider 可以同时担任多个角色：

| 角色 | 方向 | 语义 | 典型实现 |
| --- | --- | --- | --- |
| `feed` | 远端 → 本地候选 | 拉远端条目 → `pending/`，**人审才入库** | 腾讯 L1/L2 |
| `mirror` | 本地 → 远端 | accepted / deprecate 分发出去；失败进 outbox | 腾讯 conversation |
| `authority` | 远端权威、本地缓存 | 只对 `global` / `domain:*` 层生效，本地写走提案 + CAS | 自建 team-server |
| `index` | 只读检索增强 | 只参与检索、不写回、不产生候选 | 任何只读服务 |

不变量：

1. 角色决定方向，**方向决定谁能写**——`feed` 永远不能直接写 `knowledge/`。
2. `authority` 与 `mirror` 对同一 scope **互斥**（配置校验期拒绝），否则两份权威。
3. 任何 provider 故障都不阻塞主流程：降级成诊断（`lastError`），回合照常结束。

### 5.2 接口（`src/remote/types.ts`）

```ts
export type RemoteCapability =
  | 'read.list' | 'read.search' | 'read.get'
  | 'write.append' | 'write.upsert' | 'write.delete'
  | 'scope'            // 支持 per-call 作用域（而非进程级绑定）
  | 'changes'          // 有原生变更流/增量游标
  | 'realtime'         // 有推送（SSE/webhook）
  | 'extract'          // 远端会自己抽取（L0→L1）
  | 'idempotent'       // 支持幂等键

export interface RemoteRecord {
  externalId: string
  title: string
  summary: string
  body: string
  scope?: string                 // 'global' | 'domain:<id>' | 'project:<id>'
  tags: string[]
  updatedAt?: string
  version?: string               // 远端 CAS 版本（有则用于冲突检测）
  raw: unknown                   // 原样保留，便于适配器二次加工
}

export interface RemoteQuery {
  text?: string
  scope?: string
  types?: string[]
  limit: number
  cursor?: string
}

export interface RemotePage<T> {
  items: T[]
  cursor?: string
  total?: number
  /** 游标失效，调用方应重拉快照（对应 HTTP 410 语义） */
  resetRequired?: boolean
}

export interface RemoteAdapter {
  readonly id: string
  readonly kind: string
  capabilities(): ReadonlySet<RemoteCapability>
  /** 只读探活；不抛错，失败返回 ok:false + 诊断 */
  probe(): Promise<{ ok: boolean; latencyMs?: number; detail?: string }>

  list?(q: RemoteQuery): Promise<RemotePage<RemoteRecord>>
  search?(q: RemoteQuery): Promise<RemotePage<RemoteRecord>>
  get?(externalId: string, scope?: string): Promise<RemoteRecord | null>

  append?(rec: RemoteRecord, opts: { idempotencyKey: string }): Promise<{ externalId: string }>
  upsert?(rec: RemoteRecord, opts: { idempotencyKey: string; baseVersion?: string }): Promise<{ externalId: string; version?: string }>
  /** 删除/作废。没有此能力的 provider 必须让 forget 返回 unsupported，而不是静默成功 */
  delete?(externalId: string, opts: { scope?: string; reason: string }): Promise<void>

  changesSince?(cursor: string | null): Promise<RemotePage<RemoteRecord>>
  close?(): Promise<void>
}
```

**错误词汇表**（照抄 Cosmonapse 的思路，但只保留我们真会遇到的四种）：

```ts
type RemoteErrorKind =
  | 'unreachable'   // 网络/超时 → 降级为诊断，进 outbox
  | 'unauthorized'  // 401/403 → 不重试，提示换凭据
  | 'unsupported'   // 能力不支持 → 明确拒答，不静默 no-op
  | 'conflict'      // 412/409 → 交人审 diff，不自动合并
```

### 5.3 配置（`config.yaml`）

```yaml
remote:
  enabled: false                 # 总开关，默认关 → 零网络请求
  mode: local-first              # local-first | hybrid | remote-authority
  providers:
    - id: tencent                # 实例 id，账本与工具参数都用它
      kind: tencent              # 注册表里的 adapter kind
      enabled: true
      roles: [feed, mirror]
      # 投影：哪些本地知识允许分发出去（缺省 = 全部，显式更安全）
      projection:
        scopes: [global, domain:*]
        types: [decision, constraint, knowledge, api-catalog, process]
        exclude_tags: [local-only]
      feed:
        scope: global
        type: knowledge
        limit: 50
        tags: [tencent]
      mirror:
        trigger: manual          # manual | accepted | schedule
        include_body: true
        max_body_chars: 4000     # 硬顶：远端只收摘要+截断正文
      # 删除/作废向远端传播。默认只传播"明确作废"，不传播"合并"。
      forget:
        on_deprecate: true       # 默认开：本地明确作废 → 远端同步作废
        on_merge: false          # 默认关：merge 是"折叠成一条"不是"删除"；团队需要时显式打开
        max_per_run: 100         # 单次传播上限（0 = 不限）；**面板「配置」页可改**，见 §5.5.1
      conflict: remote-propose   # remote-propose | local-wins | cas
      config:                    # 原 tencent 段字段原样搬进来
        url: http://127.0.0.1:8420
        api_key_env: PROXY_USER_KEY
        service_id: default
        team_id: ''
        agent_id: ''
        user_id: ''
        task_id: ''
        timeout_ms: 10000
```

**兼容 desugar**：若配置里只有 `tencent:` 而没有 `remote.providers`，运行时合成

```yaml
remote.enabled: <tencent.enabled>
remote.providers: [{ id: tencent, kind: tencent, roles: [feed, mirror], config: <tencent 段> }]
```

旧配置行为逐字不变（回归测试用同一份 `config.yaml` 跑两遍，断言工具输出与网络调用次数相同）。

### 5.4 同步引擎（`src/remote/sync.ts`）

从 `tencent-sync.ts` 抽出、与 provider 无关的骨架：

```text
records/remote/<providerId>/state.json     # 游标、lastPullAt/lastPushAt、lastError、pulledIds/pushedIds（有界 2000）
records/remote/<providerId>/outbox.jsonl   # 待重放操作（append / upsert / forget）
```

- **feed**：`list/changesSince(after=cursor)` → 逐条 `proposeCandidate()`（**绝不 commit**）→ 成功才推进 `pulledIds`。
- **mirror**：accepted → `append/upsert`。失败进 outbox，`idempotencyKey = <providerId>:<op>:<knowledgeId>:<version>`。
- **forget（作废传播）**：受 `mirror.forget` 两个开关控制，默认只传播 `deprecate`；`merge` 默认**不传播**（见 §5.5）。
- **outbox 重放**：按 provider 分区、串行、逐条 try/catch；`conflict` 不重试（转"待人审"队列），`unreachable` 保留重试。
- **审计**：账本统一记 `remote.sync`（`{provider, direction, pulled, proposed, pushed, forgotten, outboxed}`），保留旧的 `tencent.pull` / `tencent.push` 作为 sub-type 以免破坏既有观测。

### 5.5 删除传播（本提案的核心补齐）

**默认策略：只传播"明确作废"，不传播"合并"。** 理由是 `deprecate` 语义单一（这条不再成立），而 `merge` 是"折叠成一条"——被合并项的内容已经在 target 的正文里活着，远端那份不必然该消失；如果远端支持检索，保留它反而扩大了召回面。所以 `merge` 的传播做成**团队显式开关**。

| 本地动作 | 开关（默认） | 远端有 `write.delete` | 远端不支持删除 |
| --- | --- | --- | --- |
| `memory_approve` 收到 `deprecate` 提案 | `forget.on_deprecate: true` | `delete(externalId, {reason})` | 追加一条"已废弃"标记消息（若支持 `write.append`），并在 `records/remote/<id>/orphans.jsonl` 记孤儿 |
| `merge` 提交（被合并项 superseded） | `forget.on_merge: false`（**默认关**） | 同上，逐条传播，受 `max_per_run` 限制 | 同上 |
| `memory_remote_forget`（人工显式遗忘） | 总是执行 | 必须删成功或报错 | 返回 `unsupported` + 孤儿清单，**不假装成功** |

三个配套约束：

1. **`on_merge: true` 只对"已经镜像出去过"的条目生效**——没 push 过的条目远端没有副本，不该产生 `forget` 请求（否则 outbox 里全是无效操作）。
2. **`max_per_run` 不写死在代码里，由面板配置**（默认 100，`0` = 不限），见 §5.5.1；超出部分留在 outbox，下次同步继续。
3. **传播前可预演**：`memory_remote_forget --dry-run` 返回将被删除的 `{externalId, knowledgeId, reason}` 列表，不写 outbox、不调远端。团队第一次打开 `on_merge` 时先用它看一遍影响面。

孤儿状态在 `memory_remote_status` 里单独计数（`orphans: n`），面板显示"远端仍有 N 条已废弃副本"。这是"删除是真难的那件事"唯一诚实的处理方式。

#### 5.5.1 上限放界面，不在提案里猜

`max_per_run` 是一个**只有使用者才知道合理值**的参数（取决于团队多久做一次批量合并）。写死任何数字都是猜，所以它的权威位置是面板配置页，而不是提案正文或代码常量。

面板「配置」页新增一张「远端」卡片，每个 provider 一块：

```text
┌─ 远端 · tencent ───────────────────────────────┐
│ 角色        [x] feed   [x] mirror   [ ] authority   [ ] index
│ 作废传播    [x] 本地作废时同步远端   [ ] 合并时同步远端
│ 单次上限    [ 100 ] 条    ( 0 = 不限 )
│                                                       │
│ 待传播 3 条 · 孤儿 0 条 · 上次同步 2 分钟前 · 正常     │
│ 建议：先点「预演」看清影响面，再决定是否打开「合并时同步」│
└───────────────────────────────────────────────┘
```

- **控件**：两个开关 + 一个数字输入（`min 0 / max 1000 / step 1`，整数）+ 只读计数（待传播 / 孤儿 / 上次同步时间 / 健康状态）。计数来自 `/api/overview`，不新增读端点。
- **挂载无关**：这张卡片走的是 `createMemoryRouter()`（见 [ADR-0010](../01-architecture/decisions/ADR-0010-panel-transport-portability.md)），所以它在 DSH 内嵌面板和 `memory-hub serve` 的 standalone 面板里**是同一份实现**；配置读写也只有一个路径。
- **保存**：沿用现有 `POST /dsh-memory-hub/api/config`（`service.updateConfig` 的 patch 从 `{core_workspaces, workspaces}` 扩展到 `{core_workspaces, workspaces, remote}`），**不新增写端点**；仍是回环地址 + 同源 Origin 校验（沿用 §「面板安全」既有约束，不需要 `x-dmh-review`——它只针对知识审批）。
- **校验**：非整数、负数、> 1000 一律 `400 invalid-config`，中文提示"单次上限需为 0–1000 的整数（0 表示不限）"。保存后立即生效（`reloadConfig` 已经在 `updateConfig` 里），不需要重启。
- **`0 = 不限` 要显式警示**：选 0 时卡片出现橙色提示"不限批次：一次大规模合并会把全部作废一次性推到远端"，但不阻止保存。
- **与仓库硬规则一致**：`AGENTS.md` 的"面板只读、唯一写入是人工审批"针对的是**权威知识**（`knowledge/` 正文、导入、删除）。改 `config.yaml` 是既有能力（V0.5.0 起「配置」页就能增删核心/子工作区），本提案只是把 patch 的字段集合扩到 `remote`，**没有新增写端点、没有新增能碰 `knowledge/` 的路径**。实现时 `AGENTS.md` 需要同步补一句：面板可写字段 = `core_workspaces` / `workspaces` / `remote`，且这些都是配置而非知识。
- **面板只配置、不执行**：这里不放「立即同步」按钮。传播仍由 `memory_remote_sync` 触发，避免面板变成能直接改远端数据的入口。若日后要加，必须单独评审，并复用审批端点的 `x-dmh-review` + 同源校验。

**为什么不是"给个大默认值就行"**：默认值只解决第一次，之后团队从 "季度合并 200 条" 变成 "每周合并 3 条" 时，没人会回来改 YAML。放在界面上，`待传播 N 条` 与输入框并排显示，上限才有意义——数字与队列深度是同一个视图。

### 5.6 `http-json` 声明式适配器（自由度的来源）

给"其他家"一条不写代码的路：把端点与字段映射写在配置里。

```yaml
- id: my-memory
  kind: http-json
  roles: [index]
  config:
    base_url: https://memory.example.com
    auth: { type: bearer, token_env: MY_MEMORY_TOKEN }
    headers: { x-tenant: acme }
    endpoints:
      search:
        method: POST
        path: /v1/memories/search
        body: { query: '{{text}}', limit: '{{limit}}', cursor: '{{cursor}}' }
      list:
        method: POST
        path: /v1/memories/list
        body: { limit: '{{limit}}', cursor: '{{cursor}}' }
      append:
        method: POST
        path: /v1/memories
        body: { title: '{{title}}', content: '{{body}}', tags: '{{tags}}' }
    mapping:
      items: '$.data.items'
      id: '$.id'
      title: '$.title'
      summary: '$.summary'
      body: '$.content'
      scope: '$.metadata.scope'
      updated_at: '$.updated_at'
      next_cursor: '$.data.next'
    capabilities: [read.list, read.search, write.append]
```

约束：

- **能力必须由用户显式声明**（不猜）。声明了没实现 = 运行时报 `unsupported`，测试会覆盖。
- 只允许 `http`/`https`；`token_env` 只读环境变量或 DSH credential store（复用 `src/credentials.ts`），**密钥不落盘**。
- 不提供任意 JS 求值（避免把配置变成代码执行面）；映射只做 `$.a.b` 路径取值与 `{{var}}` 插值。

### 5.7 组合检索（可选，M3）

多个 provider 都可 `read.search` 时：

- **默认不组合**：只有当前本地 Hub 参与预检，远端只在显式 `memory_remote_sync` 时拉取。
- 开启 `remote.mode: hybrid` 后：并发 fan-out，结果**全部带 `source: <providerId>` 标注**、按 provider 分组呈现，**不做跨库分数混排**（不同 provider 的 score 不可比——引用 Mem0/Hindsight 的教训）。
- 每条注入贡献有 token 上限（`remote.<id>.inject_max_tokens`，默认 300），防止一个远端吃掉整个预检包。

### 5.8 远端作用域与团队协作（设计，2026-11-15 起草）

真实环境验证后暴露的结构性问题：本地是**金字塔 + 多工作区**，远端（腾讯 / http-json）是**扁平条目池**；团队里每个人的本地布局还不一样。直接镜像会把一切混成一锅。定调：

> **远端是通道与池，不是第二座金字塔。** 金字塔结构只存在于本地文件（不变量 1：文件是权威）；远端只存"条目 + 足以重建来历的坐标"。序列化在 push，反序列化在 pull，两端各说各话，中间只有约定俗成的坐标词表。

#### 5.8.1 坐标编码（`mh:` 命名空间 tags）

腾讯的隔离字段（team/agent/user/task）是**进程级绑定**，不是 per-call 作用域（M0 教训）；http-json 第三方也未必有层级概念。所以结构坐标走 **tags**，与用户自由标签隔离：

| tag | 语义 | 例 |
| --- | --- | --- |
| `mh:scope:project` | 条目 scope.level | `mh:scope:global` / `mh:scope:domain` / `mh:scope:project` |
| `mh:ws:<workspaceId>` | 来源工作区 | `mh:ws:dsh-memory-hub` |
| `mh:core:<coreId>` | 来源核心 hub | `mh:core:dsh-plugin-dev` |
| `mh:type:<type>` | 知识类型 | `mh:type:decision` |
| `mh:from:<hubKey>` | 镜像者身份（谁推上来的） | `mh:from:18811-dsh-plugin-dev` |

约定：`mh:` 前缀是**协议保留字**，本 hub 写、本 hub 读；用户自由标签绝不带 `mh:`。push 时由 mirror 侧自动附加（`mirror.coordinate_tags: true`，默认开）；pull 时只消费、不回写用户标签。

#### 5.8.2 非对称映射（push 序列化结构，pull 反序列化到"我的"结构）

这是整个设计的关键不对称：

- **push（出）**：把我本地 scope 序列化成坐标 tags。`project:dsh-memory-hub` → `mh:scope:project` + `mh:ws:dsh-memory-hub`。条目正文与摘要**不改写**——远端看到的语义与本地一致。
- **pull（入）**：候选落地时按坐标还原到**拉取者自己的**结构：`mh:ws:dsh-memory-hub` → 我本地**恰好也注册了** `dsh-memory-hub` 工作区 → 候选 scope 落 `project:dsh-memory-hub`；没注册 → 退 `feed.fallback_scope`（默认 global，人审时可改）。`feed.scope_from_tags: true` 开启，默认 false（保持现状全落 global）。

同一份远端数据，A 拉到自己的金字塔、B 拉到自己的金字塔——**结构各是各的，内容是同一份**。远端永不存"这个条目属于谁的第几层"，只存"它来自谁的那个工作区"。

#### 5.8.3 金字塔防混淆：按权威层级分工镜像

本地金字塔有两份近似内容：叶子工作区的原始条目（L1）与 core hub 蒸馏/晋升的条目（L2）。两层都镜像 = 远端近似重复泛滥。分工规则（复用现有 `projection.scopes` 机制，无需新代码）：

- **叶子 hub**（或单 hub 部署）镜像 `project:<self>` 层——原始细节留在池里，坐标标明出处；
- **core hub** 镜像 `global` / `domain:*` 层——跨项目共识与蒸馏结论，是团队真正该共享的东西；
- 蒸馏晋升产生的近似重复因此天然分流：细节在个人池、共识在团队池。**不追求远端去重**——重复消歧是检索（坐标过滤）与人审的事，不是镜像的义务。

#### 5.8.4 团队协作 = 多 provider 实例组合

不同的人本地用法不同，正好对应本提案的核心抽象——**按角色接入，不按厂商**。腾讯的 `user_id` 是进程级绑定，这反而成了天然的"池"划分手段：

```yaml
# 团队池：所有人共享同一个 user_id，互为 feed + mirror
- id: team-pool
  kind: tencent
  roles: [feed, mirror]
  config: { user_id: usr-team-shared, ... }
  projection: { scopes: ['global', 'domain:*'] }   # core hub 上跑
  mirror: { coordinate_tags: true }

# 个人池：user_id 是自己的，只推个人工作层（可选）
- id: personal
  kind: tencent
  roles: [mirror]
  config: { user_id: usr-<me>, ... }
  projection: { scopes: ['project:<self>'] }
```

- **共享的只有三样**：类型枚举（`KnowledgeType` 本来就是协议）、`mh:` 坐标词表、团队约定的项目码标签。其余一切（工作区划分、金字塔形状、域、标签习惯）都是个人的。
- **pull 永远走候选流**（不变量 2）：别人推的条目进我的 pending，人审才入库——每个人的金字塔不会被别人的结构污染；候选 commit 时拿**本地新 id**，跨人 id 冲突（人人都有 DEC-000001）天然规避，远端 externalId 只在 `sourceRefs` 里做来历。
- **`authority` 角色的正确用法**：团队标准条目（如公司级 API 目录）由团队池作为 authority——本地没有对应条目时以远端为准；feed/authority 不混在同一个 provider 实例上。

#### 5.8.5 hybrid 检索的坐标过滤

团队池参与 hybrid 时，远端命中的行可按坐标标注（`- [team-pool][ws:dsh-plugin-dev] 标题 — 摘要`），供模型判断"这是别人哪个项目的经验"；http-json 第三方有真作用域时，search 端点 body 可模板化 `{{scope}}` 直传。

#### 5.8.6 落地缺口（实现顺序，均为小刀）

1. **mirror 坐标 tags**（push 侧自动附加 + 面板开关）→ **M4a 已实现**；
2. **feed.scope_from_tags**（pull 侧反序列化 + fallback）→ **M4a 已实现**；
3. **hybrid 行坐标标注**（一行渲染改动）→ **M4a 已实现**；
4. 蒸馏/晋升与镜像分工的**部署模式文档**（叶子镜 project 层、core 镜共享层）→ 归入 §5.9.4 部署模式。

### 5.9 备份语义与萃取驱动上报（设计，2026-11-15 起草）

真实环境验证与设计讨论（2026-11-15）确认的两块缺口：**镜像 ≠ 备份**、**上报应该是"用过才推"而不是"收了就推"**。

#### 5.9.1 备份与灾害恢复语义

现状差距（逐条核实过代码）：`mirror.trigger` 声明了 `'manual' | 'accepted' | 'schedule'` 三档但**没有任何代码消费**（空承诺）；body 恒被 `max_body_chars: 4000` 截断且无"不截断"语义；`memory_remote_forget` 会删远端副本；push 去重靠本地 `pushedIds` 台账，**远端丢数据不会自动补推**；无恢复路径承诺。

诚实的前提：**本地备份已天然成立**（不变量 1/3）——hub 目录（`knowledge/` Markdown + `records/` JSONL + `config.yaml`）就是备份单元，git 或目录副本即完整备份，跨机迁移 = 拷目录。远端备份只定位为**异地冗余 / 灾害恢复附加层**。备份级语义的四个条件：

1. **自动触发**：实装 `trigger: 'schedule'`（runtime 按 provider 注册定时器，并接管 legacy 腾讯桥的 `sync_interval_min` 定时器）与 `trigger: 'accepted'`（commit 后按投影增量推）。
2. **全量保真**：`max_body_chars: 0` = 不截断（正文完整上推；腾讯侧长度上限需真机实测，超长条目推原文失败时降级截断并记 orphan 诊断）。
3. **只增不删**：备份用途的 provider 不参与 forget 传播（`mirror.backup: true` 时 `memory_remote_forget` 对其跳过，`remoteForget` 结果里标 `skipped: backup`）。删远端副本是同步语义，不是备份语义。
4. **reconcile**：`memory_remote_sync` push 前先 list 远端全量 externalId 集合，与"本地 accepted ∩ 投影 − pushedIds 台账"求差补推；台账声称已推但远端不存在的条目按台账过期处理（重推，幂等键兜底）。

**恢复路径走候选流**（不变量 2 不开洞）：灾难恢复 = 新机器装插件 → 配好 provider → `pull` 全量 → pending → 面板**批量批准**（一次点击批一批，仍是人批）。reconcile 保证"推上去的都能拉回来"。

#### 5.9.2 萃取驱动的上报（脏数据防线的第三道闸）

前置结论（2026-11-15 设计讨论）：Hermes 式限流不抄（[KNO-000007]：不抄直写与硬上限），精炼靠金字塔分层 + 时间衰减（aging 90 天）+ 人审。萃取现状是**日历驱动**（03:00 maintenance、手动 consolidate）；缺**使用驱动**。三道闸已有两道半：push 只推 `accepted`（铁闸）、投影 scopes 分工（§5.8.3）、类型/标签过滤（半道）。补齐：

1. **`mirror.require_citations: N`**（默认 0 = 现状；团队池设 1+）：被 `memory_cite` 引用 ≥ N 次的 accepted 条目才推。cite 行为本身就是"这条真的有用"的人类签名——**"正在使用的数据主动萃取以后上报"的字面实现**；没人用的条目留在本地 aging，不上报污染团队池。
2. **`trigger: 'cited'`**（第四档）：条目首次达到 require_citations 门槛时触发一次 push（与 'accepted' 互斥使用；'accepted' = 收了就推，'cited' = 用了才推）。
3. **引用即议程**：`memory_cite` 把被引条目推进萃取候选队列（内存 + `records/agenda.jsonl`）；maintenance 跑时检查：同主题（共享 tag）候选 ≥ 3 或单条目被引 ≥ 3 → 产出一条"建议蒸馏"提示候选（人批准）。日历驱动与信号驱动并存。
   **实现语义（M5 实测修订）**：议程行 = **新**引用（同 task 去重引用不重复入议程）；`distill-hint` 只进**维护报告与 issues**（人看完自己决定跑不跑蒸馏），**不生成 pending**——"建议蒸馏"本身不是九类知识，入库会污染 `knowledge/`；单条目阈值看议程行数（M5 起累计，历史引用不回填）。

#### 5.9.3 上报之后的再萃取

pull 进来的条目（团队池 L2）→ 人审 → 本地 accepted → **被我使用** → cite → 萃取议程 → 蒸馏成本地 L2 →（可选）推回团队池（`mh:from` 坐标标明二级来历）。**萃取是每个本地金字塔自己的消化过程，远端只是食材市场。** 跨人聚合信号（引用计数无法跨机器聚合）为可选后期项：引用远端条目时上报 usage report 候选（`mh:usage:<externalId>` tag），推送方 pull 回来看跨机器使用信号。本提案**不实现**，只留协议位（`mh:` 前缀已预留）。

#### 5.9.4 落地顺序

> **2026-11-15 重排**（依据《dsh-memory-hub 与业界优秀记忆插件对比及演进蓝图_2026.11.15》，`E:\009workspace\design-doc\`）：
> 对比文档确认本提案的远端 provider 角色模型（§2.2〔独占〕）与引用驱动生命周期（§2.4〔独占〕）是两大核心优势，而**最大战略差距是宿主锁定**（MCP/CLI 停在 ADR-0010）与**写入漏斗流量低**。因此：
> **M5 提前**——`require_citations` + 引用即议程同时放大两大独占优势，且引用议程正是漏斗（"记忆长不出来"）的宿主无关解药（任何宿主里 cite 都走工具面，跨宿主后不需返工捕获通道）；
> **M4b 降级为随批卫生项**——对比文档未把备份语义列为差距，`reconcile` 等团队服务器/备份场景真实使用后再做；
> **随后启动 V0.8「跨宿主落地」主线**（MCP stdio 8 工具 + CLI/serve + golden set 评测基线并行），远端条线在 M5 收口后让位。

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| **M4a** | §5.8.1–5.8.5 全部（坐标 tags / scope_from_tags / hybrid 标注） | ✅ **已实现（2026-11-15）** |
| **M5（提前为下一批）** | `require_citations` + `trigger: 'cited'` + 引用即议程（`records/agenda.jsonl` + 维护提炼提示 ≥3） | ✅ **已实现（2026-11-15）** |
| **M4b（收窄为随批卫生项）** | `trigger: 'schedule'` 实装 + legacy `sync_interval_min` 迁移 + `max_body_chars: 0` + `mirror.backup` forget 豁免——可与 M5 或 v0.7.x 卫生版同批顺手做 | 未开始 |
| **挂起** | reconcile（push 前对账） | 等备份/团队场景真实使用 |
| — | usage 回报通道 | 协议位预留，不实现 |
| — | V0.8 跨宿主主线（MCP stdio / CLI / serve / golden set） | 见 ADR-0010 + `docs/02-harness/tool-surface.md` §7，**M5 收口后启动** |

## 6. Affected Modules

`config.ts`（新增 `remote` 段 + desugar）、`service.ts`（`remoteStatus/remoteSync/remoteForget`，替换 `tencentPull/Push` 内部实现；`updateConfig` patch 扩展 `remote`）、`tools.ts`（3 个新工具 + 3 个别名）、`runtime.ts`（定时器按 provider 注册）、`ledger.ts`（`remote.sync` 事件）、`credentials.ts`（复用）、`client.js`（面板「配置」页远端卡片：角色开关 / 作废传播开关 / 单次上限数字框 / 只读计数）、新增 `src/remote/*`。

`tencent-client.ts` 不动（协议层保持），`tencent-sync.ts` 逐步退役为 `remote/adapters/tencent.ts` + 引擎调用。

## 7. Storage Impact

- `config.yaml`：新增 `remote` 段（默认 `enabled: false`）；`tencent` 段保留。`remote.providers[].forget.*` 与 `[].enabled` / `[].roles` 属**面板可写字段**（经 `updateConfig`），`config.yaml` 仍是唯一落盘位置（面板只是它的编辑器，不另立数据源）。
- 新增 `records/remote/<providerId>/{state.json,outbox.jsonl,orphans.jsonl}`（均可删，删了等于重置该 provider 的同步进度）。
- `records/tencent-state.json` / `records/outbox.jsonl`：首次启动时**迁移**到新路径（保留原文件不删，只读一次），并在账本记 `remote.migrated`。
- `pending/PRO-*.md`：`source_refs` 从 `note:tencent:<id>` 泛化为 `note:<providerId>:<externalId>`；旧格式仍能解析（前缀匹配）。
- `knowledge/`：不变。

## 8. Constraints

- [x] 不引入强制性数据库；同步状态就是 JSON/JSONL 文件。
- [x] 默认不使用向量库。
- [x] `remote.enabled: false` 时零网络请求（mock fetch 断言未调用）。
- [x] 任何 provider 都不能直接写 `knowledge/`；只能产生 `pending/`。
- [x] 密钥只走 `*_env` / credential ref，不落盘。
- [x] 换 provider 不换文件格式。

## 9. Risks

1. **抽象层过度设计**：接口一宽，实现成本翻倍。缓解——接口只保留 `list/search/get/append/upsert/delete/changesSince` 七个方法 + `capabilities/probe`，其余能力（scenario、分层、抽取）留在具体 adapter 内部，不进协议。
2. **删除传播误删**：把 `merge` 的被合并项当成"该删"可能过度——被合并项的内容已经在 target 正文里活着，远端保留反而扩大召回面。缓解——**默认只传播 `deprecate`**，`merge` 走 `mirror.forget.on_merge`（默认 `false`，按 provider 单独开），并配 `max_per_run` 限流与 `--dry-run` 预演。
3. **孤儿堆积**：远端不支持删除时会持续累积。缓解——`orphans.jsonl` 有界 2000，`status` 暴露计数，面板给"清理建议"文案（不自动执行）。
4. **`authority` 角色把本地变成缓存**，与"文件是真相"冲突。缓解——`authority` 只允许用于 `global`/`domain:*`，`project:*` 永不外放；且 `remote-authority` 模式必须显式开启，默认 `local-first`。
5. **多 provider 配置爆炸**：5 家 × 8 字段。缓解——提供 `kind` 预设默认值；`http-json` 只要求 3 个必填。
6. **面板成为远端写入口**：一旦面板能改 `remote` 配置，它就能间接影响远端数据（打开 `on_merge` + 调大上限）。缓解——面板**只配上限、不提供"立即同步/立即删除"按钮**；写操作仍走 `memory_remote_sync` / `memory_remote_forget`（模型/CLI 侧，可审计）；配置变更本身入账本 `config.remote.updated`，记录改了哪个字段、旧值与新值。

## 10. Verification

- **行为等价**：只保留旧 `tencent:` 配置时，`npm run check` 全绿，且 pull/push 的请求序列与 V0.7.2 逐字一致（录制式断言）。
- **零网络**：`remote.enabled: false` 下 mock fetch 零调用；`probe` 也不发。
- **能力拒答**：声明 `[read.list]` 的 provider 调 `delete` → 返回 `unsupported`、写孤儿、不抛。
- **删除跨边界**：本地 deprecate → 远端 `delete` 被调用一次；重复提交幂等（第二次 outbox 为空）。
- **merge 默认不传播**：`forget.on_merge: false`（默认）时提交一次 merge → 远端 `delete` 零调用、outbox 无 `forget` 条目、`orphans` 不增长。
- **merge 显式开启后传播**：`on_merge: true` → 每条被合并项产生一次 `delete`；超过 `max_per_run` 的留在 outbox；未镜像过的条目**不**产生 `forget`。
- **预演不产生副作用**：`memory_remote_forget --dry-run` 返回候选清单，outbox 与 `orphans.jsonl` 均无变化、远端零调用。
- **降级**：provider 超时 → `lastError` 有值、outbox 增长、回合正常结束、账本记 `remote.sync` 失败。
- **作用域隔离**：provider 返回 `project:other` 的记录 → 被过滤掉（`projection` 不允许），并记一条诊断。
- **outbox 重放**：断网→恢复，`conflict` 不重试、`unreachable` 重试，不产生重复远端条目（幂等键断言）。
- **上限来自配置而非常量**：同一份代码，`max_per_run: 3` 时一次 10 条的批量作废只推 3 条、outbox 余 7 条；改成 `0` 时一次推完 10 条（测试里改配置，不改代码）。
- **面板配置往返**：`POST /api/config {remote: {...}}` → 200、`config.yaml` 落盘、`GET /api/config` 读回同值、无需重启即生效。
- **面板校验**：`max_per_run: -1` / `"abc"` / `1001` → 400 `invalid-config` + 中文提示；`0` 允许保存但响应带 `warning: 'unlimited'`。
- **面板不执行**：`/api/config` 只改配置；断言不存在任何 `/api/remote/sync` 或 `/api/remote/forget` 路由（回环也不行）。
- **非回环拒绝**：从非回环地址 POST `/api/config` 仍被拒（沿用既有守卫）。

## 11. 分阶段落地

| 阶段 | 内容 | 验收 | 量级 | 状态 |
| --- | --- | --- | --- | --- |
| M0 | `remote/types.ts` + registry + 配置 desugar + tencent adapter 迁移 | 旧配置行为逐字不变 | 3–5 天 | ✅ **已实现（2026-11-14）** |
| M1 | 同步引擎抽取（游标/outbox/幂等/审计）+ 删除传播 + 孤儿 | `deprecate` 能传播；`merge` **默认零传播**、开关打开后才传播；能力拒答正确 | 4–6 天 | ✅ **已实现（2026-11-14）** |
| M1.5 | 面板「远端」卡片（角色 / 作废传播 / 单次上限 / 只读计数）+ `updateConfig` 扩展 | 上限可在界面改并即时生效；无效值 400；面板无执行按钮 | 2–3 天 | ✅ **已实现（2026-11-14，卡片含待传播/孤儿/待重放/已镜像计数）** |
| M2 | `http-json` 声明式适配器 + 文档 | 一个真实第三方服务接通（只读 + 追加） | 3–5 天 | ✅ **已实现（2026-11-15，本地假想服务端到端验证）** |
| M3a | 组合检索（hybrid fan-out） | hybrid 模式下远端结果带 source 标注、分组、限流 | 2–3 天 | ✅ **已实现（2026-11-15）** |
| M3b | `team-server` adapter（复用 [proposal-team-memory](proposal-team-memory.md) 的 SSE/CAS） | 局域网实时可见；hybrid 模式结果带 source | 1–2 周 | 未开始 |

### 11.1 M0 实现记录（与草案的差异）

M0 已落地并通过 `npm run check`（27 文件 / 238 测试）。实现中与草案有四处偏离，均已写进代码注释：

1. **错误语义从四种加到五种**。草案 §5.2 定的是 `unreachable` / `unauthorized` / `unsupported` / `conflict`。实测腾讯时发现"HTTP 200 但信封 `code != 0`"（参数错、资源不存在、写入被拒）不属于这四类：归 `unreachable` 会让 outbox 无限重试一个永不成功的请求，归 `conflict` 会骗人去走人工 diff。故新增 **`invalid`**（远端明确拒绝请求本身，不重试）。`RemoteError.retryable` 只对 `unreachable` 为真。
2. **`RemoteRecord.scope` 是可选字段，而不是必填**。腾讯的隔离字段（`team_id`/`agent_id`/`user_id`/`task_id`）是**进程级绑定**，不是 per-call 作用域——adapter 无法为单条记录声明 scope。强行必填只会逼 adapter 编造。这也解释了为什么腾讯 adapter 不声明 `scope` 能力。
3. **能力检查做成显式函数而不是 try/catch**。`requireCapability()` / `requireMethod()` 让"声明了但没实现"立刻报 `unsupported`，而不是 `undefined is not a function`。方法可选性本身就是能力声明：没实现 `delete` 就等于没有 `write.delete`。
4. **`probe()` 不抛错**。草案没写清。实现约定：`probe` 返回 `{ok, latencyMs, detail}`，失败走 `ok:false`——因为"体检"这个动作本身失败是可预期结果，不是异常。

另修掉一个会**打断现存用户**的回归：`configSchema` 给 `remote.providers` 的默认值是 `[]`，最初把空数组当成"显式配置"，导致所有旧 `tencent:` 配置被静默忽略。现在只有**非空** `providers` 才算显式，`tests/remote.test.ts` 与 `tests/remote-service.test.ts` 双向锁定。

### 11.2 M1 实现记录（与草案的差异）

M1 已落地并通过 `npm run check`（28 文件 / 260 测试）。实现物：`src/remote/sync.ts`（`RemoteSync` 引擎 + `readRemoteSyncSnapshot`）、service 的 `remoteSync` / `remoteForget` / `remoteStatusDetailed`、工具 `memory_remote_sync` / `memory_remote_forget`、`updateConfig` 接受 `remote` patch（写账本 `config.remote.updated`）、`config()` 回显 remote 段。与草案的偏离：

1. **审计事件按方向拆分，而不是单一 `remote.sync`**。实际落账 `remote.pull` / `remote.push` / `remote.forget` 三个类型，字段与草案 §5.4 的 `{provider, direction, ...}` 一致但类型可辨识——账本是 JSONL，逐方向的记录让"哪次同步干了什么"可以直接 grep，不需要再拆 payload。旧的 `tencent.pull` / `tencent.push` 原样保留（旧桥继续用它）。
2. **forget 不混进 sync 的默认方向**。`memory_remote_sync` 默认只跑 pull + push；`direction` 参数只接受这两个值。删除传播必须显式走 `memory_remote_forget`——"随手同步一下"不应该把作扩散到远端。
3. **候选必须在重放 outbox 之后计算**。实现时踩过：候选列表在重放前算好，重放成功的条目已进 `forgottenIds`，但过期候选仍会再删一次（同一条被删两次）。测试 `remote-sync.test.ts` 锁定。
4. **legacy desugar 的投影是 `['*']` 而不是空数组**。空数组在新语义里 = 什么都不分发；V0.7.x 的 push 没有投影概念、推全部 accepted。为了旧用户行为逐字不变，desugar 出的 provider 用 `scopes: ['*']`（全匹配）。
5. **孤儿台账即"待人审"队列**。§5.4 说 `conflict` 转待人审队列——实现里不需要新队列：非重试失败（unsupported/conflict/invalid/unauthorized）直接进 `orphans.jsonl`（cause 记原因），可重试的（unreachable）留 outbox。`memory_remote_status` 与面板读快照即可看到两者计数。

### 11.3 M2 实现记录（与草案的差异）

M2 已落地：`src/remote/http-json-adapter.ts`（解析 / 插值 / 映射 / HTTP 归类 / 工厂），注册表默认工厂新增 `http-json`；`tests/remote-http-json.test.ts` 22 例，含一个 node:http 本地假想服务的**端到端**用例（真实 fetch + 完整引擎：push 镜像 → append 请求体带幂等键；pull 候选 → `pending/` 带 `note:remote:<providerId>:<externalId>` 来源标注；二次 pull 幂等 0）。与草案 §5.6 的偏离：

1. **整字符串 `{{var}}` 保留类型**。草案示例里 `limit: '{{limit}}'` 按纯文本插值会产出 `"limit": "50"`（字符串化数字），严格的服务端会拒收。实现规则：整个字符串恰好是一个变量 → 原值替换（数字保持数字、数组保持数组）；混合字符串 → 字符串拼接（数组用 `,` join）；缺失变量 → 精确形式 `null`、混合形式空串。
2. **缺 id 的条目丢弃而不是让整页失败**。远端噪声不应阻塞流水线；`pulledIds` 去重保证重拉安全。
3. **append 响应没有 id 时回退幂等键**。`externalIds` 台账仍然可用；对真有 `write.delete` 能力的服务，应该在响应里返回真实 id。
4. **M2 范围只做 `list` / `search` / `append` 三类端点**。`upsert` / `delete` / `changesSince` 的端点类型与模板暂未做——能力词汇表里它们存在，但 http-json 用户此刻声明了也只会在调用时收到 `unsupported`（声明了没实现 = 运行时报错，正是 §5.6 约束 1 的行为）。语义上 upsert = append + 版本头、delete 需要 `reason` 模板，等第一个真实需求出现再定模板形状，不预先发明。
5. **来源标注是 `note:remote:<providerId>:<externalId>`**（M1 实现即如此，比 §7 草案的 `note:<providerId>:<externalId>` 多一段 `remote:` 命名空间）——与其它 `note:` 引用区分、便于 grep；旧 `note:tencent:<id>` 前缀仍能解析。
6. **probe 的降级路径**：有 `endpoints.list` → 用 limit=1 试拉；没有 → GET base_url 验证可达（5xx 视为不可达，4xx 只说明路径不对但仍可达）。

### 11.4 M3a 实现记录（与草案的差异）

组合检索已落地：`service.remoteHybridContributions()`（并发 fan-out + 每 provider 独立死线）+ `buildPack` 追加远端段 + `preflight.recorded` 账本带 `remote` 摘要；`tests/remote-hybrid.test.ts` 6 例（local-first 零网络、标注与账本、token 上限截断、0 = 不参与、失败降级、死线）。与草案 §5.7 的偏离：

1. **死线是草案没有的**：`remote.hybrid.deadline_ms`（默认 2000ms，200–10000）。预检在每回合开头跑，慢远端绝不能拖住回合——到点未返回按 `unavailable: exceeded Nms preflight deadline` 处理。响应慢半拍的结果被丢弃而不是等，这是有意的取舍：回合延迟的确定性 > 单次检索的完整性。
2. **参与资格按能力判，不按角色判**：只要 enabled 且声明 `read.search` 且 `inject_max_tokens > 0` 就参与 fan-out。index 角色"把远端当外部索引"只是典型用法；feed provider 有检索能力时同样能贡献上下文（远端 → 本地候选的语义本就包含"远端知道些什么"）。
3. **连分数都不展示**：草案只说"不做跨库分数混排"，实现里更进一步——远端行没有 score/similarity 字样，只按远端返回顺序列条目。展示一个不可比的数字比不展示更糟。
4. **token 上限计入的是渲染后的行**：`inject_max_tokens` 默认 300（0 = 不参与），截断时注明 `(+N more from <provider>; run memory_remote_sync to pull candidates)`——被截掉的内容有确定性的取回路径。
5. **远端段加在本地命中之后**：本地命中受 `pack_tokens` 预算约束，远端段按 provider 上限**追加**（每 provider ≤ inject_max_tokens）。总包长可能略超 pack_tokens，这是有意的：远端贡献的上限独立于本地预算，不让远端挤掉本地命中。
6. **远端命中永远不进 `state.hits` / `task.preflight.hits`**：不可 `memory_cite`（没有 knowledgeId 可引）、不参与 `preflight.recorded.hits`——账本 `hits` 数组只含本地知识，`remote` 摘要单独成字段。想要远端内容进知识库，唯一的路是 `memory_remote_sync` → pending 候选 → 人审。

### 11.5 真实环境验证记录（2026-11-15）

把 M0–M3a 的构建部署进运行中的 DSH 宿主（profile 软链工作树，`plugin_manager` disable→enable 重载），对本会话真实 hub（core `dsh-plugin-dev`，腾讯桥 enabled，url `127.0.0.1:18420`）跑了一轮完整验证。**真机抓出三个只有真实数据才会暴露的问题，全部修复**：

1. **§7 的状态迁移在 M1 里漏实现了**。旧腾讯桥的 `records/tencent-state.json` 没有被接管 → 新引擎第一次 pull 会把旧桥已拉过的来源重新提候选（重复候选要人审拒一遍）。补了 `migrateLegacyRemoteState()`（幂等：新 state.json 存在就绝不覆盖；旧文件保留不删；旧 outbox 不迁移——旧桥 push 语义与新幂等键不同，重放只会产生重复消息），成功记 `remote.migrated` 账本事件。真机结果：`pulled:7, pushed:0` 一次性接管，随后的 pull 全部正确跳过。
2. **pull 候选在边界没截断**。腾讯 L1 atomic 的 summary 可超 240 字符，直接透传被 store 拒（`INVALID_INPUT`）→ "保留来源待重试"的设计变成**永久重试永久失败**。修法：`remoteSyncHost.proposeCandidate` 在边界截断 title/summary（200/240），候选总能提出去，人审看全文。真机：2 条超长 summary 修复后成功补提。
3. **重试成功后 `lastError` 不清空**。原设计"成功不清空逐条错误"——真机看起来像仍在故障。改为：本轮全部成功 → 清空；失败保留本次第一条。

验证路径：三次 pull（16 pulled：8 提议 + 2 修复后补提 → 0 提议 16 跳过，幂等收敛）；`probe` 11ms ok（16 atomics）；forget dry-run 零副作用（pendingForget 0）；面板模块带远端卡片与 `inject_max_tokens` 回程（`/api/config` + 模块 rev 均确认）。另修面板 M1.5 遗留：`handleSaveRemote` 的 view 列表漏 `inject_max_tokens`，保存会把用户设的值抹回默认 300。

部署流程备忘：宿主 profile 以 `include:dsh-memory-hub` 条目软链到工作树；改动后 `npm run check`（含 build）+ `plugin_manager` disable→enable 重载即生效，**无需重启宿主进程**。会话内的 memory 工具在重载窗口短暂不可用，重载后自动恢复。

## 12. Alternatives

- **继续给每家抄一遍 bridge**：最省设计成本，但 3 家之后 outbox/游标/幂等会分叉三份，且删除传播永远补不上。否决。
- **只做腾讯，不做抽象**：短期最优，但用户诉求明确是"甚至可以是其他的，自由度要高"，等于放弃需求。否决。
- **改用 MCP 作为统一远端协议**（把远端记忆服务都包成 MCP server）：理论优雅，但 MCP 只有"被调用"一种时机，没有游标/推送语义；且我们的调用方是插件而不是模型。可作为 `http-json` 的一种特例保留，不做主线。
- **直接依赖 mem0/letta 做远端**：它们都要 LLM 在写入路径上（Mem0 虽已改为 ADD-only，但抽取仍需模型），与"确定性 + 人审"定位冲突。作为 `http-json` 适配对象存在，不做核心依赖。

## 13. 与已实现部分的关系

- 本提案**不推翻** [proposal-tencent-bridge](proposal-tencent-bridge.md)：腾讯桥的协议实现、outbox 幂等、游标有界、零网络默认全部保留，只是搬进 adapter/引擎。
- 本提案**为** [proposal-team-memory](proposal-team-memory.md) **提供挂载点**：自建服务器不需要再写一套 `server-sync.ts`，它就是一个 `kind: team-server` 的 `authority` provider。
