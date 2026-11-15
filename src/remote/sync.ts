/**
 * 远端同步引擎（provider 无关）——从 tencent-sync 抽出的骨架。
 *
 * 职责与边界：
 * - **feed（pull）**：远端记录 → 本地 pending 候选。**绝不 commit**；只有 propose 成功才推进
 *   `pulledIds` 游标（失败下次重试，不会丢来源）。
 * - **mirror（push）**：本地 accepted → 远端 append。失败进 outbox，按幂等键重放；
 *   `pushedIds` 是镜像台账，也是 forget 的前提（约束 1：没镜像过的条目不产生 forget）。
 * - **forget（作废传播）**：受 `forget.on_deprecate`（默认开）/ `forget.on_merge`（默认关）
 *   两个开关控制；`max_per_run`（0 = 不限）限制单次传播量，超出部分留待下次。
 *   远端没有 `write.delete` 时：追加"已废弃"标记（若支持 append）并记孤儿——**绝不假装成功**。
 * - 状态文件：`records/remote/<providerId>/{state.json,outbox.jsonl,orphans.jsonl}`。
 *
 * 本文件不知道任何厂商：它只依赖 `RemoteAdapter` 契约与 `RemoteProviderConfig` 策略。
 */

import { appendFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDir, readTextOrNull, writeAtomic } from '../atomic.js'
import { MemoryError } from '../errors.js'
import type { KnowledgeRecord } from '../types.js'
import type { RemoteProviderConfig } from './registry.js'
import { hasCapability, isRemoteError, requireMethod, type RemoteAdapter, type RemoteRecord } from './types.js'
import type { RemoteRole } from './types.js'

/* ------------------------------------------------------------------ */
/* 宿主接口                                                            */
/* ------------------------------------------------------------------ */

/** service 层提供给同步引擎的最小能力（便于 mock 与解耦）。 */
export interface RemoteSyncHost {
  /** 为拉取到的候选生成 pending 提案。返回 proposalId。 */
  proposeCandidate(input: {
    type: string
    scope: string
    title: string
    summary: string
    content?: string
    sourceRefs: string[]
    tags: string[]
  }): Promise<{ proposalId: string }>
  /** 全部本地知识（含 deprecated / superseded）；引擎自己按状态过滤。 */
  allKnowledge(): Promise<KnowledgeRecord[]>
  /** 记录审计事件。 */
  audit(event: RemoteAuditEvent): Promise<void>
}

export type RemoteAuditEvent =
  | { type: 'remote.pull'; payload: { provider: string; pulled: number; proposed: number; skipped: number } }
  | { type: 'remote.push'; payload: { provider: string; pushed: number; outboxed: number; replayed: number } }
  | {
      type: 'remote.forget'
      payload: { provider: string; forgotten: number; orphans: number; pending: number; outboxed: number; dryRun: boolean }
    }

/* ------------------------------------------------------------------ */
/* 状态与队列                                                          */
/* ------------------------------------------------------------------ */

export interface RemoteSyncState {
  lastPullAt: string | null
  lastPushAt: string | null
  lastForgetAt: string | null
  /** 诊断用：最近一次 pull/push 的失败摘要；本轮全部成功则清空。 */
  lastError: string | null
  /** 已处理过的远端来源（externalId，增量游标）。有界 2000。 */
  pulledIds: string[]
  /** 镜像台账：已成功 push 到该 provider 的本地知识 id。有界 2000。 */
  pushedIds: string[]
  /** 已完成 forget 的本地知识 id（含孤儿化）。有界 2000。 */
  forgottenIds: string[]
  /** knowledgeId → 远端 externalId（push 时由 adapter 返回并记录）。有界 2000。 */
  externalIds: Record<string, string>
}

const EMPTY_STATE: RemoteSyncState = {
  lastPullAt: null,
  lastPushAt: null,
  lastForgetAt: null,
  lastError: null,
  pulledIds: [],
  pushedIds: [],
  forgottenIds: [],
  externalIds: {},
}

interface RemoteOutboxEntry {
  op: 'push' | 'forget'
  knowledgeId: string
  /** 幂等键：`<providerId>:<op>:<knowledgeId>:<version>`，重放不重复。 */
  clientOpId: string
  version: number
  title: string
  summary: string
  body: string
  scope: string
  tags: string[]
  /** forget 专用。 */
  reason?: string
  at: string
}

export interface RemoteOrphanEntry {
  knowledgeId: string
  externalId: string | null
  reason: string
  /** 为什么没删成。unsupported = 远端没有删除能力（永久）；其余见 RemoteErrorKind。 */
  cause: 'unsupported' | 'conflict' | 'invalid' | 'unauthorized' | 'error'
  detail: string
  at: string
}

export interface RemotePullResult {
  pulled: number
  proposed: number
  skipped: number
  errors: string[]
}

export interface RemotePushResult {
  pushed: number
  outboxed: number
  replayed: number
  /** 被 require_citations 门槛挡下的条目数（0 = 未启用门槛）。 */
  gated?: number
}

export interface RemoteForgetItem {
  knowledgeId: string
  externalId: string | null
  /** delete = 真删除；marker = 追加了作废标记（远端无删除能力，同时记孤儿）；
   *  orphan = 只记了孤儿；queued = 因 unreachable 进 outbox 等重试；skipped = 没有可删的东西。 */
  action: 'delete' | 'marker' | 'orphan' | 'queued' | 'skipped'
  detail?: string
}

export interface RemoteForgetResult {
  dryRun: boolean
  /** 真删除成功的条数。marker/orphan 不计入。 */
  forgotten: number
  /** 本次新增孤儿（含 marker）。 */
  orphans: number
  /** 剩余待传播（含超出 max_per_run 的部分）。 */
  pending: number
  /** 因 unreachable 留在 outbox 的条数。 */
  outboxed: number
  items: RemoteForgetItem[]
}

