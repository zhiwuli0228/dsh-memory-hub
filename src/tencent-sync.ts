/**
 * 腾讯桥双向同步（阶段二）。
 *
 * - pull：拉腾讯 L1/L2 **增量** → 生成 pending 候选（复用 service.propose，不自动 commit）；
 *   `pulledIds` 记录已处理来源，同一 atomic/scenario 不重复生成候选；
 * - push：本地 accepted 知识 → 腾讯 conversation 通道（腾讯自行抽取）；
 * - outbox：离线期间的 push 队列，重连后按幂等键重放；
 * - 游标：`records/tencent-state.json` 记录上次拉取时间、已处理来源、已推送知识与 outbox 水位。
 *
 * 单向权威：本地文件是事实源；腾讯是增强通道。pull 产物永远是 candidate，
 * push 只追加消息、绝不删改腾讯数据。
 */

import { readTextOrNull, writeAtomic, pathExists, removeFile, ensureDir } from './atomic.js'
import type { KnowledgeRecord } from './types.js'
import { TencentClient, TencentError, type TencentAtomicItem, type TencentScenarioEntry } from './tencent-client.js'

/** service 层提供给 tencent-sync 的最小能力（便于 mock 与解耦）。 */
export interface TencentSyncHost {
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
  /** 列出本地 accepted 知识（push 来源）。 */
  listAcceptedKnowledge(): Promise<KnowledgeRecord[]>
  /** 记录审计事件。 */
  audit(event: TencentAuditEvent): Promise<void>
}

export type TencentAuditEvent =
  | { type: 'tencent.pull'; payload: { pulled: number; proposed: number; skipped: number } }
  | { type: 'tencent.push'; payload: { id: string; fromOutbox: boolean } }

export interface TencentSyncState {
  /** 上次成功 pull 的边界（atomic 时间戳，ISO）。空 = 从未 pull。 */
  lastPullAt: string | null
  /** 上次成功 push 的时间。 */
  lastPushAt: string | null
  /** outbox 中待重放的条目数。 */
  outboxPending: number
  /** 上次同步错误信息（诊断用）。 */
  lastError: string | null
  /** 已成功 push 的知识 id（去重：同一 id 不重复推送）。 */
  pushedIds: string[]
  /** 已处理过的腾讯条目 id（增量游标：atomic id / scenario path，去重：同一来源不重复生成候选）。 */
  pulledIds: string[]
}

const EMPTY_STATE: TencentSyncState = { lastPullAt: null, lastPushAt: null, outboxPending: 0, lastError: null, pushedIds: [], pulledIds: [] }

export interface TencentSyncOptions {
  /** 状态文件目录（hub records 目录）。 */
  recordsDir: string
  host: TencentSyncHost
  client: TencentClient
  /** 每次 pull 的最大候选数，防洪水。 */
  pullLimit: number
  /** pull 时生成候选的作用域。 */
  pullScope: string
  /** pull 时生成候选的类型。 */
  pullType: string
  /** push 时使用的腾讯会话 id 前缀。 */
  pushSessionPrefix: string
}

interface OutboxEntry {
  op: 'push'
  id: string
  clientOpId: string
  scope: string
  title: string
  summary: string
  body: string
  at: string
}

export interface PullResult {
  pulled: number
  proposed: number
  skipped: number
  state: TencentSyncState
}

export interface PushResult {
  pushed: number
  outboxed: number
  state: TencentSyncState
}

export interface SyncStatus {
  enabled: boolean
  state: TencentSyncState
  url: string
  /** 数据面连通性（tencentStatus 主动 ping；定时心跳也用）。 */
  ping?: { ok: boolean; total?: number; error?: string }
}

function statePath(recordsDir: string): string {
  return `${recordsDir.replace(/\/+$/, '')}/tencent-state.json`
}

function outboxPath(recordsDir: string): string {
  return `${recordsDir.replace(/\/+$/, '')}/outbox.jsonl`
}

async function readState(recordsDir: string): Promise<TencentSyncState> {
  const raw = await readTextOrNull(statePath(recordsDir))
  if (raw === null) return { ...EMPTY_STATE }
  try {
    const parsed = JSON.parse(raw) as Partial<TencentSyncState>
    return {
      lastPullAt: typeof parsed.lastPullAt === 'string' ? parsed.lastPullAt : null,
      lastPushAt: typeof parsed.lastPushAt === 'string' ? parsed.lastPushAt : null,
      outboxPending: Number.isFinite(parsed.outboxPending) ? Number(parsed.outboxPending) : 0,
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
      pushedIds: Array.isArray(parsed.pushedIds) ? parsed.pushedIds.filter((id): id is string => typeof id === 'string') : [],
      pulledIds: Array.isArray(parsed.pulledIds) ? parsed.pulledIds.filter((id): id is string => typeof id === 'string') : [],
    }
  } catch {
    return { ...EMPTY_STATE }
  }
}