export interface RemoteEngineStatus {
  provider: string
  kind: string
  roles: RemoteRole[]
  lastPullAt: string | null
  lastPushAt: string | null
  lastForgetAt: string | null
  lastError: string | null
  mirrored: number
  forgotten: number
  outboxPending: number
  orphans: number
}

/** 只读快照：不需要 adapter 就能读（供 status / 面板）。 */
export interface RemoteSyncSnapshot {
  provider: string
  lastPullAt: string | null
  lastPushAt: string | null
  lastForgetAt: string | null
  lastError: string | null
  outboxPending: number
  orphans: number
  mirrored: number
}

const BOUND = 2000

function boundList(list: string[]): string[] {
  return list.slice(-BOUND)
}

function boundMap(map: Record<string, string>): Record<string, string> {
  const keys = Object.keys(map)
  if (keys.length <= BOUND) return map
  const next: Record<string, string> = {}
  for (const key of keys.slice(-BOUND)) next[key] = map[key]!
  return next
}

/** provider id 是目录名的一部分；不允许路径穿越字符。 */
function safeProviderId(providerId: string): string {
  return providerId.replace(/[^A-Za-z0-9_.-]/g, '-')
}

export function formatScopeShort(scope: KnowledgeRecord['scope']): string {
  if (scope.level === 'global') return 'global'
  if (scope.level === 'domain') return `domain:${scope.id}`
  return `project:${scope.workspaceId}`
}

/** 投影匹配：`domain:*` 这类尾部通配；其余精确匹配。 */
export function scopeMatchesPattern(pattern: string, scope: string): boolean {
  if (pattern.endsWith('*')) return scope.startsWith(pattern.slice(0, -1))
  return pattern === scope
}

/* ------------------------------------------------------------------ */
/* 引擎                                                                */
/* ------------------------------------------------------------------ */

export interface RemoteSyncOptions {
  providerId: string
  /** hub 的 records 目录；引擎在其下建 `remote/<providerId>/`。 */
  recordsDir: string
  host: RemoteSyncHost
  adapter: RemoteAdapter
  settings: RemoteProviderConfig
  /**
   * 本 hub 的身份（§5.8 坐标编码的来源）。缺省 = 未注册环境（hubKey 'local'）。
   * service.buildEngine 按 agent 的会话工作区解析后传入。
   */
  origin?: RemoteOrigin
  /**
   * 引用计数查询（§5.9.2 萃取驱动的上报）：knowledgeId → 该条目被 memory_cite
   * 引用的次数。由宿主从账本 citation.added 事件重放得到（可重建的派生信号）；
   * 未提供 = 全部按 0 次。require_citations: 0 时门槛关闭，不查询。
   */
  citationCount?: (knowledgeId: string) => number
}

/** 坐标编码的来源身份：mh:core / mh:from tags 从这里取值。 */
export interface RemoteOrigin {
  coreId: string | null
  workspaceId: string | null
  /** 工作区优先，退 core id，再退 'local'。 */
  hubKey: string
}

interface ForgetCandidate {
  knowledgeId: string
  version: number
  title: string
  scope: string
  reason: string
}

export class RemoteSync {
  private readonly providerId: string
  private readonly dir: string
  private readonly host: RemoteSyncHost
  private readonly adapter: RemoteAdapter
  private readonly settings: RemoteProviderConfig
  private readonly origin: RemoteOrigin
  private readonly citationCount: (knowledgeId: string) => number

  constructor(options: RemoteSyncOptions) {
    this.providerId = options.providerId
    this.dir = join(options.recordsDir.replace(/\/+$/, ''), 'remote', safeProviderId(options.providerId))
    this.host = options.host
    this.adapter = options.adapter
    this.settings = options.settings
    this.origin = options.origin ?? { coreId: null, workspaceId: null, hubKey: 'local' }
    this.citationCount = options.citationCount ?? (() => 0)
  }

  /* ---------------- 状态文件 ---------------- */

  private statePath(): string {
    return join(this.dir, 'state.json')
  }

  private outboxPath(): string {
    return join(this.dir, 'outbox.jsonl')
  }

  private orphansPath(): string {
    return join(this.dir, 'orphans.jsonl')
  }

  private async readState(): Promise<RemoteSyncState> {
    const raw = await readTextOrNull(this.statePath())
    if (raw === null) return { ...EMPTY_STATE, externalIds: {} }
    try {
      const parsed = JSON.parse(raw) as Partial<RemoteSyncState>
      const strings = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      const externalIds: Record<string, string> = {}
      if (parsed.externalIds !== null && typeof parsed.externalIds === 'object') {
        for (const [key, value] of Object.entries(parsed.externalIds as Record<string, unknown>)) {
          if (typeof value === 'string' && value !== '') externalIds[key] = value
        }
      }
      return {
        lastPullAt: typeof parsed.lastPullAt === 'string' ? parsed.lastPullAt : null,
        lastPushAt: typeof parsed.lastPushAt === 'string' ? parsed.lastPushAt : null,
        lastForgetAt: typeof parsed.lastForgetAt === 'string' ? parsed.lastForgetAt : null,
        lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
        pulledIds: strings(parsed.pulledIds),
        pushedIds: strings(parsed.pushedIds),
        forgottenIds: strings(parsed.forgottenIds),
        externalIds,
      }
    } catch {
      return { ...EMPTY_STATE, externalIds: {} }
    }
  }