async function writeState(recordsDir: string, state: TencentSyncState): Promise<void> {
  await ensureDir(recordsDir)
  await writeAtomic(statePath(recordsDir), JSON.stringify(state, null, 2))
}

async function readOutbox(recordsDir: string): Promise<OutboxEntry[]> {
  const raw = await readTextOrNull(outboxPath(recordsDir))
  if (raw === null || raw.trim() === '') return []
  const entries: OutboxEntry[] = []
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue
    try {
      entries.push(JSON.parse(line) as OutboxEntry)
    } catch {
      // 损坏行跳过（可删可重建文件）。
    }
  }
  return entries
}

async function appendOutbox(recordsDir: string, entry: OutboxEntry): Promise<void> {
  await ensureDir(recordsDir)
  const { appendFile } = await import('node:fs/promises')
  await appendFile(outboxPath(recordsDir), `${JSON.stringify(entry)}\n`, 'utf8')
}

async function rewriteOutbox(recordsDir: string, entries: OutboxEntry[]): Promise<void> {
  await writeAtomic(outboxPath(recordsDir), entries.map((entry) => JSON.stringify(entry)).join('\n'))
}

function clientOpId(prefix: string, id: string): string {
  // 幂等键：语义可复现，重放不重复。
  return `${prefix}:${id}`
}

export class TencentSync {
  private readonly recordsDir: string
  private readonly host: TencentSyncHost
  private readonly rawClient: TencentClient
  private readonly pullLimit: number
  private readonly pullScope: string
  private readonly pullType: string
  private readonly pushSessionPrefix: string

  constructor(options: TencentSyncOptions) {
    this.recordsDir = options.recordsDir
    this.host = options.host
    this.rawClient = options.client
    this.pullLimit = options.pullLimit
    this.pullScope = options.pullScope
    this.pullType = options.pullType
    this.pushSessionPrefix = options.pushSessionPrefix
  }

  async status(): Promise<SyncStatus> {
    const state = await readState(this.recordsDir)
    return { enabled: true, state, url: this.rawClient.baseUrl }
  }

  /** 底层 client（只读使用：ping 等）。 */
  get client(): TencentClient {
    return this.rawClient
  }

  /** 把一条腾讯 atomic 转成候选内容（type 判断 + 标题化）。 */
  private toCandidate(atomic: TencentAtomicItem): { title: string; summary: string; content: string; tags: string[] } {
    const content = atomic.content.trim()
    const title = content.slice(0, 60).replace(/\s+/g, ' ').replace(/[。；;,.!?]+$/, '')
    const summary = content.length > 220 ? `${content.slice(0, 217)}…` : content
    const type = atomic.type === 'persona' ? 'persona' : atomic.type === 'instruction' ? 'instruction' : 'episodic'
    const tags = ['tencent', `t:${type}`, ...(atomic.team_id !== undefined ? [`team:${atomic.team_id}`] : [])]
    return {
      title: title === '' ? `腾讯记忆 ${atomic.id}` : title,
      summary,
      content: `# ${title}\n\n> 来源：腾讯 Agent Memory 自动抽取（atomic ${atomic.id}）\n\n${content}`,
      tags,
    }
  }

  /** 拉取腾讯 L1/L2 增量 → 生成 pending 候选。不 commit。 */
  async pull(): Promise<PullResult> {
    let pulled = 0
    let proposed = 0
    let skipped = 0
    const state = await readState(this.recordsDir)
    const processed = new Set(state.pulledIds)
    const errors: string[] = []
    try {
      const atomics = await this.rawClient.listAtomics(this.pullLimit)
      const scenarios = await this.rawClient.listScenarios()
      pulled = atomics.length + scenarios.length

      for (const atomic of atomics) {
        // 增量：已处理过的来源 id 直接跳过（腾讯侧同一 atomic 不重复生成候选）。
        if (processed.has(atomic.id)) {
          skipped += 1
          continue
        }
        const candidate = this.toCandidate(atomic)
        try {
          await this.host.proposeCandidate({
            type: this.pullType,
            scope: this.pullScope,
            title: candidate.title,
            summary: candidate.summary,
            content: candidate.content,
            sourceRefs: [`note:tencent:${atomic.id}`],
            tags: candidate.tags,
          })
          proposed += 1
          processed.add(atomic.id)
        } catch (error) {
          skipped += 1
          errors.push(`atomic ${atomic.id}: ${(error as Error).message}`)
        }
      }

      for (const scenario of scenarios) {
        if (processed.has(`scenario:${scenario.path}`)) {
          skipped += 1
          continue
        }
        try {
          const content = await this.rawClient.readScenario(scenario.path)
          await this.host.proposeCandidate({
            type: 'process',
            scope: this.pullScope,
            title: `场景：${scenario.path}`,
            summary: scenario.summary,
            content: `# 场景：${scenario.path}\n\n> 来源：腾讯 Agent Memory L2 场景（自动归纳）\n\n${content || scenario.summary}`,
            sourceRefs: [`note:tencent:scenario:${scenario.path}`],
            tags: ['tencent', 'scenario'],
          })
          proposed += 1
          processed.add(`scenario:${scenario.path}`)
        } catch (error) {
          skipped += 1
          errors.push(`scenario ${scenario.path}: ${(error as Error).message}`)
        }
      }

      state.lastPullAt = new Date().toISOString()
      // 增量游标有界（保留最近 2000 个来源），避免状态文件无限增长。
      state.pulledIds = [...processed].slice(-2000)
      // 保留逐条诊断（成功路径不再用 null 覆盖循环内收集到的错误）。
      state.lastError = errors.length > 0 ? `pull ${errors.length} item(s) failed: ${errors[0]}` : null
      await writeState(this.recordsDir, state)
      await this.host.audit({ type: 'tencent.pull', payload: { pulled, proposed, skipped } })
    } catch (error) {
      // pull 的任何失败都降级为诊断（网络、超时、服务不可达、格式问题），不阻塞主流程。
      state.lastError = `pull failed: ${(error as Error).message}`
      await writeState(this.recordsDir, state)
      return { pulled, proposed, skipped, state }
    }
    return { pulled, proposed, skipped, state }
  }