  private async writeState(state: RemoteSyncState): Promise<void> {
    await ensureDir(this.dir)
    await writeAtomic(this.statePath(), JSON.stringify(state, null, 2))
  }

  private async readOutbox(): Promise<RemoteOutboxEntry[]> {
    const raw = await readTextOrNull(this.outboxPath())
    if (raw === null || raw.trim() === '') return []
    const entries: RemoteOutboxEntry[] = []
    for (const line of raw.split('\n')) {
      if (line.trim() === '') continue
      try {
        const parsed = JSON.parse(line) as Partial<RemoteOutboxEntry> & Record<string, unknown>
        if (
          (parsed.op === 'push' || parsed.op === 'forget') &&
          typeof parsed.knowledgeId === 'string' &&
          typeof parsed.clientOpId === 'string'
        ) {
          entries.push(parsed as RemoteOutboxEntry)
        }
      } catch {
        // 损坏行跳过（outbox 可删可重建）。
      }
    }
    return entries
  }

  private async writeOutbox(entries: RemoteOutboxEntry[]): Promise<void> {
    await ensureDir(this.dir)
    await writeAtomic(this.outboxPath(), entries.map((entry) => JSON.stringify(entry)).join('\n'))
  }

  private async appendOutbox(entry: RemoteOutboxEntry): Promise<void> {
    await ensureDir(this.dir)
    await appendFile(this.outboxPath(), `${JSON.stringify(entry)}\n`, 'utf8')
  }

  private async readOrphans(): Promise<RemoteOrphanEntry[]> {
    const raw = await readTextOrNull(this.orphansPath())
    if (raw === null || raw.trim() === '') return []
    const entries: RemoteOrphanEntry[] = []
    for (const line of raw.split('\n')) {
      if (line.trim() === '') continue
      try {
        entries.push(JSON.parse(line) as RemoteOrphanEntry)
      } catch {
        // 损坏行跳过。
      }
    }
    return entries
  }

  private async recordOrphan(entry: RemoteOrphanEntry): Promise<void> {
    await ensureDir(this.dir)
    await appendFile(this.orphansPath(), `${JSON.stringify(entry)}\n`, 'utf8')
  }

  /* ---------------- 角色守卫 ---------------- */

  private requireRole(role: RemoteRole): void {
    if (!this.settings.roles.includes(role)) {
      throw new MemoryError(
        'INVALID_INPUT',
        `provider "${this.providerId}" does not have the "${role}" role (declared: ${
          this.settings.roles.join(', ') || 'none'
        })`,
      )
    }
  }

  /* ---------------- 投影 ---------------- */

  /** mirror 的投影过滤：scopes / types / exclude_tags。空 scopes = 不允许任何分发。 */
  private projectionAllows(record: KnowledgeRecord): boolean {
    const projection = this.settings.projection
    if (projection.scopes.length === 0) return false
    const scope = formatScopeShort(record.scope)
    if (!projection.scopes.some((pattern) => scopeMatchesPattern(pattern, scope))) return false
    if (projection.types.length > 0 && !projection.types.includes(record.type)) return false
    if (projection.exclude_tags.some((tag) => record.tags.includes(tag))) return false
    return true
  }

  private remoteRecordFrom(entry: {
    knowledgeId: string
    version: number
    title: string
    summary: string
    body: string
    scope: string
    tags: string[]
  }): RemoteRecord {
    const body = this.settings.mirror.include_body
      ? entry.body.slice(0, this.settings.mirror.max_body_chars)
      : ''
    return {
      externalId: '',
      title: entry.title,
      summary: entry.summary,
      body,
      scope: entry.scope,
      tags: entry.tags,
      raw: { knowledgeId: entry.knowledgeId, version: entry.version },
    }
  }

  private entryFromRecord(record: KnowledgeRecord): RemoteOutboxEntry {
    return {
      op: 'push',
      knowledgeId: record.id,
      clientOpId: `${this.providerId}:push:${record.id}:${record.version}`,
      version: record.version,
      title: record.title,
      summary: record.summary,
      body: record.body,
      scope: formatScopeShort(record.scope),
      tags: this.withCoordinateTags(record),
      at: new Date().toISOString(),
    }
  }

  /* ---------------- 坐标编码（§5.8.1） ---------------- */

  /**
   * mirror 坐标 tags：金字塔结构序列化成扁平远端池上的坐标。
   * `mh:` 是协议保留前缀——用户标签里的 `mh:*` 一律剥掉（防止伪造来历）。
   * 在 outbox 入队时计算，重放自然保留坐标。
   */
  private withCoordinateTags(record: KnowledgeRecord): string[] {
    const base = record.tags.filter((tag) => !tag.startsWith('mh:'))
    if (!this.settings.mirror.coordinate_tags) return base
    const tags = [...base, `mh:scope:${record.scope.level}`, `mh:type:${record.type}`]
    if (record.scope.level === 'project') tags.push(`mh:ws:${record.scope.workspaceId}`)
    if (record.scope.level === 'domain') tags.push(`mh:domain:${record.scope.id}`)
    if (this.origin.coreId !== null) tags.push(`mh:core:${this.origin.coreId}`)
    tags.push(`mh:from:${this.origin.hubKey}`)
    return [...new Set(tags)]
  }

  /**
   * pull 侧作用域还原（§5.8.2 非对称映射的另一半）：
   * 远端坐标 → **拉取者自己的**作用域字符串；解析不出有效坐标退 feed.scope。
   * 恶意/损坏的坐标（未知 level、缺 ws/domain）一律按"没有坐标"处理。
   */
  private scopeFromTags(tags: string[]): string | null {
    if (!this.settings.feed.scope_from_tags) return null
    const value = (prefix: string): string | undefined =>
      tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length)
    const level = value('mh:scope:')
    if (level === 'global') return 'global'
    if (level === 'project') {
      const workspaceId = value('mh:ws:')
      return workspaceId !== undefined && workspaceId !== '' ? `project:${workspaceId}` : null
    }
    if (level === 'domain') {
      const domain = value('mh:domain:')
      return domain !== undefined && domain !== '' ? `domain:${domain}` : null
    }
    return null
  }

  /* ---------------- feed：pull ---------------- */

  /** 拉远端记录 → 本地 pending 候选。绝不 commit；只有 propose 成功才推进游标。 */
  async pull(): Promise<RemotePullResult> {
    this.requireRole('feed')
    const list = requireMethod(this.adapter, 'list')
    const state = await this.readState()
    const processed = new Set(state.pulledIds)
    const errors: string[] = []
    let pulled = 0
    let proposed = 0
    let skipped = 0

    try {
      const page = await list({ limit: this.settings.feed.limit, scope: this.settings.feed.scope })
      pulled = page.items.length
      // 游标失效（远端换库/清空）→ 全量重拉：清掉本地去重集合。
      if (page.resetRequired === true) processed.clear()

      for (const record of page.items) {
        if (processed.has(record.externalId)) {
          skipped += 1
          continue
        }
        const content = record.body.trim() !== '' ? record.body : record.summary
        const title =
          record.title.trim() !== ''
            ? record.title
            : record.summary.slice(0, 60).replace(/\s+/g, ' ').trim() || `远端记忆 ${record.externalId}`
        const summary = record.summary.trim() !== '' ? record.summary : title
        try {
          await this.host.proposeCandidate({
            type: this.settings.feed.type,
            // 作用域还原：远端坐标 → 拉取者自己的结构；无坐标退 feed.scope。
            scope: this.scopeFromTags(record.tags) ?? this.settings.feed.scope,
            title,
            summary,
            content: `# ${title}\n\n> 来源：远端 provider ${this.providerId}（externalId ${record.externalId}）\n\n${content}`,
            sourceRefs: [`note:remote:${this.providerId}:${record.externalId}`],
            tags: [this.providerId, ...this.settings.feed.tags],
          })
          proposed += 1
          processed.add(record.externalId)
        } catch (error) {
          skipped += 1
          errors.push(`${record.externalId}: ${(error as Error).message}`)
        }
      }

      state.lastPullAt = new Date().toISOString()
      state.pulledIds = boundList([...processed])
      // 全部成功 → 清掉上一次失败的摘要（真机验证发现：重试成功后旧错误一直挂着，
      // 面板上看起来像仍在故障）。失败保留本次第一条，供诊断。
      state.lastError = errors.length > 0 ? `pull: ${errors.length} item(s) failed: ${errors[0]}` : null
      await this.writeState(state)
      await this.host.audit({
        type: 'remote.pull',
        payload: { provider: this.providerId, pulled, proposed, skipped },
      })
    } catch (error) {
      // 列表本身失败：降级为诊断，不阻塞主流程。
      state.lastError = `pull failed: ${(error as Error).message}`
      await this.writeState(state)
      return { pulled, proposed, skipped, errors: [state.lastError] }
    }
    return { pulled, proposed, skipped, errors }
  }

  /* ---------------- mirror：push ---------------- */

  /** 本地 accepted → 远端 append。失败进 outbox；先重放上次遗留。 */
  async push(): Promise<RemotePushResult> {
    this.requireRole('mirror')
    const append = requireMethod(this.adapter, 'append')
    const state = await this.readState()
    let pushed = 0
    let outboxed = 0
    let replayed = 0

    // 1) 重放 outbox 里的 push（幂等键相同，重放不会产生第二份）。
    const entries = await this.readOutbox()
    const remaining: RemoteOutboxEntry[] = []
    for (const entry of entries) {
      if (entry.op !== 'push') {
        remaining.push(entry)
        continue
      }
      try {
        const result = await append(
          this.remoteRecordFrom({
            knowledgeId: entry.knowledgeId,
            version: entry.version,
            title: entry.title,
            summary: entry.summary,
            body: entry.body,
            scope: entry.scope,
            tags: entry.tags,
          }),
          { idempotencyKey: entry.clientOpId },
        )
        pushed += 1
        replayed += 1
        state.pushedIds = [...new Set(state.pushedIds).add(entry.knowledgeId)]
        if (result.externalId !== '') state.externalIds[entry.knowledgeId] = result.externalId
      } catch {
        remaining.push(entry)
        outboxed += 1
      }
    }
    await this.writeOutbox(remaining)

    // 2) push 新 accepted 知识（投影过滤 + 引用门槛 + 未镜像过的）。
    const records = await this.host.allKnowledge()
    const pushedSet = new Set(state.pushedIds)
    const requireCitations = this.settings.mirror.require_citations
    let gated = 0
    for (const record of records) {
      if (record.status !== 'accepted') continue
      if (pushedSet.has(record.id)) continue
      if (!this.projectionAllows(record)) continue
      // 萃取驱动的上报（§5.9.2）：cite 是"这条真的有用"的签名。
      // 没人用的条目留在本地 aging，不上报污染远端池。
      if (requireCitations > 0 && this.citationCount(record.id) < requireCitations) {
        gated += 1
        continue
      }
      const entry = this.entryFromRecord(record)
      try {
        const result = await append(this.remoteRecordFrom({
          knowledgeId: record.id,
          version: record.version,
          title: record.title,
          summary: record.summary,
          body: record.body,
          scope: entry.scope,
          tags: entry.tags,
        }), { idempotencyKey: entry.clientOpId })
        pushed += 1
        pushedSet.add(record.id)
        if (result.externalId !== '') state.externalIds[record.id] = result.externalId
      } catch {
        await this.appendOutbox(entry)
        outboxed += 1
      }
    }

    state.lastPushAt = new Date().toISOString()
    state.pushedIds = boundList([...pushedSet])
    state.externalIds = boundMap(state.externalIds)
    state.lastError = null
    await this.writeState(state)
    await this.host.audit({
      type: 'remote.push',
      payload: { provider: this.providerId, pushed, outboxed, replayed, ...(gated > 0 ? { gated } : {}) },
    })
    return { pushed, outboxed, replayed, gated }
  }

  /* ---------------- mirror：forget（作废传播） ---------------- */

  /**
   * 传播模式候选：deprecated（受 on_deprecate）/ superseded（受 on_merge）且**已镜像过**
   * 且尚未 forget。没镜像过的条目不产生 forget（否则 outbox 里全是无效操作）。
   */
  private collectForgetCandidates(state: RemoteSyncState, records: KnowledgeRecord[]): ForgetCandidate[] {
    const pushed = new Set(state.pushedIds)
    const forgotten = new Set(state.forgottenIds)
    const out: ForgetCandidate[] = []
    for (const record of records) {
      if (!pushed.has(record.id)) continue
      if (forgotten.has(record.id)) continue
      const isDeprecated = this.settings.forget.on_deprecate && record.status === 'deprecated'
      const isMerged = this.settings.forget.on_merge && record.status === 'superseded'
      if (!isDeprecated && !isMerged) continue
      out.push({
        knowledgeId: record.id,
        version: record.version,
        title: record.title,
        scope: formatScopeShort(record.scope),
        reason:
          record.deprecatedReason ??
          (record.supersededBy !== null ? `merged into ${record.supersededBy}` : 'deprecated locally'),
      })
    }
    // 确定性顺序：同一份本地状态永远产出同一批候选。
    out.sort((a, b) => a.knowledgeId.localeCompare(b.knowledgeId))
    return out
  }

  private async forgetOne(
    state: RemoteSyncState,
    candidate: ForgetCandidate,
    reason: string,
  ): Promise<RemoteForgetItem> {
    const externalId = state.externalIds[candidate.knowledgeId] ?? null

    // 1) 远端支持删除且我们知道 externalId → 真删除。
    if (hasCapability(this.adapter, 'write.delete') && externalId !== null) {
      try {
        const del = requireMethod(this.adapter, 'delete')
        await del(externalId, { reason, scope: candidate.scope })
        return { knowledgeId: candidate.knowledgeId, externalId, action: 'delete' }
      } catch (error) {
        return this.forgetFailure(state, candidate, externalId, reason, error)
      }
    }

    // 2) 远端没有删除能力：追加"已废弃"标记（若支持 append），并记孤儿。
    //    绝不假装成功——本地必须知道远端还留着一份已废弃副本。
    let markerNote = 'provider does not declare write.delete'
    if (hasCapability(this.adapter, 'write.append')) {
      try {
        const append = requireMethod(this.adapter, 'append')
        const markerKey = `${this.providerId}:forget:${candidate.knowledgeId}:${candidate.version}`
        const appended = await append(
          {
            externalId: '',
            title: `【已作废】${candidate.title}`,
            summary: candidate.reason,
            body: `本地知识 ${candidate.knowledgeId} 已作废：${reason}\n（由 dsh-memory-hub 传播；原副本无法删除，请人工在远端处理）`,
            scope: candidate.scope,
            tags: ['deprecated'],
            raw: { knowledgeId: candidate.knowledgeId, forgetOf: true },
          },
          { idempotencyKey: markerKey },
        )
        markerNote = `deprecation marker appended (${appended.externalId}); original copy remains on the remote`
      } catch (error) {
        markerNote = `deprecation marker failed: ${(error as Error).message}`
      }
    }
    await this.recordOrphan({
      knowledgeId: candidate.knowledgeId,
      externalId,
      reason: candidate.reason,
      cause: 'unsupported',
      detail: markerNote,
      at: new Date().toISOString(),
    })
    return {
      knowledgeId: candidate.knowledgeId,
      externalId,
      action: hasCapability(this.adapter, 'write.append') ? 'marker' : 'orphan',
      detail: markerNote,
    }
  }

  /** forget 的失败分流：unreachable → outbox 等重试；其余 → 孤儿（不重试无意义的请求）。 */
  private async forgetFailure(
    state: RemoteSyncState,
    candidate: ForgetCandidate,
    externalId: string | null,
    reason: string,
    error: unknown,
  ): Promise<RemoteForgetItem> {
    if (isRemoteError(error) && error.kind === 'unreachable') {
      // 网络/超时类失败值得重试：完整 payload 进 outbox（重放时不再依赖本地记录）。
      await this.appendOutbox({
        op: 'forget',
        knowledgeId: candidate.knowledgeId,
        clientOpId: `${this.providerId}:forget:${candidate.knowledgeId}:${candidate.version}`,
        version: candidate.version,
        title: candidate.title,
        summary: candidate.reason,
        body: '',
        scope: candidate.scope,
        tags: [],
        reason,
        at: new Date().toISOString(),
      })
      return {
        knowledgeId: candidate.knowledgeId,
        externalId,
        action: 'queued',
        detail: 'remote unreachable; queued for replay',
      }
    }
    const cause = isRemoteError(error)
      ? (error.kind === 'unsupported' || error.kind === 'conflict' || error.kind === 'invalid' || error.kind === 'unauthorized'
          ? error.kind
          : 'error')
      : 'error'
    await this.recordOrphan({
      knowledgeId: candidate.knowledgeId,
      externalId,
      reason: candidate.reason,
      cause,
      detail: (error as Error).message,
      at: new Date().toISOString(),
    })
    return { knowledgeId: candidate.knowledgeId, externalId, action: 'orphan', detail: (error as Error).message }
  }

  /**
   * forget 主入口。
   *
   * - 无 `knowledgeId`：传播模式，受 `forget.on_deprecate` / `on_merge` / `max_per_run` 控制；
   *   `dryRun: true` 返回将受影响的条目与计划动作，**零副作用**。
   * - 有 `knowledgeId`：人工显式遗忘，绕过开关；从未镜像过的条目如实报 skipped，不产生幽灵请求。
   */
  async forget(opts: { dryRun?: boolean; reason?: string; knowledgeId?: string } = {}): Promise<RemoteForgetResult> {
    this.requireRole('mirror')
    const state = await this.readState()
    const dryRun = opts.dryRun === true
    const reason = (opts.reason ?? '').trim() !== '' ? (opts.reason ?? '').trim() : 'deprecated locally'

    // 定向模式：只处理指定条目。
    if (opts.knowledgeId !== undefined) {
      const records = await this.host.allKnowledge()
      const record = records.find((item) => item.id === opts.knowledgeId)
      if (record === undefined) {
        return {
          dryRun,
          forgotten: 0,
          orphans: 0,
          pending: 0,
          outboxed: 0,
          items: [
            {
              knowledgeId: opts.knowledgeId,
              externalId: null,
              action: 'skipped',
              detail: 'knowledge entry not found locally',
            },
          ],
        }
      }
      if (!new Set(state.pushedIds).has(record.id)) {
        return {
          dryRun,
          forgotten: 0,
          orphans: 0,
          pending: 0,
          outboxed: 0,
          items: [
            {
              knowledgeId: record.id,
              externalId: null,
              action: 'skipped',
              detail: 'never mirrored to this provider; nothing to forget remotely',
            },
          ],
        }
      }
      if (new Set(state.forgottenIds).has(record.id)) {
        return {
          dryRun,
          forgotten: 0,
          orphans: 0,
          pending: 0,
          outboxed: 0,
          items: [{ knowledgeId: record.id, externalId: null, action: 'skipped', detail: 'already forgotten' }],
        }
      }
      if (dryRun) {
        return {
          dryRun,
          forgotten: 0,
          orphans: 0,
          pending: 1,
          outboxed: 0,
          items: [
            {
              knowledgeId: record.id,
              externalId: state.externalIds[record.id] ?? null,
              action: hasCapability(this.adapter, 'write.delete') ? 'delete' : hasCapability(this.adapter, 'write.append') ? 'marker' : 'orphan',
              detail: 'planned action (dry run)',
            },
          ],
        }
      }
      const item = await this.forgetOne(state, {
        knowledgeId: record.id,
        version: record.version,
        title: record.title,
        scope: formatScopeShort(record.scope),
        reason,
      }, reason)
      if (item.action === 'delete') {
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(record.id)])
      } else if (item.action === 'marker' || item.action === 'orphan') {
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(record.id)])
      }
      state.lastForgetAt = new Date().toISOString()
      await this.writeState(state)
      await this.host.audit({
        type: 'remote.forget',
        payload: {
          provider: this.providerId,
          forgotten: item.action === 'delete' ? 1 : 0,
          orphans: item.action === 'marker' || item.action === 'orphan' ? 1 : 0,
          pending: 0,
          outboxed: item.action === 'queued' ? 1 : 0,
          dryRun,
        },
      })
      return {
        dryRun,
        forgotten: item.action === 'delete' ? 1 : 0,
        orphans: item.action === 'marker' || item.action === 'orphan' ? 1 : 0,
        pending: 0,
        outboxed: item.action === 'queued' ? 1 : 0,
        items: [item],
      }
    }

    // 传播模式。候选必须在 **重放 outbox 之后** 计算：重放成功的条目会进 forgottenIds，
    // 提前算出的候选列表会包含它，导致同一条被删两次。
    const records = await this.host.allKnowledge()

    if (dryRun) {
      // 预演必须零副作用：不重放 outbox、不写状态、不调远端。
      const candidates = this.collectForgetCandidates(state, records)
      const items: RemoteForgetItem[] = []
      for (const candidate of candidates) {
        const externalId = state.externalIds[candidate.knowledgeId] ?? null
        const action = hasCapability(this.adapter, 'write.delete')
          ? externalId !== null
            ? 'delete'
            : 'orphan'
          : hasCapability(this.adapter, 'write.append')
            ? 'marker'
            : 'orphan'
        items.push({ knowledgeId: candidate.knowledgeId, externalId, action, detail: 'planned action (dry run)' })
      }
      return { dryRun, forgotten: 0, orphans: 0, pending: candidates.length, outboxed: 0, items }
    }

    // 先重放上次 unreachable 留下的 forget。
    let forgotten = 0
    let orphans = 0
    let outboxed = 0
    const items: RemoteForgetItem[] = []
    const entries = await this.readOutbox()
    const remaining: RemoteOutboxEntry[] = []
    for (const entry of entries) {
      if (entry.op !== 'forget') {
        remaining.push(entry)
        continue
      }
      const externalId = state.externalIds[entry.knowledgeId] ?? null
      if (!hasCapability(this.adapter, 'write.delete') || externalId === null) {
        // 永远不会成功：转孤儿并移出重放队列（孤儿台账就是"待人审"队列）。
        await this.recordOrphan({
          knowledgeId: entry.knowledgeId,
          externalId,
          reason: entry.reason ?? 'deprecated locally',
          cause: 'unsupported',
          detail: 'forget replayed but provider cannot delete; moved to orphans',
          at: new Date().toISOString(),
        })
        orphans += 1
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(entry.knowledgeId)])
        items.push({ knowledgeId: entry.knowledgeId, externalId, action: 'orphan', detail: 'converted from outbox' })
        continue
      }
      try {
        const del = requireMethod(this.adapter, 'delete')
        await del(externalId, { reason: entry.reason ?? 'deprecated locally', scope: entry.scope })
        forgotten += 1
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(entry.knowledgeId)])
        items.push({ knowledgeId: entry.knowledgeId, externalId, action: 'delete', detail: 'replayed from outbox' })
      } catch (error) {
        if (isRemoteError(error) && error.kind === 'unreachable') {
          remaining.push(entry)
          outboxed += 1
          items.push({ knowledgeId: entry.knowledgeId, externalId, action: 'queued', detail: 'still unreachable' })
        } else {
          await this.recordOrphan({
            knowledgeId: entry.knowledgeId,
            externalId,
            reason: entry.reason ?? 'deprecated locally',
            cause: isRemoteError(error)
              ? error.kind === 'unreachable'
                ? 'error'
                : error.kind
              : 'error',
            detail: (error as Error).message,
            at: new Date().toISOString(),
          })
          orphans += 1
          state.forgottenIds = boundList([...new Set(state.forgottenIds).add(entry.knowledgeId)])
          items.push({ knowledgeId: entry.knowledgeId, externalId, action: 'orphan', detail: (error as Error).message })
        }
      }
    }
    await this.writeOutbox(remaining)

    // 候选在重放之后计算：重放成功的条目已在 forgottenIds 里，不会重复传播。
    const candidates = this.collectForgetCandidates(state, records)
    // 再处理新候选（受 max_per_run 限制；0 = 不限）。
    const cap = this.settings.forget.max_per_run
    const slice = cap === 0 ? candidates : candidates.slice(0, cap)
    for (const candidate of slice) {
      const item = await this.forgetOne(state, candidate, candidate.reason || reason)
      items.push(item)
      if (item.action === 'delete') {
        forgotten += 1
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(candidate.knowledgeId)])
      } else if (item.action === 'marker' || item.action === 'orphan') {
        orphans += 1
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(candidate.knowledgeId)])
      } else if (item.action === 'queued') {
        outboxed += 1
      }
    }

    state.lastForgetAt = new Date().toISOString()
    await this.writeState(state)
    await this.host.audit({
      type: 'remote.forget',
      payload: {
        provider: this.providerId,
        forgotten,
        orphans,
        pending: Math.max(0, candidates.length - slice.length),
        outboxed,
        dryRun,
      },
    })
    return { dryRun, forgotten, orphans, pending: Math.max(0, candidates.length - slice.length), outboxed, items }
  }

  /* ---------------- 状态 ---------------- */

  async status(): Promise<RemoteEngineStatus> {
    const state = await this.readState()
    const orphans = await this.readOrphans()
    const outbox = await this.readOutbox()
    return {
      provider: this.providerId,
      kind: this.adapter.kind,
      roles: [...this.settings.roles],
      lastPullAt: state.lastPullAt,
      lastPushAt: state.lastPushAt,
      lastForgetAt: state.lastForgetAt,
      lastError: state.lastError,
      mirrored: state.pushedIds.length,
      forgotten: state.forgottenIds.length,
      outboxPending: outbox.length,
      orphans: orphans.length,
    }
  }
}