  /** 把本地 accepted 知识 push 到腾讯 conversation 通道。 */
  async push(): Promise<PushResult> {
    let pushed = 0
    let outboxed = 0
    const state = await readState(this.recordsDir)
    const pushedSet = new Set(state.pushedIds)
    try {
      const entries = await readOutbox(this.recordsDir)
      // 先重放 outbox（幂等）。
      const remaining: OutboxEntry[] = []
      for (const entry of entries) {
        try {
          await this.rawClient.addConversation(this.sessionFor(entry.id), 'user', this.renderPushBody(entry))
          pushed += 1
          pushedSet.add(entry.id)
          await this.host.audit({ type: 'tencent.push', payload: { id: entry.id, fromOutbox: true } })
        } catch {
          remaining.push(entry)
          outboxed += 1
        }
      }
      await rewriteOutbox(this.recordsDir, remaining)

      // 再 push 新 accepted 知识（跳过已推送过的 id，避免重复）。
      const accepted = await this.host.listAcceptedKnowledge()
      for (const record of accepted) {
        if (pushedSet.has(record.id)) continue
        const opId = clientOpId('push', record.id)
        const entry: OutboxEntry = {
          op: 'push',
          id: record.id,
          clientOpId: opId,
          scope: formatScopeShort(record.scope),
          title: record.title,
          summary: record.summary,
          body: record.body,
          at: new Date().toISOString(),
        }
        try {
          await this.rawClient.addConversation(this.sessionFor(record.id), 'user', this.renderPushBody(entry))
          pushed += 1
          pushedSet.add(record.id)
          await this.host.audit({ type: 'tencent.push', payload: { id: record.id, fromOutbox: false } })
        } catch {
          await appendOutbox(this.recordsDir, entry)
          outboxed += 1
        }
      }

      state.lastPushAt = new Date().toISOString()
      state.outboxPending = (await readOutbox(this.recordsDir)).length
      // 去重集合有界（保留最近 2000 条），避免状态文件无限增长。
      state.pushedIds = [...pushedSet].slice(-2000)
      state.lastError = null
      await writeState(this.recordsDir, state)
    } catch (error) {
      state.lastError = `push failed: ${(error as Error).message}`
      await writeState(this.recordsDir, state)
      if (error instanceof TencentError) {
        return { pushed, outboxed, state }
      }
      throw error
    }
    return { pushed, outboxed, state }
  }

  private sessionFor(id: string): string {
    return `${this.pushSessionPrefix}-${id.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 60)}`
  }

  private renderPushBody(entry: OutboxEntry): string {
    const scope = entry.scope
    return [
      `【记忆共享】${scope} · ${entry.title}`,
      `摘要：${entry.summary}`,
      `正文：${entry.body.slice(0, 4000)}`,
      `来源知识 id：${entry.id}`,
      '(由 dsh-memory-hub 推送，腾讯侧自动抽取为团队记忆)',
    ].join('\n')
  }
}

function formatScopeShort(scope: unknown): string {
  if (scope === null || typeof scope !== 'object') return 'unknown'
  const value = scope as { level?: string; workspaceId?: string; id?: string }
  if (value.level === 'global') return 'global'
  if (value.level === 'domain') return `domain:${value.id ?? '?'}`
  if (value.level === 'project') return `project:${value.workspaceId ?? '?'}`
  return 'unknown'
}

export async function clearOutbox(recordsDir: string): Promise<void> {
  if (await pathExists(outboxPath(recordsDir))) {
    await removeFile(outboxPath(recordsDir))
  }
  const state = await readState(recordsDir)
  state.outboxPending = 0
  await writeState(recordsDir, state)
}