/** 只读快照（不需要 adapter / 不联网）：供 status、面板与诊断。 */
export async function readRemoteSyncSnapshot(recordsDir: string, providerId: string): Promise<RemoteSyncSnapshot> {
  const dir = join(recordsDir.replace(/\/+$/, ''), 'remote', safeProviderId(providerId))
  const raw = await readTextOrNull(join(dir, 'state.json'))
  let state = EMPTY_STATE
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as Partial<RemoteSyncState>
      const strings = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      state = {
        ...EMPTY_STATE,
        lastPullAt: typeof parsed.lastPullAt === 'string' ? parsed.lastPullAt : null,
        lastPushAt: typeof parsed.lastPushAt === 'string' ? parsed.lastPushAt : null,
        lastForgetAt: typeof parsed.lastForgetAt === 'string' ? parsed.lastForgetAt : null,
        lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
        pulledIds: strings(parsed.pulledIds),
        pushedIds: strings(parsed.pushedIds),
        forgottenIds: strings(parsed.forgottenIds),
      }
    } catch {
      // 损坏状态文件按空状态处理。
    }
  }
  const countLines = async (name: string): Promise<number> => {
    const text = await readTextOrNull(join(dir, name))
    if (text === null || text.trim() === '') return 0
    return text.split('\n').filter((line) => line.trim() !== '').length
  }
  return {
    provider: providerId,
    lastPullAt: state.lastPullAt,
    lastPushAt: state.lastPushAt,
    lastForgetAt: state.lastForgetAt,
    lastError: state.lastError,
    outboxPending: await countLines('outbox.jsonl'),
    orphans: await countLines('orphans.jsonl'),
    mirrored: state.pushedIds.length,
  }
}

export interface RemoteSyncStateSnapshot extends RemoteSyncSnapshot {
  pushedIds: string[]
  forgottenIds: string[]
}

/**
 * 同步变体：给 `remoteStatus()` 用——overview / config 都是同步路径，面板轮询
 * 30s 一次、文件都是小 JSON/JSONL，直接 `readFileSync` 可以接受；若以后出现
 * 大 outbox，再换成内存缓存 + 失效标记，不要在这里偷偷改成异步。
 */
export function readRemoteSyncStateSync(recordsDir: string, providerId: string): RemoteSyncStateSnapshot {
  const dir = join(recordsDir.replace(/\/+$/, ''), 'remote', safeProviderId(providerId))
  const readSmall = (name: string): string | null => {
    try {
      return readFileSync(join(dir, name), 'utf8')
    } catch {
      return null
    }
  }
  const raw = readSmall('state.json')
  let state = EMPTY_STATE
  if (raw !== null && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw) as Partial<RemoteSyncState>
      const strings = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      state = {
        ...EMPTY_STATE,
        lastPullAt: typeof parsed.lastPullAt === 'string' ? parsed.lastPullAt : null,
        lastPushAt: typeof parsed.lastPushAt === 'string' ? parsed.lastPushAt : null,
        lastForgetAt: typeof parsed.lastForgetAt === 'string' ? parsed.lastForgetAt : null,
        lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
        pulledIds: strings(parsed.pulledIds),
        pushedIds: strings(parsed.pushedIds),
        forgottenIds: strings(parsed.forgottenIds),
      }
    } catch {
      // 损坏状态文件按空状态处理。
    }
  }
  const countLines = (name: string): number => {
    const text = readSmall(name)
    if (text === null || text.trim() === '') return 0
    return text.split('\n').filter((line) => line.trim() !== '').length
  }
  return {
    provider: providerId,
    lastPullAt: state.lastPullAt,
    lastPushAt: state.lastPushAt,
    lastForgetAt: state.lastForgetAt,
    lastError: state.lastError,
    outboxPending: countLines('outbox.jsonl'),
    orphans: countLines('orphans.jsonl'),
    mirrored: state.pushedIds.length,
    pushedIds: state.pushedIds,
    forgottenIds: state.forgottenIds,
  }
}

/** 传播候选数（纯函数，可测）：deprecated（on_deprecate）/ superseded（on_merge）且已镜像且未 forget。 */
export function countPendingForget(
  records: KnowledgeRecord[],
  forget: { on_deprecate: boolean; on_merge: boolean },
  pushedIds: string[],
  forgottenIds: string[],
): number {
  const pushed = new Set(pushedIds)
  const forgotten = new Set(forgottenIds)
  let count = 0
  for (const record of records) {
    if (!pushed.has(record.id)) continue
    if (forgotten.has(record.id)) continue
    const isDeprecated = forget.on_deprecate && record.status === 'deprecated'
    const isMerged = forget.on_merge && record.status === 'superseded'
    if (isDeprecated || isMerged) count += 1
  }
  return count
}

export interface LegacyMigrationResult {
  migrated: boolean
  pulled: number
  pushed: number
  /** 未迁移的原因（新状态已存在 / 旧文件不存在 / 解析失败）；migrated 时为 undefined。 */
  reason?: string
}

/**
 * 一次性迁移：旧腾讯桥的 `records/tencent-state.json` → 新引擎的
 * `records/remote/<providerId>/state.json`（proposal-remote-providers §7）。
 *
 * 没有这条迁移，用户从旧桥切到新引擎后的**第一次 pull 会把旧桥已拉过的
 * 来源重新提候选**——pulledIds 游标丢了，重复候选要人审拒一遍，不可接受。
 *
 * 规则：
 * - 幂等：新 state.json 已存在就绝不动（已迁移或已运行过）；
 * - 旧文件**保留不删**（文件是权威，迁移只复制不搬运）；
 * - 旧 outbox 不迁移：旧桥 push 语义（conversation 追加）与新引擎幂等键不同，
 *   重放旧条目只会产生重复消息；outboxPending 旧值转告 lastError 之外的诊断即可。
 */
export async function migrateLegacyRemoteState(
  recordsDir: string,
  providerId: string,
): Promise<LegacyMigrationResult> {
  const root = recordsDir.replace(/\/+$/, '')
  const newStatePath = join(root, 'remote', safeProviderId(providerId), 'state.json')
  if ((await readTextOrNull(newStatePath)) !== null) {
    return { migrated: false, pulled: 0, pushed: 0, reason: 'new state already exists' }
  }
  const legacyRaw = await readTextOrNull(join(root, 'tencent-state.json'))
  if (legacyRaw === null || legacyRaw.trim() === '') {
    return { migrated: false, pulled: 0, pushed: 0, reason: 'no legacy state file' }
  }
  try {
    const legacy = JSON.parse(legacyRaw) as {
      lastPullAt?: unknown
      lastPushAt?: unknown
      lastError?: unknown
      pulledIds?: unknown
      pushedIds?: unknown
    }
    const strings = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    const state: RemoteSyncState = {
      ...EMPTY_STATE,
      lastPullAt: typeof legacy.lastPullAt === 'string' ? legacy.lastPullAt : null,
      lastPushAt: typeof legacy.lastPushAt === 'string' ? legacy.lastPushAt : null,
      lastError: typeof legacy.lastError === 'string' ? legacy.lastError : null,
      pulledIds: strings(legacy.pulledIds),
      pushedIds: strings(legacy.pushedIds),
    }
    await ensureDir(join(root, 'remote', safeProviderId(providerId)))
    await writeAtomic(newStatePath, JSON.stringify(state, null, 2))
    return { migrated: true, pulled: state.pulledIds.length, pushed: state.pushedIds.length }
  } catch (error) {
    // 旧文件损坏：不假装迁移成功，如实报告，新引擎从零开始（宁重复可审，不静默丢游标）。
    return {
      migrated: false,
      pulled: 0,
      pushed: 0,
      reason: `legacy state unparsable: ${(error as Error).message}`,
    }
  }
}
