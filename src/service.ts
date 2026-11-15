import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, realpath } from 'node:fs/promises'
import packageJson from '../package.json' with { type: 'json' }
import { isAbsolute, join, relative, sep } from 'node:path'
import { MemoryError } from './errors.js'
import { configSchema, type CoreWorkspaceConfig, type MemoryConfig, type WorkspaceConfig } from './config.js'
import type { Hub } from './hub.js'
import type { Ledger, LedgerState } from './ledger.js'
import { KnowledgeStore } from './store.js'
import { writeAtomic } from './atomic.js'
import { stringify as stringifyYaml } from 'yaml'
import { newCitationId, newMaintenanceTaskId, newPreflightId, newTaskId } from './ids.js'
import { formatScope, isScopeVisible, parseScope, visibilityFor } from './scope.js'
import {
  analyzeMaintenance,
  maintenanceToken,
  renderMaintenanceReport,
  type MaintenanceAnalysis,
  type MaintenanceCandidate,
  type MaintenanceIssue,
  type MaintenanceWorkspaceStat,
} from './maintenance.js'
import { nowIso } from './time.js'
import { temporalAnnotation, temporalState, type TemporalPolicy } from './temporal.js'
import { findNearDuplicates } from './duplicates.js'
import { assessProposalRisk, type ProposalRisk } from './risk.js'
import type {
  AppliesTo,
  CitationRecord,
  KnowledgeHit,
  KnowledgeRecord,
  KnowledgeStatus,
  KnowledgeType,
  PreflightStatus,
  ProposalOperation,
  ProposalRecord,
  TaskRecord,
  TemporalState,
  Visibility,
  WorkspaceMatch,
  WritebackAssessment,
} from './types.js'
import type { AgentLike, Context, PreToolDecision, ToolRunContext, WorkingDirectoryService } from './host.js'
import {
  buildDigest,
  digestHash,
  ownerWorkspaceOf,
  reflectRoots,
  renderDigest,
  type ReflectSessionRecord,
  type SessionDigestSource,
  type ReflectStateFile,
} from './reflect.js'
import { TencentClient } from './tencent-client.js'
import { TencentSync, type PullResult, type PushResult, type SyncStatus } from './tencent-sync.js'
import {
  RemoteRegistry,
  assertRemoteSettings,
  normalizeRemoteSettings,
  validateRemoteSettings,
  type RemoteProviderConfig,
  type RemoteProviderHandle,
  type RemoteSettings,
} from './remote/registry.js'
import {
  RemoteError,
  hasCapability,
  requireMethod,
  type RemoteRecord,
} from './remote/types.js'
import {
  RemoteSync,
  countPendingForget,
  readRemoteSyncSnapshot,
  readRemoteSyncStateSync,
  type RemoteAuditEvent,
  type RemoteForgetResult,
  type RemotePullResult,
  type RemotePushResult,
  type RemoteSyncHost,
  type RemoteSyncSnapshot,
  migrateLegacyRemoteState,
  type LegacyMigrationResult,
} from './remote/sync.js'
import { ScenarioBuilder, type ScenarioResult } from './scenario.js'
import { resolveApiKeyEnv } from './credentials.js'

/** hybrid 组合检索中单个远端 provider 的贡献（proposal-remote-providers §5.7）。 */
interface RemoteContribution {
  provider: string
  ok: boolean
  /** 实际注入的条数（截断后）。 */
  hits: number
  /** 因 token 上限被截掉的条数；0 = 未截断。 */
  truncated: number
  /** 渲染好的注入行（已带 `[providerId]` 标注）。 */
  lines: string[]
  /** 失败或超时原因；ok 时为 undefined。 */
  error?: string
}

export const PLUGIN_VERSION = packageJson.version

/** 预检排除集合：尚未生效的条目不应被当成现行事实注入。 */
const SCHEDULED_STATES: ReadonlySet<TemporalState> = new Set<TemporalState>(['scheduled'])

interface SessionState {
  turn: number
  taskId: string
  workspace: WorkspaceMatch
  visibility: Visibility
  pack: string
  status: PreflightStatus
  hits: Array<{ id: string; version: number }>
  closed: boolean
}

export interface PreflightResult {
  taskId: string | null
  status: PreflightStatus
  hits: Array<{ id: string; version: number }>
  pack: string
  tokens: number
}

/** memory_get 读取选项：默认摘要，section 只读一个小节，full 读全文。 */
export interface ReadOptions {
  full?: boolean
  section?: string
  max_chars?: number
}

/** 摘要与单小节读取的默认字符上限。 */
const DIGEST_CHARS = 700
const SECTION_CHARS = 2000
/** 面板「待审批」一次最多返回多少条；批量萃取时 pending/ 可能上千条。 */
export const PANEL_PENDING_LIMIT = 200

export interface SearchArgs {
  query: string
  types?: KnowledgeType[]
  scope?: string
  statuses?: KnowledgeStatus[]
  limit?: number
}

export interface ProposeArgs {
  operation: ProposalOperation
  type: KnowledgeType
  scope: string
  title: string
  summary: string
  content?: string
  source_refs?: string[]
  tags?: string[]
  related?: string[]
  supersedes?: string[]
  applies_to?: Partial<AppliesTo>
  target?: string
  expected_version?: number
  reason?: string
  /** 事实开始成立的时刻（ISO 8601，带时区）；缺省视为与 created_at 相同。 */
  valid_from?: string
  /** 事实不再可信的时刻；缺省不设到期。 */
  expires_at?: string
  /** 上次确认仍然正确的时刻；创建/更新时缺省由提交时刻补齐。 */
  last_verified?: string
  /** merge 专用：要并入 target 的知识 id（1..10）。 */
  merged_ids?: string[]
}

export interface MaintenanceArgs {
  admin: boolean
  coreId: string | null
  apply?: 'report' | 'propose'
  maxProposals?: number
  stalePendingDays?: number
  staleCitationDays?: number
  now?: Date
}

export interface MaintenanceResult {
  apply: 'report' | 'propose'
  coreId: string | null
  root: string
  readOnly: boolean
  reportPath: string | null
  latestPath: string | null
  generatedAt: string
  totals: MaintenanceAnalysis['totals']
  workspaceStats: MaintenanceWorkspaceStat[]
  issues: MaintenanceIssue[]
  created: Array<{
    id: string
    operation: string
    type: string
    scope: string
    title: string
    target: string | null
  }>
  skipped: number
  truncated: number
  errors: string[]
}

interface RuntimeOptions {
  ctx: Context
  hub: Hub
  store: KnowledgeStore
  ledger: Ledger
  ledgerState: LedgerState
  workspaces?: WorkspaceConfig[]
  /** 本 pack 对应的核心 id（fallback 为 null）。 */
  coreId?: string | null
  /** 回顾式萃取的会话来源；宿主没有 sessionQuery 时传 Null 或省略。 */
  reflectSource?: SessionDigestSource
  /** 已回顾水位（`records/reflect-state.json`）。 */
  reflectState?: ReflectStateFile
}

/** 上级核心 pack 的读写接口（跨 Hub 金字塔分级蒸馏用）。 */
export interface ParentPack {
  coreId: string
  store: KnowledgeStore
  ledger: Ledger
  hub: Hub
}

export class MemoryService {
  private readonly ctx: Context
  private readonly hub: Hub
  private readonly store: KnowledgeStore
  private readonly ledger: Ledger
  private customWorkspaces: WorkspaceConfig[] | undefined
  private readonly coreId: string | null
  /** 金字塔上级链：按 近→远 排列的祖先核心 pack（父、祖父、…）。 */
  private parents: ParentPack[] = []
  private readonly sessions = new Map<string, SessionState>()
  private readonly tasks: Map<string, TaskRecord>
  private readonly citationKeys = new Set<string>()
  private readonly citations: CitationRecord[]
  private readonly reflectSource: SessionDigestSource | null
  private readonly reflectState: ReflectStateFile | null
  /** 腾讯桥（lazy：仅 tencent.enabled 时创建）。 */
  private tencentBridge: TencentSync | null = null
  /** 多厂商 provider 注册表（lazy；关闭时为零网络、零 adapter）。 */
  private remoteRegistry: RemoteRegistry | null = null

  constructor(options: RuntimeOptions) {
    this.ctx = options.ctx
    this.hub = options.hub
    this.store = options.store
    this.ledger = options.ledger
    this.customWorkspaces = options.workspaces
    this.coreId = options.coreId ?? null
    this.reflectSource = options.reflectSource ?? null
    this.reflectState = options.reflectState ?? null
    this.tasks = options.ledgerState.tasks
    this.citations = options.ledgerState.citations
    for (const citation of this.citations) {
      this.citationKeys.add(citationKey(citation.taskId, citation.knowledgeId, citation.version))
    }
  }

  /** 最近的父核心 pack（金字塔第一级）。 */
  get parent(): ParentPack | null {
    return this.parents[0] ?? null
  }

  /** 最近的父核心 id。 */
  get parentCoreId(): string | null {
    return this.parents[0]?.coreId ?? null
  }

  /** 全部祖先核心 id，按 近→远 排列。 */
  get parentCoreIds(): string[] {
    return this.parents
      .map((parent) => parent.coreId)
      .filter((id): id is string => id !== null)
  }

  /** 挂接单个父核心 pack（向后兼容；等价于 setParents([parent])）。 */
  setParent(parent: ParentPack | null): void {
    this.parents = parent === null ? [] : [parent]
  }

  /** 挂接金字塔上级链：parents 按 近→远 排列（父、祖父、…）。由 runtime 在所有核心打开后调用。 */
  setParents(parents: ParentPack[]): void {
    this.parents = parents
  }

  /** 配置热更新：由 runtime 刷新工作区清单（新增/移除 core 与子工作区）。 */
  updateWorkspaces(workspaces: WorkspaceConfig[]): void {
    this.customWorkspaces = workspaces
  }

  get activeWorkspaces(): WorkspaceConfig[] {
    return this.customWorkspaces ?? this.hub.config.workspaces
  }

  packFor(sessionId: string): string {
    return this.sessions.get(sessionId)?.pack ?? ''
  }

  stateFor(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId)
  }

  async resolveWorkspace(agent: AgentLike): Promise<WorkspaceMatch> {
    let directory = ''
    const workingDirectory = this.ctx.get('workingDirectory') as WorkingDirectoryService | undefined
    try {
      directory = workingDirectory?.get(agent.session) ?? ''
    } catch {
      directory = ''
    }
    if (directory === '') directory = workingDirectory?.defaultDirectory ?? ''

    let resolved = directory
    try {
      resolved = await realpath(directory)
    } catch {
      // Missing or inaccessible directories still map by their configured spelling.
    }
    const compared = normalizeForCompare(resolved)

    let match: WorkspaceMatch = {
      id: null,
      root: null,
      domains: [],
      admin: false,
      path: resolved,
      registered: false,
      coreId: null,
      parentCoreId: null,
      parentCoreIds: [],
    }
    let bestLength = -1
    for (const workspace of this.activeWorkspaces) {
      if (!workspace.enabled) continue
      let root = workspace.root
      try {
        root = await realpath(workspace.root)
      } catch {
        // keep configured root
      }
      const rootCompared = normalizeForCompare(root)
      if (!containsPath(rootCompared, compared)) continue
      if (rootCompared.length > bestLength) {
        bestLength = rootCompared.length
        const coreId = workspace.core_id ?? workspace.id
        match = {
          id: workspace.id,
          root,
          domains: workspace.domains,
          admin: workspace.admin,
          path: resolved,
          registered: true,
          coreId,
          parentCoreId: workspace.id === this.coreId ? this.parentCoreId : null,
          parentCoreIds: workspace.id === this.coreId ? this.parentCoreIds : [],
        }
      }
    }
    return match
  }

  private matchWorkspaceSync(agent: AgentLike): WorkspaceMatch {
    let directory = ''
    const workingDirectory = this.ctx.get('workingDirectory') as WorkingDirectoryService | undefined
    try {
      directory = workingDirectory?.get(agent.session) ?? ''
    } catch {
      directory = ''
    }
    if (directory === '') directory = workingDirectory?.defaultDirectory ?? ''
    const compared = normalizeForCompare(directory)

    let match: WorkspaceMatch = {
      id: null,
      root: null,
      domains: [],
      admin: false,
      path: directory,
      registered: false,
      coreId: null,
      parentCoreId: null,
      parentCoreIds: [],
    }
    let bestLength = -1
    for (const workspace of this.activeWorkspaces) {
      if (!workspace.enabled) continue
      const rootCompared = normalizeForCompare(workspace.root)
      if (!containsPath(rootCompared, compared)) continue
      if (rootCompared.length > bestLength) {
        bestLength = rootCompared.length
        match = {
          id: workspace.id,
          root: workspace.root,
          domains: workspace.domains,
          admin: workspace.admin,
          path: directory,
          registered: true,
          coreId: workspace.core_id ?? workspace.id,
          parentCoreId: workspace.id === this.coreId ? this.parentCoreId : null,
          parentCoreIds: workspace.id === this.coreId ? this.parentCoreIds : [],
        }
      }
    }
    return match
  }

  visibilityFor(workspace: WorkspaceMatch): Visibility {
    const coreIds = [workspace.coreId, ...(workspace.parentCoreIds ?? [])].filter((id): id is string => id !== null)
    return visibilityFor(workspace.id, workspace.domains, coreIds)
  }

  async preflightForTurn(agent: AgentLike, turn: number, intent: string): Promise<void> {
    if (this.hub.config.policy.preflight.mode === 'off') return
    if (intent.trim() === '') return

    const existing = this.sessions.get(agent.id)
    if (existing !== undefined && existing.turn === turn && !existing.closed) return

    await this.beforeNewTask(agent.id, existing)

    const workspace = await this.resolveWorkspace(agent)
    const visibility = this.visibilityFor(workspace)
    const taskId = this.findLedgerTask(agent.id, turn)?.taskId ?? newTaskId()
    const now = nowIso()

    const record: TaskRecord = {
      taskId,
      sessionId: agent.id,
      turn,
      workspaceId: workspace.id,
      intentHash: hashIntent(intent),
      createdAt: now,
      preflight: null,
      assessment: null,
      closedAt: null,
    }
    this.tasks.set(taskId, record)

    const state: SessionState = {
      turn,
      taskId,
      workspace,
      visibility,
      pack: '',
      status: 'unavailable',
      hits: [],
      closed: false,
    }
    this.sessions.set(agent.id, state)

    try {
      await this.ledger.append({
        type: 'task.created',
        taskId,
        sessionId: agent.id,
        turn,
        workspaceId: workspace.id,
        intentHash: record.intentHash,
        idempotencyKey: `${agent.id}:${turn}`,
      })

      const preflight = await this.runSearch(intent, workspace, visibility)
      const remote = await this.remoteHybridContributions(intent)
      const { pack, tokens } = this.buildPack(preflight, workspace, this.hub.config.policy.preflight.pack_tokens, remote)
      const status: PreflightStatus = preflight.length === 0 ? 'no_match' : 'ready'
      const preflightId = newPreflightId()
      await this.ledger.append({
        type: 'preflight.recorded',
        taskId,
        preflightId,
        status,
        hits: preflight.map((hit) => ({ id: hit.id, version: hit.version })),
        tokens,
        ...(remote.length === 0
          ? {}
          : {
              remote: remote.map((entry) => ({
                provider: entry.provider,
                hits: entry.hits,
                ok: entry.ok,
                ...(entry.error === undefined ? {} : { error: entry.error }),
              })),
            }),
      })
      state.pack = this.hub.config.policy.preflight.inject === 'off' ? '' : pack
      state.status = status
      state.hits = preflight.map((hit) => ({ id: hit.id, version: hit.version }))
      record.preflight = {
        id: preflightId,
        taskId,
        sessionId: agent.id,
        turn,
        workspaceId: workspace.id,
        status,
        hits: state.hits,
        tokens,
        createdAt: nowIso(),
      }
    } catch (error) {
      state.status = 'unavailable'
      state.pack = ''
      this.ctx.logger.warn(`dsh-memory-hub: preflight failed for ${agent.id}: ${(error as Error).message}`)
      await this.ledger
        .append({
          type: 'preflight.recorded',
          taskId,
          preflightId: newPreflightId(),
          status: 'unavailable',
          hits: [],
          tokens: 0,
          error: (error as Error).message,
        })
        .catch(() => {})
    }
  }

  async manualPreflight(agent: AgentLike, intent: string, force: boolean): Promise<PreflightResult> {
    const state = this.sessions.get(agent.id)
    if (state === undefined) {
      const text = intent.trim()
      if (text === '') throw new MemoryError('INVALID_INPUT', 'intent must not be empty')
      const workspace = await this.resolveWorkspace(agent)
      const visibility = this.visibilityFor(workspace)
      const taskId = newTaskId()
      const nextState: SessionState = {
        turn: 0,
        taskId,
        workspace,
        visibility,
        pack: '',
        status: 'unavailable',
        hits: [],
        closed: false,
      }
      this.sessions.set(agent.id, nextState)
      const task: TaskRecord = {
        taskId,
        sessionId: agent.id,
        turn: 0,
        workspaceId: workspace.id,
        intentHash: hashIntent(text),
        createdAt: nowIso(),
        preflight: null,
        assessment: null,
        closedAt: null,
      }
      this.tasks.set(taskId, task)
      try {
        await this.ledger.append({
          type: 'task.created',
          taskId,
          sessionId: agent.id,
          turn: 0,
          workspaceId: workspace.id,
          intentHash: task.intentHash,
          idempotencyKey: `${agent.id}:manual`,
        })
        const hits = await this.runSearch(text, workspace, visibility)
        const remote = await this.remoteHybridContributions(text)
        const { pack, tokens } = this.buildPack(hits, workspace, this.hub.config.policy.preflight.pack_tokens, remote)
        const status: PreflightStatus = hits.length === 0 ? 'no_match' : 'ready'
        const preflightId = newPreflightId()
        await this.ledger.append({
          type: 'preflight.recorded',
          taskId,
          preflightId,
          status,
          hits: hits.map((hit) => ({ id: hit.id, version: hit.version })),
          tokens,
          ...(remote.length === 0
            ? {}
            : {
                remote: remote.map((entry) => ({
                  provider: entry.provider,
                  hits: entry.hits,
                  ok: entry.ok,
                  ...(entry.error === undefined ? {} : { error: entry.error }),
                })),
              }),
        })
        nextState.status = status
        nextState.hits = hits.map((hit) => ({ id: hit.id, version: hit.version }))
        nextState.pack = this.hub.config.policy.preflight.inject === 'off' ? '' : pack
        task.preflight = {
          id: preflightId,
          taskId,
          sessionId: agent.id,
          turn: 0,
          workspaceId: workspace.id,
          status,
          hits: nextState.hits,
          tokens,
          createdAt: nowIso(),
        }
        return { taskId, status, hits: nextState.hits, pack: nextState.pack, tokens }
      } catch (error) {
        this.ctx.logger.warn(`dsh-memory-hub: manual preflight failed: ${(error as Error).message}`)
        return { taskId, status: 'unavailable', hits: [], pack: '', tokens: 0 }
      }
    }

    if (!force && state.status !== 'unavailable') {
      return {
        taskId: state.taskId,
        status: state.status,
        hits: state.hits,
        pack: state.pack,
        tokens: estimateTokens(this.ctx, state.pack),
      }
    }

    const preflight = await this.runSearch(intent, state.workspace, state.visibility)
    const remote = await this.remoteHybridContributions(intent)
    const { pack, tokens } = this.buildPack(preflight, state.workspace, this.hub.config.policy.preflight.pack_tokens, remote)
    const status: PreflightStatus = preflight.length === 0 ? 'no_match' : 'ready'
    const preflightId = newPreflightId()
    await this.ledger.append({
      type: 'preflight.recorded',
      taskId: state.taskId,
      preflightId,
      status,
      hits: preflight.map((hit) => ({ id: hit.id, version: hit.version })),
      tokens,
      ...(remote.length === 0
        ? {}
        : {
            remote: remote.map((entry) => ({
              provider: entry.provider,
              hits: entry.hits,
              ok: entry.ok,
              ...(entry.error === undefined ? {} : { error: entry.error }),
            })),
          }),
    })
    state.pack = this.hub.config.policy.preflight.inject === 'off' ? '' : pack
    state.status = status
    state.hits = preflight.map((hit) => ({ id: hit.id, version: hit.version }))
    const task = this.tasks.get(state.taskId)
    if (task !== undefined) {
      task.preflight = {
        id: preflightId,
        taskId: state.taskId,
        sessionId: agent.id,
        turn: task.turn,
        workspaceId: state.workspace.id,
        status,
        hits: state.hits,
        tokens,
        createdAt: nowIso(),
      }
    }
    return {
      taskId: state.taskId,
      status,
      hits: state.hits,
      pack: state.pack,
      tokens,
    }
  }

  async search(agent: AgentLike, args: SearchArgs): Promise<{ hits: KnowledgeHit[]; total: number }> {
    const workspace = await this.resolveWorkspace(agent)
    const visibility = this.visibilityFor(workspace)
    const statuses = new Set<KnowledgeStatus>(args.statuses ?? ['accepted'])
    const types = args.types === undefined ? undefined : new Set<KnowledgeType>(args.types)
    let scopeFilter: string | null = null
    if (args.scope !== undefined) {
      const scope = parseScope(args.scope)
      if (!isScopeVisible(scope, visibility)) {
        throw new MemoryError('SCOPE_FORBIDDEN', `scope ${args.scope} is not visible from this workspace`)
      }
      scopeFilter = formatScope(scope)
    }
    const limit = Math.max(1, Math.min(20, args.limit ?? 8))
    // 显式作用域：不做回退。祖先作用域只查对应祖先层；其余（project:<self>、
    // 普通工作区作用域、global/domain）只在自己的 Hub 里找。
    if (scopeFilter !== null) {
      const ancestorScope = this.parents.find(
        (candidate) => candidate.coreId !== null && `project:${candidate.coreId}` === scopeFilter,
      )
      if (ancestorScope !== undefined) {
        const hits = this.ancestorLevelSearch(args.query, ancestorScope, { statuses, types, limit, scopeFilter })
        return { hits, total: hits.length }
      }
      const raw = this.store.search(args.query, {
        visibility,
        statuses,
        types,
        limit: 20,
        temporal: this.hub.config.policy.temporal,
      })
      const hits = raw
        .filter((hit) => formatScope(hit.scope) === scopeFilter)
        .slice(0, limit)
        .map((hit) => ({ ...hit, path: KnowledgeStore.relativePath(this.hub.root, hit.path) }))
      return { hits, total: hits.length }
    }
    // 无过滤：金字塔回退检索 —— 当前工作区（自己的 Hub）优先，本层没有任何
    // 合格命中时，才按 近→远 逐层回退到父、祖父…核心的 project:<祖先> 蒸馏知识。
    const hits = this.cascadeSearch(args.query, {
      statuses,
      types,
      limit,
      visibility,
      preferProject: workspace.id ?? undefined,
    })
    return {
      hits,
      total: hits.length,
    }
  }

  /**
   * 近重复检测（只读）。只在当前可见范围、同类型同作用域之间比较；
   * 不跨 Hub（跨核心的近似标题应走蒸馏而不是合并）。
   */
  async duplicates(agent: AgentLike, args: { scope?: string; threshold?: number; limit?: number }): Promise<{
    total: number
    threshold: number
    pairs: Array<{
      keeper: { id: string; version: number; title: string; summary: string }
      other: { id: string; version: number; title: string; summary: string }
      similarity: number
      titleSimilarity: number
      highConfidence: boolean
    }>
  }> {
    const workspace = await this.resolveWorkspace(agent)
    const visibility = this.visibilityFor(workspace)
    let scopeFilter: string | null = null
    if (args.scope !== undefined) {
      const scope = parseScope(args.scope)
      if (!isScopeVisible(scope, visibility)) {
        throw new MemoryError('SCOPE_FORBIDDEN', `scope ${args.scope} is not visible from this workspace`)
      }
      scopeFilter = formatScope(scope)
    }
    const threshold = args.threshold ?? this.hub.config.policy.dedupe.threshold
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
      throw new MemoryError('INVALID_INPUT', 'threshold must be within (0, 1]')
    }
    const limit = Math.max(1, Math.min(50, args.limit ?? 10))
    const records = [...this.store.docs.values()].filter((record) => {
      if (record.status !== 'accepted') return false
      if (!isScopeVisible(record.scope, visibility)) return false
      if (scopeFilter !== null && formatScope(record.scope) !== scopeFilter) return false
      return true
    })
    const pairs = findNearDuplicates({ records, threshold, maxPairs: limit })
    return {
      total: pairs.length,
      threshold,
      pairs: pairs.map((pair) => {
        const keeper = this.store.docs.get(pair.keeperId)!
        const other = this.store.docs.get(pair.otherId)!
        return {
          keeper: { id: keeper.id, version: keeper.version, title: keeper.title, summary: keeper.summary },
          other: { id: other.id, version: other.version, title: other.title, summary: other.summary },
          similarity: pair.similarity,
          titleSimilarity: pair.titleSimilarity,
          highConfidence: pair.highConfidence,
        }
      }),
    }
  }

  /** 面板只读视图：被合并条目的摘要 + target 旧正文到合并稿的行级 diff。 */
  private mergePreview(proposal: ProposalRecord): {
    merged: Array<{ id: string; title: string; summary: string }>
    diff: Array<{ kind: 'context' | 'add' | 'del'; text: string }>
    truncated: boolean
  } {
    const merged = proposal.mergedIds.map((id) => {
      const record = this.store.docs.get(id)
      return record === undefined
        ? { id, title: '(not found)', summary: '' }
        : { id, title: record.title, summary: record.summary }
    })
    const target = proposal.target === null ? undefined : this.store.docs.get(proposal.target)
    const diff = lineDiff(target?.body ?? '', proposal.body, PANEL_DIFF_LINES)
    return { merged, diff: diff.lines, truncated: diff.truncated }
  }

  /**
   * 回顾式萃取：把本工作区名下已结束会话压成 digest，供模型据此 `memory_propose`。
   * 只读会话与账本/水位；不写任何知识文件，也不调用模型。
   */
  async reflect(agent: AgentLike, args: {
    mode?: 'digest' | 'search'
    session_id?: string
    limit?: number
    dry_run?: boolean
    query?: string
  }): Promise<{
    available: boolean
    workspaceId: string
    mode: 'digest' | 'search'
    reason?: string
    sessions: Array<{
      sessionId: string
      cwd: string
      createdAt: string
      chars: number
      truncated: boolean
      digest: string
      digestHash: string
      seqRange: { from: number; to: number } | null
    }>
    hits?: Array<{
      sessionId: string
      cwd: string
      seq: number
      type: string
      time: string | null
      surface: string | null
      snippet: string
    }>
    hitsTruncated?: boolean
    skipped: Array<{ sessionId: string; reason: string }>
    dryRun: boolean
  }> {
    const workspace = await this.resolveWorkspace(agent)
    const dryRun = args.dry_run === true
    const mode: 'digest' | 'search' = args.mode === 'search' ? 'search' : 'digest'
    const workspaceId = workspace.id
    if (workspaceId === null) {
      throw new MemoryError('INVALID_STATE', 'workspace is not registered in config.yaml; add it before reflecting sessions')
    }
    if (this.reflectSource === null || !this.reflectSource.available) {
      return {
        available: false,
        workspaceId,
        mode,
        reason: 'sessionQuery service unavailable on this host',
        sessions: [],
        skipped: [],
        dryRun,
      }
    }
    const policy = this.hub.config.policy.reflect
    const reflect = this.reflectConfigFor(workspaceId)
    const lookbackDays = reflect.lookback_days
    const limit = Math.max(1, Math.min(3, args.limit ?? policy.max_sessions))
    const roots = reflectRoots(this.hub.config)
    const cutoff = Date.now() - lookbackDays * 86_400_000
    // 水位文件是派生物：每次读取前刷新一遍，避免多进程/手工删除后仍按旧状态去重。
    if (this.reflectState !== null) await this.reflectState.load()

    let records: ReflectSessionRecord[]
    try {
      records = await this.reflectSource.listSessions()
    } catch (error) {
      return {
        available: false,
        workspaceId,
        mode,
        reason: `sessionQuery listSessions failed: ${(error as Error).message}`,
        sessions: [],
        skipped: [],
        dryRun,
      }
    }

    const owned = records
      .filter((record) => {
        const header = record.header
        if (header === undefined || typeof header.id !== 'string') return false
        if (header.origin === 'subagent' || (header.delegationDepth ?? 0) > 0) return false
        if (typeof header.parentSession === 'string' && header.parentSession !== '') return false
        const owner = ownerWorkspaceOf(header.cwd, roots)
        if (owner === null || owner.workspaceId !== workspace.id) return false
        if (typeof header.createdAt === 'number' && header.createdAt < cutoff) return false
        return true
      })
      .sort((left, right) => (right.header.createdAt ?? 0) - (left.header.createdAt ?? 0))

    const skipped: Array<{ sessionId: string; reason: string }> = []

    // 原文取证：不压缩、不写水位，只把宿主全文检索命中的原始事件序号与片段交回模型。
    if (mode === 'search') {
      const query = (args.query ?? '').trim()
      if (query === '') {
        throw new MemoryError('INVALID_INPUT', 'mode "search" requires a non-empty query')
      }
      if (typeof this.reflectSource.searchEvents !== 'function') {
        return {
          available: false,
          workspaceId,
          mode,
          reason: 'sessionQuery.searchEvents unavailable on this host',
          sessions: [],
          skipped: [],
          dryRun,
        }
      }
      const limit = Math.max(1, Math.min(50, Math.trunc(args.limit ?? 20)))
      let targets = owned.slice(0, 3)
      if (args.session_id !== undefined && args.session_id !== '') {
        const requested = owned.find((record) => record.header.id === args.session_id)
        if (requested === undefined) {
          throw new MemoryError(
            'INVALID_INPUT',
            `session ${args.session_id} is not an ended session owned by workspace ${workspace.id}`,
          )
        }
        targets = [requested]
      }
      const hits: Array<{
        sessionId: string
        cwd: string
        seq: number
        type: string
        time: string | null
        surface: string | null
        snippet: string
      }> = []
      for (const record of targets) {
        const sessionId = record.header.id
        const cwd = typeof record.header.cwd === 'string' ? record.header.cwd : ''
        try {
          const page = await this.reflectSource.searchEvents({ sessionId, query, limit })
          for (const item of page.items) {
            hits.push({
              sessionId,
              cwd,
              seq: item.seq,
              type: item.type,
              time: typeof item.time === 'number' ? new Date(item.time).toISOString() : null,
              surface: typeof item.surface === 'string' ? item.surface : null,
              snippet: item.snippet,
            })
          }
        } catch (error) {
          skipped.push({ sessionId, reason: `search-failed: ${(error as Error).message}` })
        }
      }
      const seen = new Set<string>()
      const unique = hits.filter((hit) => {
        const key = `${hit.sessionId}:${hit.seq}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      const capped = unique.slice(0, limit)
      return {
        available: true,
        workspaceId,
        mode,
        sessions: [],
        hits: capped,
        hitsTruncated: unique.length > capped.length,
        skipped,
        dryRun: true,
      }
    }

    let selected = owned
    if (args.session_id !== undefined && args.session_id !== '') {
      const requested = owned.find((record) => record.header.id === args.session_id)
      if (requested === undefined) {
        throw new MemoryError(
          'INVALID_INPUT',
          `session ${args.session_id} is not an ended session owned by workspace ${workspace.id}`,
        )
      }
      selected = [requested]
    }
    selected = selected.slice(0, args.session_id === undefined ? limit : 1)

    const sessions: Array<{
      sessionId: string
      cwd: string
      createdAt: string
      chars: number
      truncated: boolean
      digest: string
      digestHash: string
      seqRange: { from: number; to: number } | null
    }> = []

    for (const record of selected) {
      const sessionId = record.header.id
      const prior = this.reflectState?.find(sessionId)
      let snapshot
      try {
        snapshot = await this.reflectSource.readSession(sessionId)
      } catch (error) {
        skipped.push({ sessionId, reason: `read-failed: ${(error as Error).message}` })
        continue
      }
      const result = buildDigest(snapshot, {
        workspaceId,
        maxChars: policy.max_chars,
        minMessages: policy.min_messages,
      })
      if (result.status === 'too-short') {
        skipped.push({ sessionId, reason: `too-short (${result.messages} messages)` })
        continue
      }
      if (result.status === 'empty') {
        skipped.push({ sessionId, reason: 'empty' })
        continue
      }
      const digest = result.digest
      const hash = digestHash(digest)
      if (prior !== undefined && prior.digestHash === hash) {
        skipped.push({ sessionId, reason: 'already-reflected' })
        continue
      }
      const seqs = snapshot.events
        .map((event) => event.seq)
        .filter((seq): seq is number => typeof seq === 'number')
      const seqRange = seqs.length === 0 ? null : { from: Math.min(...seqs), to: Math.max(...seqs) }
      if (!dryRun) {
        await this.reflectState?.mark({
          sessionId,
          workspaceId,
          reflectedAt: nowIso(),
          digestHash: hash,
          proposals: [],
        })
        await this.ledger.append({
          type: 'reflect.read',
          sessionId,
          workspaceId,
          events: snapshot.events.length,
          chars: digest.chars,
          proposals: 0,
        })
      }
      sessions.push({
        sessionId,
        cwd: digest.cwd,
        createdAt: digest.createdAt,
        chars: digest.chars,
        truncated: digest.truncated,
        digest: renderDigest(digest),
        digestHash: hash,
        seqRange,
      })
    }

    return { available: true, workspaceId, mode, sessions, skipped, dryRun }
  }

  private reflectConfigFor(workspaceId: string) {
    const core = this.hub.config.core_workspaces.find((entry) => entry.id === workspaceId)
    const workspace = this.activeWorkspaces.find((entry) => entry.id === workspaceId)
    return core?.reflect ?? workspace?.reflect ?? {
      enabled: false,
      time: '04:30',
      target: 'new' as const,
      max_candidates: 5,
      lookback_days: 30,
    }
  }

  /**
   * 金字塔回退检索：本层（自己的 Hub）有 ≥1 个合格命中即返回、不再上溯；
   * 本层为空才回退到最近的祖先层，依次类推。每层命中都带 core 标注。
   */
  private cascadeSearch(
    query: string,
    options: {
      statuses: ReadonlySet<KnowledgeStatus>
      types?: ReadonlySet<KnowledgeType>
      limit: number
      minScore?: number
      visibility: Visibility
      preferProject?: string
      localBoost?: number
      /** 预检为 true：尚未生效（scheduled）的条目不进入上下文。 */
      excludeScheduled?: boolean
    },
  ): KnowledgeHit[] {
    const own = this.store.search(query, {
      visibility: options.visibility,
      statuses: options.statuses,
      ...(options.types === undefined ? {} : { types: options.types }),
      limit: Math.max(1, options.limit),
      ...(options.minScore === undefined ? {} : { minScore: options.minScore }),
      ...(options.preferProject === undefined ? {} : { preferProject: options.preferProject }),
      ...(options.localBoost === undefined ? {} : { localBoost: options.localBoost }),
      temporal: this.hub.config.policy.temporal,
      ...(options.excludeScheduled === true ? { excludeTemporal: SCHEDULED_STATES } : {}),
    })
    if (own.length > 0) return own.slice(0, options.limit)
    for (const parent of this.parents) {
      const levelHits = this.ancestorLevelSearch(query, parent, {
        statuses: options.statuses,
        types: options.types,
        limit: options.limit,
        minScore: options.minScore,
        scopeFilter: null,
        excludeScheduled: options.excludeScheduled,
      })
      if (levelHits.length > 0) return levelHits
    }
    return []
  }

  /**
   * 在单个祖先核心 Hub 上检索其 project:<祖先核心> 蒸馏条目（只取该层作用域，
   * 避免 global 在跨 Hub 检索里重复）。
   */
  private ancestorLevelSearch(
    query: string,
    parent: ParentPack,
    options: {
      statuses: ReadonlySet<KnowledgeStatus>
      types?: ReadonlySet<KnowledgeType>
      limit: number
      minScore?: number
      scopeFilter?: string | null
      excludeScheduled?: boolean
    },
  ): KnowledgeHit[] {
    const coreId = parent.coreId
    if (coreId === null) return []
    const raw = parent.store.search(query, {
      visibility: { global: false, domains: new Set(), projects: new Set([coreId]) },
      statuses: options.statuses,
      ...(options.types === undefined ? {} : { types: options.types }),
      limit: Math.max(1, options.limit),
      ...(options.minScore === undefined ? {} : { minScore: options.minScore }),
      coreTag: coreId,
      temporal: parent.hub.config.policy.temporal,
      ...(options.excludeScheduled === true ? { excludeTemporal: SCHEDULED_STATES } : {}),
    })
    return raw
      .filter(
        (hit) =>
          hit.scope.level === 'project' &&
          hit.scope.workspaceId === coreId &&
          (options.scopeFilter === null ||
            options.scopeFilter === undefined ||
            formatScope(hit.scope) === options.scopeFilter),
      )
      .slice(0, options.limit)
      .map((hit) => ({ ...hit, path: KnowledgeStore.relativePath(parent.hub.root, hit.path) }))
  }

  async get(agent: AgentLike, id: string, version?: number, core?: string, options: ReadOptions = {}): Promise<{
    metadata: Omit<KnowledgeRecord, 'body' | 'path' | 'extra'> & { temporal: TemporalState; temporalNote?: string }
    body: string
    headings: string[]
    section: string | null
    truncated: boolean
    hint?: string
    path: string
    core: string | null
  }> {
    const workspace = await this.resolveWorkspace(agent)
    const visibility = this.visibilityFor(workspace)
    let resolved: { record: KnowledgeRecord; core: string | null; root: string; policy: TemporalPolicy } | null
    if (core !== undefined && core !== '') {
      const store = this.storeForCore(core)
      if (store === null) {
        throw new MemoryError('NOT_FOUND', `knowledge ${id} does not exist in core ${core}`)
      }
      const record = await store.store.get(id, version)
      resolved = record === null
        ? null
        : { record, core: store.coreId, root: store.hub.root, policy: store.hub.config.policy.temporal }
    } else {
      const own = await this.resolveRecordForRead(id, version)
      resolved = own === null
        ? null
        : { ...own, policy: this.hub.config.policy.temporal }
    }
    if (resolved === null) {
      throw new MemoryError('NOT_FOUND', `knowledge ${id}${version === undefined ? '' : `@${version}`} does not exist`)
    }
    const { record } = resolved
    if (!isScopeVisible(record.scope, visibility)) {
      throw new MemoryError('SCOPE_FORBIDDEN', `knowledge ${id} is not visible from this workspace`)
    }
    if (record.status === 'rejected') {
      throw new MemoryError('NOT_FOUND', `knowledge ${id} was rejected and is not readable through the API`)
    }
    const { body: fullBody, path, extra: _extra, ...metadata } = record
    void _extra
    const temporal = temporalState(record, Date.now(), resolved.policy)
    const temporalNote = temporalAnnotation(record, temporal, resolved.policy)
    // 默认只返回「结论 + 小节目录」的摘要，避免整篇正文反复进入上下文爆炸；
    // 需要证据/边界时用 section 读指定小节，确实需要全文才传 full。
    const headings = bodyHeadings(fullBody)
    const cap = Math.max(200, Math.min(20_000, options.max_chars ?? (options.section === undefined ? DIGEST_CHARS : SECTION_CHARS)))
    const trimmed = fullBody.trim()
    let body = trimmed
    let section: string | null = null
    let truncated = false
    let hint: string | undefined
    if (options.full !== true) {
      if (options.section !== undefined && options.section.trim() !== '') {
        const extracted = pickSection(fullBody, options.section)
        if (extracted === null) {
          throw new MemoryError(
            'INVALID_INPUT',
            `section "${options.section}" not found; available: ${headings.join(', ') || '(none)'}`,
          )
        }
        body = extracted
        section = options.section.trim()
      } else {
        body = pickDigest(fullBody, cap)
      }
      if (body.length > cap) {
        body = `${body.slice(0, cap)}…`
        truncated = true
      }
      if (body !== trimmed) {
        hint = `abridged; sections: ${headings.join(', ') || '(none)'}; read one with memory_get {id, section:"…"} or the whole body with {id, full:true}`
      }
    }
    return {
      metadata: {
        ...metadata,
        temporal,
        ...(temporalNote === null ? {} : { temporalNote }),
      },
      body,
      headings,
      section,
      truncated,
      ...(hint === undefined ? {} : { hint }),
      path: KnowledgeStore.relativePath(resolved.root, path),
      core: resolved.core,
    }
  }

  /** 在“自己的 Hub → 父核心 Hub”顺序里查找可读条目。 */
  private async resolveRecordForRead(
    id: string,
    version?: number,
  ): Promise<{ record: KnowledgeRecord; core: string | null; root: string } | null> {
    const primary = await this.store.get(id, version)
    if (primary !== null) return { record: primary, core: this.coreId, root: this.hub.root }
    for (const parent of this.parents) {
      const fromParent = await parent.store.get(id, version)
      if (fromParent !== null) return { record: fromParent, core: parent.coreId, root: parent.hub.root }
    }
    return null
  }

  private storeForCore(core: string): { store: KnowledgeStore; hub: Hub; coreId: string | null } | null {
    if (this.coreId === core) return { store: this.store, hub: this.hub, coreId: this.coreId }
    for (const parent of this.parents) {
      if (parent.coreId === core) {
        return { store: parent.store, hub: parent.hub, coreId: parent.coreId }
      }
    }
    return null
  }

  async cite(agent: AgentLike, args: {
    knowledge_id: string
    version?: number
    purpose: string
    task_id?: string
    core?: string
  }): Promise<{ citationId: string }> {
    const state = this.sessions.get(agent.id)
    if (state === undefined) throw new MemoryError('NO_TASK', 'no open task for this session')
    if (args.task_id !== undefined && args.task_id !== state.taskId) {
      throw new MemoryError('INVALID_STATE', 'can only cite from the current task')
    }
    if (state.closed) throw new MemoryError('INVALID_STATE', 'task is already closed')
    const purpose = args.purpose.trim()
    if (purpose.length === 0 || purpose.length > 200) {
      throw new MemoryError('INVALID_INPUT', 'purpose must be 1..200 characters')
    }
    let resolved: { record: KnowledgeRecord; core: string | null; root: string } | null
    if (args.core !== undefined && args.core !== '') {
      const store = this.storeForCore(args.core)
      if (store === null) throw new MemoryError('NOT_FOUND', `knowledge ${args.knowledge_id} does not exist in core ${args.core}`)
      const record = await store.store.get(args.knowledge_id, args.version)
      resolved = record === null ? null : { record, core: store.coreId, root: store.hub.root }
    } else {
      resolved = await this.resolveRecordForRead(args.knowledge_id, args.version)
    }
    if (resolved === null) throw new MemoryError('NOT_FOUND', `knowledge ${args.knowledge_id} does not exist`)
    const { record } = resolved
    if (record.status !== 'accepted') {
      throw new MemoryError('INVALID_STATE', `knowledge ${record.id} is ${record.status}`)
    }
    if (!isScopeVisible(record.scope, state.visibility)) {
      throw new MemoryError('SCOPE_FORBIDDEN', `knowledge ${record.id} is not visible from this workspace`)
    }
    const key = citationKey(state.taskId, record.id, record.version)
    if (this.citationKeys.has(key)) {
      const existing = this.citations.find(
        (citation) =>
          citation.taskId === state.taskId &&
          citation.knowledgeId === record.id &&
          citation.version === record.version,
      )
      if (existing !== undefined) return { citationId: existing.id }
    }
    const citationId = newCitationId()
    await this.ledger.append({
      type: 'citation.added',
      taskId: state.taskId,
      citationId,
      knowledgeId: record.id,
      version: record.version,
      purpose,
      ...(resolved.core === this.coreId ? {} : { coreId: resolved.core }),
    })
    this.citationKeys.add(key)
    this.citations.push({
      id: citationId,
      taskId: state.taskId,
      knowledgeId: record.id,
      version: record.version,
      purpose,
      createdAt: nowIso(),
      coreId: resolved.core,
    })
    // 引用即议程（§5.9.2）：被引条目进萃取议程。agenda 是可从账本重建的派生信号，
    // 写失败只降级诊断，不影响 cite 本身。
    await this.appendAgenda(resolved.root, {
      knowledgeId: record.id,
      version: record.version,
      purpose,
      taskId: state.taskId,
      citationId,
      ...(resolved.core === null ? {} : { coreId: resolved.core }),
    })
    // trigger: 'cited'（§5.9.2）：条目首次达到 require_citations 门槛 → 触发一次 push。
    await this.maybeCitedPush(agent, record, resolved.core)
    return { citationId }
  }

  /* ---------------- 引用即议程 + cited 触发（§5.9.2，M5） ---------------- */

  private agendaPath(root: string): string {
    return join(root, 'records', 'agenda.jsonl')
  }

  /** 新增引用 → agenda.jsonl 追加一行。agenda 是萃取议程，不是知识；文件可删（账本可重建）。 */
  private async appendAgenda(root: string, entry: {
    knowledgeId: string
    version: number
    purpose: string
    taskId: string
    citationId: string
    coreId?: string
  }): Promise<void> {
    try {
      await mkdir(join(root, 'records'), { recursive: true })
      await appendFile(this.agendaPath(root), `${JSON.stringify({ ...entry, at: nowIso() })}\n`, 'utf8')
    } catch (error) {
      this.ctx.logger?.warn?.(`dsh-memory-hub: cannot append agenda: ${(error as Error).message}`)
    }
  }

  /**
   * 读议程：knowledgeId → 议程行数（≈ 引用次数的信号视图）。
   * 损坏行跳过；这是派生信号，宁缺勿炸。
   */
  private async readAgendaCounts(root: string): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    let raw: string
    try {
      raw = await readFile(this.agendaPath(root), 'utf8')
    } catch {
      return counts
    }
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      try {
        const parsed = JSON.parse(trimmed) as { knowledgeId?: unknown }
        if (typeof parsed.knowledgeId !== 'string' || parsed.knowledgeId === '') continue
        counts.set(parsed.knowledgeId, (counts.get(parsed.knowledgeId) ?? 0) + 1)
      } catch {
        continue
      }
    }
    return counts
  }

  /** 本 hub 的引用计数快照（coreId 归属过滤）：knowledgeId → citation.added 次数。 */
  private citationCountMap(): Map<string, number> {
    const counts = new Map<string, number>()
    for (const citation of this.citations) {
      if ((citation.coreId ?? null) !== (this.coreId ?? null)) continue
      counts.set(citation.knowledgeId, (counts.get(citation.knowledgeId) ?? 0) + 1)
    }
    return counts
  }

  /**
   * trigger: 'cited' 的触发器：本次 cite 让条目**恰好达到**某 provider 的
   * `require_citations` 门槛时，对该 provider 触发一次 push（门槛 = 0 不触发；
   * 推送是全量扫掠但引用门槛会挡住没人用的条目）。失败降级为诊断，绝不抛进 cite。
   */
  private async maybeCitedPush(agent: AgentLike, record: KnowledgeRecord, coreId: string | null): Promise<void> {
    if (coreId !== (this.coreId ?? null)) return // 只对本 hub 的知识触发
    const remote = this.hub.config.remote
    if (remote === undefined || remote.enabled !== true) return // 默认零网络：关着就完全无事发生
    const handles = this.resolveRemoteHandles(undefined, ['mirror'])
    if (handles.length === 0) return
    const counts = this.citationCountMap()
    const total = counts.get(record.id) ?? 0
    for (const handle of handles) {
      const mirror = handle.settings.mirror
      if (mirror.trigger !== 'cited' || mirror.require_citations < 1) continue
      if (total !== mirror.require_citations) continue // 恰好达到门槛才触发（首次达到）
      if (handle.adapter === null) continue
      try {
        const engine = this.buildEngine(agent, handle)
        const result = await engine.push()
        this.ctx.logger?.info(
          `dsh-memory-hub: cited-trigger push for ${handle.settings.id}: pushed=${result.pushed} gated=${result.gated ?? 0}`,
        )
      } catch (error) {
        // 触发失败不回滚引用：下次手动 sync 或下次达到门槛的条目会再推全量。
        this.ctx.logger?.warn(
          `dsh-memory-hub: cited-trigger push failed for ${handle.settings.id}: ${(error as Error).message}`,
        )
      }
    }
  }

  async propose(agent: AgentLike, args: ProposeArgs): Promise<{
    proposalId: string
    pendingPath: string
    core: string | null
    scope: string
    risk: ProposalRisk
  }> {
    const state = this.sessions.get(agent.id)
    if (state === undefined) throw new MemoryError('NO_TASK', 'no open task for this session')
    if (state.closed) throw new MemoryError('INVALID_STATE', 'task is already closed')
    const coreId = state.workspace.coreId
    const rawScope = args.scope === 'core'
      ? (coreId === null ? null : `project:${coreId}`)
      : args.scope === 'parent'
        ? (this.parentCoreId === null ? null : `project:${this.parentCoreId}`)
        : args.scope
    if (rawScope === null) {
      throw new MemoryError(
        'INVALID_INPUT',
        args.scope === 'parent'
          ? 'scope "parent" is only available inside a dual-role workspace with an open parent core'
          : 'scope "core" is only available inside a configured core workspace',
      )
    }
    const scope = parseScope(rawScope)
    if (!isScopeVisible(scope, state.visibility)) {
      throw new MemoryError('SCOPE_FORBIDDEN', `scope ${rawScope} is not visible from this workspace`)
    }
    // 金字塔蒸馏：L1 `project:<self>`/`core` 写自己的 Hub；L2 `project:<父核心>`（或别名 parent）
    // 写最近的父核心 Hub；再往上可用显式 `project:<任意祖先核心>` 逐层上推。
    let target: ParentPack | null = null
    if (scope.level === 'project') {
      target = this.parents.find((parent) => parent.coreId === scope.workspaceId) ?? null
    }
    const owningStore = target === null ? this.store : target.store
    const owningHub = target === null ? this.hub : target.hub
    const owningCoreId = target === null ? this.coreId : target.coreId
    const formattedScope = formatScope(scope)
    const pending = [
      ...this.store.pendingForTask(state.taskId),
      ...(target === null ? [] : target.store.pendingForTask(state.taskId)),
    ]
    if (pending.length >= this.hub.config.policy.limits.max_pending_per_task) {
      throw new MemoryError('INVALID_STATE', `task already has ${pending.length} pending proposals`)
    }
    // 风险标记只给人看：候选照常写入 pending/，模型不能据此自批或被静默拒绝。
    const risk = assessProposalRisk({
      title: args.title,
      summary: args.summary,
      ...(args.content === undefined ? {} : { content: args.content }),
      ...(args.source_refs === undefined ? {} : { sourceRefs: args.source_refs }),
    })
    const duplicate = pending.find(
      (proposal) =>
        proposal.operation === args.operation &&
        proposal.type === args.type &&
        formatScope(proposal.scope) === formattedScope &&
        proposal.title === args.title.trim() &&
        proposal.target === (args.target ?? null),
    )
    if (duplicate !== undefined) {
      return {
        proposalId: duplicate.id,
        pendingPath: KnowledgeStore.relativePath(owningHub.root, duplicate.path),
        core: owningCoreId,
        scope: formattedScope,
        risk,
      }
    }

    const proposal = await owningStore.propose(
      {
        operation: args.operation,
        type: args.type,
        scope: rawScope,
        title: args.title,
        summary: args.summary,
        ...(args.content === undefined ? {} : { content: args.content }),
        ...(args.source_refs === undefined ? {} : { sourceRefs: args.source_refs }),
        ...(args.tags === undefined ? {} : { tags: args.tags }),
        ...(args.related === undefined ? {} : { related: args.related }),
        ...(args.supersedes === undefined ? {} : { supersedes: args.supersedes }),
        ...(args.applies_to === undefined ? {} : { appliesTo: args.applies_to }),
        ...(args.target === undefined ? {} : { target: args.target }),
        ...(args.expected_version === undefined ? {} : { expectedVersion: args.expected_version }),
        ...(args.reason === undefined ? {} : { reason: args.reason }),
        ...(args.valid_from === undefined ? {} : { validFrom: args.valid_from }),
        ...(args.expires_at === undefined ? {} : { expiresAt: args.expires_at }),
        ...(args.last_verified === undefined ? {} : { lastVerified: args.last_verified }),
        ...(args.merged_ids === undefined ? {} : { mergedIds: args.merged_ids }),
      },
      { taskId: state.taskId },
    )
    await (target === null ? this.ledger : target.ledger).append({
      type: 'proposal.created',
      taskId: state.taskId,
      proposalId: proposal.id,
      ...(risk.level === 'none'
        ? {}
        : { riskLevel: risk.level, riskSignals: risk.signals.map((signal) => signal.code) }),
    })
    return {
      proposalId: proposal.id,
      pendingPath: KnowledgeStore.relativePath(owningHub.root, proposal.path),
      core: owningCoreId,
      scope: formattedScope,
      risk,
    }
  }

  async commit(agent: AgentLike, proposalId: string, core?: string): Promise<{
    knowledgeId: string
    version: number
    status: KnowledgeStatus
    superseded: string[]
  }> {
    let proposal: ProposalRecord | null
    let owning: KnowledgeStore
    if (core !== undefined && core !== '') {
      const target = this.storeForCore(core)
      if (target === null) throw new MemoryError('NOT_FOUND', `core ${core} is not reachable from this workspace`)
      proposal = target.store.getProposal(proposalId)
      owning = target.store
    } else {
      proposal = this.resolveProposalAcrossStores(proposalId)
      owning = this.owningStoreFor(proposalId) ?? this.store
    }
    if (proposal === null) throw new MemoryError('NOT_FOUND', `proposal ${proposalId} does not exist`)
    const workspace = await this.resolveWorkspace(agent)
    const visibility = this.visibilityFor(workspace)
    if (!isScopeVisible(proposal.scope, visibility) && !workspace.admin) {
      throw new MemoryError('SCOPE_FORBIDDEN', `proposal ${proposalId} targets a scope not visible from this workspace`)
    }
    const precheck = this.precheckCommitOn(owning, proposal)
    if (!precheck.ok) throw new MemoryError(precheck.code, precheck.reason)
    const result = await owning.commit(
      proposalId,
      this.approvalMode() === 'auto' ? 'test:auto' : 'dsh:approval',
    )
    return {
      knowledgeId: result.record.id,
      version: result.record.version,
      status: result.record.status,
      superseded: result.superseded,
    }
  }

  /** 面板人工审核：批准候选。账本 approvalRef 记为 panel:human，面板请求本身即人工点击。 */
  async approveProposal(proposalId: string): Promise<{
    knowledgeId: string
    version: number
    status: KnowledgeStatus
    superseded: string[]
  }> {
    const owning = this.owningStoreFor(proposalId)
    if (owning === null) throw new MemoryError('NOT_FOUND', `proposal ${proposalId} does not exist`)
    const proposal = owning.getProposal(proposalId)
    if (proposal === null) throw new MemoryError('NOT_FOUND', `proposal ${proposalId} does not exist`)
    const precheck = this.precheckCommitOn(owning, proposal)
    if (!precheck.ok) throw new MemoryError(precheck.code, precheck.reason)
    const result = await owning.commit(proposalId, 'panel:human')
    return {
      knowledgeId: result.record.id,
      version: result.record.version,
      status: result.record.status,
      superseded: result.superseded,
    }
  }

  /** 面板人工审核：拒绝候选。 */
  async rejectProposal(proposalId: string, reason?: string): Promise<{ proposalId: string; status: 'rejected' }> {
    const owning = this.owningStoreFor(proposalId)
    if (owning === null) throw new MemoryError('NOT_FOUND', `proposal ${proposalId} does not exist`)
    return owning.reject(proposalId, reason)
  }

  /** 在“自己的 Hub → 父核心 Hub”顺序里查找 proposal（跨 Hub 分级蒸馏）。 */
  private resolveProposalAcrossStores(proposalId: string): ProposalRecord | null {
    const own = this.store.getProposal(proposalId)
    if (own !== null) return own
    for (const parent of this.parents) {
      const found = parent.store.getProposal(proposalId)
      if (found !== null) return found
    }
    return null
  }

  private owningStoreFor(proposalId: string): KnowledgeStore | null {
    if (this.store.getProposal(proposalId) !== null) return this.store
    for (const parent of this.parents) {
      if (parent.store.getProposal(proposalId) !== null) return parent.store
    }
    return null
  }

  precheckCommit(proposal: ProposalRecord): { ok: true } | { ok: false; code: 'INVALID_STATE' | 'INVALID_INPUT' | 'VERSION_CONFLICT' | 'NOT_FOUND' | 'SCOPE_FORBIDDEN'; reason: string } {
    return this.precheckCommitOn(this.owningStoreFor(proposal.id) ?? this.store, proposal)
  }

  private precheckCommitOn(store: KnowledgeStore, proposal: ProposalRecord): { ok: true } | { ok: false; code: 'INVALID_STATE' | 'INVALID_INPUT' | 'VERSION_CONFLICT' | 'NOT_FOUND' | 'SCOPE_FORBIDDEN'; reason: string } {
    if (proposal.status !== 'pending') {
      return { ok: false, code: 'INVALID_STATE', reason: `proposal ${proposal.id} is ${proposal.status}` }
    }
    if (proposal.operation !== 'deprecate' && proposal.sourceRefs.length === 0) {
      const required = this.hub.config.policy.evidence.required_for
      if (required.includes(proposal.type)) {
        return {
          ok: false,
          code: 'INVALID_INPUT',
          reason: `proposal ${proposal.id} needs at least one source_ref for type ${proposal.type}`,
        }
      }
    }
    if (proposal.operation !== 'create') {
      if (proposal.target === null || proposal.expectedVersion === null) {
        return { ok: false, code: 'INVALID_INPUT', reason: `${proposal.operation} requires target and expected_version` }
      }
      const target = store.docs.get(proposal.target)
      if (target === undefined) {
        return { ok: false, code: 'NOT_FOUND', reason: `target ${proposal.target} does not exist` }
      }
      if (target.status !== 'accepted') {
        return { ok: false, code: 'INVALID_STATE', reason: `target ${proposal.target} is ${target.status}` }
      }
      if (target.version !== proposal.expectedVersion) {
        return {
          ok: false,
          code: 'VERSION_CONFLICT',
          reason: `target ${proposal.target} is at version ${target.version}, expected ${proposal.expectedVersion}`,
        }
      }
      if (formatScope(target.scope) !== formatScope(proposal.scope)) {
        return { ok: false, code: 'SCOPE_FORBIDDEN', reason: 'target scope does not match proposal scope' }
      }
    }
    for (const oldId of proposal.supersedes) {
      const old = store.docs.get(oldId)
      if (old === undefined || old.status !== 'accepted') {
        return { ok: false, code: 'INVALID_STATE', reason: `supersedes target ${oldId} is not accepted` }
      }
    }
    return { ok: true }
  }

  precheckProposal(proposalId: string, core?: string): { ok: true } | { ok: false; code: string; reason: string } {
    let proposal: ProposalRecord | null
    if (core !== undefined && core !== '') {
      proposal = this.storeForCore(core)?.store.getProposal(proposalId) ?? null
    } else {
      proposal = this.resolveProposalAcrossStores(proposalId)
    }
    if (proposal === null) {
      return { ok: false, code: 'NOT_FOUND', reason: `proposal ${proposalId} does not exist` }
    }
    return this.precheckCommit(proposal)
  }

  describeCommit(proposalId: string, core?: string): { reason: string; displayReason: { en: string; zh: string } } {
    let proposal: ProposalRecord | null
    if (core !== undefined && core !== '') {
      proposal = this.storeForCore(core)?.store.getProposal(proposalId) ?? null
    } else {
      proposal = this.resolveProposalAcrossStores(proposalId)
    }
    if (proposal === null) {
      return {
        reason: `Commit memory proposal ${proposalId}`,
        displayReason: {
          en: `Commit memory proposal ${proposalId}`,
          zh: `提交记忆提案 ${proposalId}`,
        },
      }
    }
    const reason = `Commit ${proposal.id}: ${proposal.title} → ${formatScope(proposal.scope)} (${proposal.operation})`
    return {
      reason,
      displayReason: {
        en: reason,
        zh: `提交 ${proposal.id}「${proposal.title}」→ ${formatScope(proposal.scope)}`,
      },
    }
  }

  async closeTask(agent: AgentLike, assessment: WritebackAssessment, taskId?: string): Promise<{
    closed: boolean
    assessment: WritebackAssessment
  }> {
    const state = this.sessions.get(agent.id)
    if (state === undefined) throw new MemoryError('NO_TASK', 'no open task for this session')
    if (taskId !== undefined && taskId !== state.taskId) {
      throw new MemoryError('INVALID_STATE', 'can only close the current task')
    }
    const task = this.tasks.get(state.taskId)
    if (task !== undefined && task.assessment !== null) {
      state.closed = true
      return { closed: true, assessment: task.assessment }
    }
    this.validateAssessment(state.taskId, assessment)
    await this.ledger.append({ type: 'task.closed', taskId: state.taskId, assessment })
    if (task !== undefined) {
      task.assessment = assessment
      task.closedAt = nowIso()
    }
    state.closed = true
    return { closed: true, assessment }
  }

  async closeDeferred(sessionId: string, turn?: number): Promise<void> {
    const state = this.sessions.get(sessionId)
    if (state === undefined || state.closed) return
    if (turn !== undefined && state.turn !== turn) return
    try {
      await this.ledger.append({
        type: 'task.closed',
        taskId: state.taskId,
        assessment: { kind: 'deferred', reason: 'turn ended without an assessment' },
      })
      const task = this.tasks.get(state.taskId)
      if (task !== undefined) {
        task.assessment = { kind: 'deferred', reason: 'turn ended without an assessment' }
        task.closedAt = nowIso()
      }
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: cannot record deferred close: ${(error as Error).message}`)
    } finally {
      state.closed = true
      state.pack = ''
    }
  }

  /** 腾讯桥是否启用：配置 enabled 且 hub 存在。 */
  get tencentEnabled(): boolean {
    return this.hub.config.tencent.enabled
  }

  private ensureTencentBridge(agent: AgentLike): TencentSync {
    if (!this.tencentEnabled) {
      throw new MemoryError('NOT_CONFIGURED', 'tencent bridge is disabled; set policy tencent.enabled in config.yaml')
    }
    if (this.tencentBridge === null) {
      const t = this.hub.config.tencent
      // apiKeyEnv 语义与 DSH 内置服务一致：process.env 优先，其次 DSH credential store。
      const apiKey = resolveApiKeyEnv(t.api_key_env) ?? ''
      if (apiKey === '') {
        throw new MemoryError(
          'NOT_CONFIGURED',
          `tencent api key env ${t.api_key_env} is empty (checked process.env and $DSH_HOME/.credentials.yaml refs); cannot enable bridge`,
        )
      }
      const client = new TencentClient({
        config: {
          url: t.url,
          apiKey,
          serviceId: t.service_id,
          teamId: t.team_id,
          agentId: t.agent_id,
          userId: t.user_id,
          taskId: t.task_id,
          timeoutMs: t.timeout_ms,
        },
      })
      const recordsDir = join(this.hub.root, 'records')
      this.tencentBridge = new TencentSync({
        recordsDir,
        pullLimit: t.pull_limit,
        pullScope: t.pull_scope,
        pullType: t.pull_type,
        pushSessionPrefix: 'dsh-memory-hub',
        host: {
          proposeCandidate: async (input) => {
            // 复用 service.propose：生成 pending 候选，人审后才 commit。
            const result = await this.propose(agent, {
              operation: 'create',
              type: input.type as KnowledgeType,
              scope: input.scope,
              title: input.title,
              summary: input.summary,
              ...(input.content === undefined ? {} : { content: input.content }),
              ...(input.sourceRefs === undefined ? {} : { source_refs: input.sourceRefs }),
              ...(input.tags === undefined ? {} : { tags: input.tags }),
            })
            return { proposalId: result.proposalId }
          },
          listAcceptedKnowledge: async () => {
            return [...this.store.docs.values()].filter((record) => record.status === 'accepted')
          },
          audit: async (event) => {
            if (event.type === 'tencent.pull') {
              await this.ledger.append({
                type: 'tencent.pull',
                pulled: event.payload?.pulled ?? 0,
                proposed: event.payload?.proposed ?? 0,
                skipped: event.payload?.skipped ?? 0,
              })
            } else if (event.type === 'tencent.push') {
              await this.ledger.append({
                type: 'tencent.push',
                id: event.payload?.id ?? '?',
                fromOutbox: event.payload?.fromOutbox === true,
              })
            }
          },
        },
        client,
      })
    }
    return this.tencentBridge
  }

  /**
   * 归一化后的远端设置（含 legacy `tencent:` 段的 desugar）。
   *
   * 每次调用都从 `hub.config` 重新算，不缓存：`updateConfig` → `reloadConfig` 之后
   * 必须立刻看到新角色，否则面板改完配置要重启才生效。
   */
  remoteSettings(): RemoteSettings {
    const config = this.hub.config as unknown as { remote?: unknown }
    return normalizeRemoteSettings({
      remote: config.remote,
      tencent: this.hub.config.tencent,
    })
  }

  /** 远端总开关：`remote.enabled`（旧配置由 desugar 从 `tencent.enabled` 派生）。 */
  get remoteEnabled(): boolean {
    return this.remoteSettings().enabled
  }

  /**
   * 构造 provider 注册表。
   *
   * 与 `ensureTencentBridge` 的区别是**不抛错**：单个 provider 缺密钥只是该 provider
   * 不可用，其余 provider 照常工作。这是"降级不允许静默"的另一面——不静默，
   * 但也不让一个坏 provider 拖垮全部远端能力。
   */
  private ensureRemoteRegistry(): RemoteRegistry {
    if (this.remoteRegistry === null) {
      this.remoteRegistry = new RemoteRegistry(this.remoteSettings(), {
        resolveSecret: (envName) => resolveApiKeyEnv(envName) ?? '',
      })
    }
    return this.remoteRegistry
  }

  /** 配置变更后丢弃已构造的 adapter（下一次访问重新构造）。 */
  private resetRemoteRegistry(): void {
    const previous = this.remoteRegistry
    this.remoteRegistry = null
    if (previous !== null) {
      void previous.close().catch(() => {})
    }
  }

  /**
   * 远端诊断（只读、不联网）。
   *
   * 未启用时仍返回结构（`enabled: false`），让 `memory_status` 与面板能区分
   * "没配" / "配了但 adapter 构造失败" / "构造成功但未探活"三种情况。
   * 每 provider 附同步快照（outbox/孤儿/镜像计数 + 待传播数）——overview 与
   * config 都是同步路径，快照用 readFileSync 读小文件（面板 30s 轮询一次）。
   */
  remoteStatus(): {
    enabled: boolean
    mode: string
    providers: Array<{
      id: string
      kind: string
      enabled: boolean
      roles: string[]
      ready: boolean
      error: string | null
      capabilities: string[]
      /** 完整 provider 段（回显给面板做"整段替换"保存用）。config 里只有密钥的环境变量名，不含密钥值。 */
      projection: { scopes: string[]; types: string[]; exclude_tags: string[] }
      feed: { scope: string; type: string; limit: number; tags: string[] }
      mirror: { trigger: string; include_body: boolean; max_body_chars: number }
      config: Record<string, unknown>
      forget: { on_deprecate: boolean; on_merge: boolean; max_per_run: number }
      sync: {
        mirrored: number
        outboxPending: number
        orphans: number
        pendingForget: number
        lastPullAt: string | null
        lastPushAt: string | null
        lastForgetAt: string | null
        lastError: string | null
      }
    }>
    roles: Record<string, string[]>
    validation: { ok: boolean; errors: string[] }
  } {
    const settings = this.remoteSettings()
    const validation = validateRemoteSettings(settings)
    const emptyRoles: Record<string, string[]> = { feed: [], mirror: [], authority: [], index: [] }
    if (!settings.enabled) {
      return { enabled: false, mode: settings.mode, providers: [], roles: emptyRoles, validation }
    }
    const registry = this.ensureRemoteRegistry()
    const records = this.store.records()
    const recordsDir = join(this.hub.root, 'records')
    const providers = registry.list().map((handle: RemoteProviderHandle) => {
      const snapshot = readRemoteSyncStateSync(recordsDir, handle.settings.id)
      const pendingForget = countPendingForget(records, handle.settings.forget, snapshot.pushedIds, snapshot.forgottenIds)
      return {
        id: handle.settings.id,
        kind: handle.settings.kind,
        enabled: handle.settings.enabled,
        roles: [...handle.settings.roles],
        ready: handle.adapter !== null,
        error: handle.error,
        capabilities:
          handle.adapter === null
            ? []
            : [...handle.adapter.capabilities()].sort((a, b) => a.localeCompare(b)),
        projection: {
          scopes: [...handle.settings.projection.scopes],
          types: [...handle.settings.projection.types],
          exclude_tags: [...handle.settings.projection.exclude_tags],
        },
        feed: { ...handle.settings.feed, tags: [...handle.settings.feed.tags] },
        mirror: { ...handle.settings.mirror },
        config: { ...handle.settings.config },
        forget: {
          on_deprecate: handle.settings.forget.on_deprecate,
          on_merge: handle.settings.forget.on_merge,
          max_per_run: handle.settings.forget.max_per_run,
        },
        sync: {
          mirrored: snapshot.mirrored,
          outboxPending: snapshot.outboxPending,
          orphans: snapshot.orphans,
          pendingForget,
          lastPullAt: snapshot.lastPullAt,
          lastPushAt: snapshot.lastPushAt,
          lastForgetAt: snapshot.lastForgetAt,
          lastError: snapshot.lastError,
        },
      }
    })
    return {
      enabled: true,
      mode: settings.mode,
      providers,
      roles: registry.roleSummary() as unknown as Record<string, string[]>,
      validation,
    }
  }

  /**
   * 探测全部 provider（**会联网**，只读）。
   *
   * 失败不抛：每个 provider 单独 try，结果汇总。供 `memory_remote_status` 主动体检用。
   */
  async remoteProbe(): Promise<{
    enabled: boolean
    validation: { ok: boolean; errors: string[] }
    providers: Array<{ id: string; ok: boolean; latencyMs?: number; detail?: string }>
  }> {
    const settings = this.remoteSettings()
    const validation = validateRemoteSettings(settings)
    if (!settings.enabled) {
      return { enabled: false, validation, providers: [] }
    }
    const registry = this.ensureRemoteRegistry()
    const providers: Array<{ id: string; ok: boolean; latencyMs?: number; detail?: string }> = []
    for (const handle of registry.list()) {
      if (handle.adapter === null) {
        providers.push({ id: handle.settings.id, ok: false, detail: handle.error ?? 'adapter unavailable' })
        continue
      }
      const probe = await handle.adapter.probe()
      providers.push({
        id: handle.settings.id,
        ok: probe.ok,
        ...(probe.latencyMs === undefined ? {} : { latencyMs: probe.latencyMs }),
        ...(probe.detail === undefined ? {} : { detail: probe.detail }),
      })
    }
    return { enabled: true, validation, providers }
  }

  /** 同步引擎的宿主适配：候选生成、知识清单与审计都走 service 既有路径。 */
  private remoteSyncHost(agent: AgentLike): RemoteSyncHost {
    return {
      proposeCandidate: async (input) => {
        const result = await this.propose(agent, {
          operation: 'create',
          type: input.type as KnowledgeType,
          scope: input.scope,
          // 远端原文不保证符合本地长度约束（真机验证：L1 atomic summary 可超 240，
          // 直接透传会被拒并永久重试）。在边界截断，让候选总能提出去，人审时看全文。
          title: truncate(input.title, 200),
          summary: truncate(input.summary, 240),
          ...(input.content === undefined ? {} : { content: input.content }),
          source_refs: input.sourceRefs,
          ...(input.tags === undefined ? {} : { tags: input.tags }),
        })
        return { proposalId: result.proposalId }
      },
      allKnowledge: async () => this.store.records(),
      audit: async (event: RemoteAuditEvent) => {
        // 逐类型映射而不是 spread：LedgerEvent 是可辨识联合，spread 会把 type 拓宽。
        if (event.type === 'remote.pull') {
          await this.ledger.append({ type: 'remote.pull', ...event.payload })
        } else if (event.type === 'remote.push') {
          await this.ledger.append({ type: 'remote.push', ...event.payload })
        } else {
          await this.ledger.append({ type: 'remote.forget', ...event.payload })
        }
      },
    }
  }

  /**
   * 解析要操作的 provider 句柄。
   *
   * 指定 `provider` 时即使 adapter 不可用也返回该句柄（让结果里出现明确的错误，
   * 而不是"什么都不发生"）；不指定时只返回承担所需角色且已启用的 provider。
   */
  private resolveRemoteHandles(provider: string | undefined, roles: readonly string[]): RemoteProviderHandle[] {
    const settings = this.remoteSettings()
    if (!settings.enabled) {
      throw new MemoryError('NOT_CONFIGURED', 'remote providers are disabled; set remote.enabled in config.yaml')
    }
    const registry = this.ensureRemoteRegistry()
    if (provider !== undefined) {
      const handle = registry.get(provider)
      if (handle === null) {
        const known = registry.list().map((item) => item.settings.id).join(', ') || '(none configured)'
        throw new MemoryError('NOT_FOUND', `unknown remote provider "${provider}" (configured: ${known})`)
      }
      return [handle]
    }
    return registry
      .list()
      .filter(
        (handle) =>
          handle.settings.enabled && handle.settings.roles.some((role) => roles.includes(role)),
      )
  }

  private buildEngine(agent: AgentLike, handle: RemoteProviderHandle): RemoteSync {
    if (handle.adapter === null) {
      throw new MemoryError(
        'NOT_CONFIGURED',
        `provider "${handle.settings.id}" is unavailable: ${handle.error ?? 'adapter unavailable'}`,
      )
    }
    // 坐标编码的来源身份（§5.8.1）：按当前 agent 的会话工作区解析。
    const workspace = this.sessions.get(agent.id)?.workspace ?? this.matchWorkspaceSync(agent)
    const workspaceId = workspace.registered && workspace.id !== null ? workspace.id : null
    return new RemoteSync({
      providerId: handle.settings.id,
      recordsDir: join(this.hub.root, 'records'),
      host: this.remoteSyncHost(agent),
      adapter: handle.adapter,
      settings: handle.settings,
      origin: {
        coreId: this.coreId,
        workspaceId,
        hubKey: workspaceId ?? this.coreId ?? 'local',
      },
      // 引用门槛（§5.9.2）：本 hub 的 citation.added 计数快照；require_citations: 0 时引擎不会查询。
      citationCount: (() => {
        const counts = this.citationCountMap()
        return (knowledgeId: string) => counts.get(knowledgeId) ?? 0
      })(),
    })
  }

  /**
   * 一次性迁移旧腾讯桥的状态游标（幂等；详见 sync.ts migrateLegacyRemoteState）。
   * 成功才记 `remote.migrated` 账本事件；未迁移（无旧文件/已存在/解析失败）静默——
   * 失败细节留在返回值里，由调用方自行决定是否升告警。
   */
  private async migrateLegacyRemoteState(providerId: string): Promise<LegacyMigrationResult> {
    const result = await migrateLegacyRemoteState(join(this.hub.root, 'records'), providerId)
    if (result.migrated) {
      await this.ledger.append({
        type: 'remote.migrated',
        provider: providerId,
        pulled: result.pulled,
        pushed: result.pushed,
        source: 'legacy',
      })
      this.ctx.logger.info(
        `dsh-memory-hub: migrated legacy remote state for ${providerId} (pulled=${result.pulled}, pushed=${result.pushed})`,
      )
    }
    return result
  }

  /**
   * 手动触发远端同步。方向默认 `pull` + `push`；**forget 不在默认方向里**——
   * 删除传播必须走显式的 `memory_remote_forget`，避免一次随手 sync 把作扩散到远端。
   */
  async remoteSync(
    agent: AgentLike,
    opts: { provider?: string; direction?: 'pull' | 'push' } = {},
  ): Promise<{
    results: Array<{
      provider: string
      ok: boolean
      error: string | null
      pull?: RemotePullResult
      push?: RemotePushResult
    }>
  }> {
    await this.ensureTask(agent, 'remote provider sync')
    const directions: Array<'pull' | 'push'> = opts.direction !== undefined ? [opts.direction] : ['pull', 'push']
    // 方向 → 角色：pull 走 feed，push 走 mirror。别把方向名当角色名传下去。
    const roles = directions.includes('pull') && directions.includes('push') ? ['feed', 'mirror'] : directions.includes('pull') ? ['feed'] : ['mirror']
    const handles = this.resolveRemoteHandles(opts.provider, roles)
    const results: Array<{
      provider: string
      ok: boolean
      error: string | null
      pull?: RemotePullResult
      push?: RemotePushResult
    }> = []
    for (const handle of handles) {
      if (handle.adapter === null) {
        results.push({ provider: handle.settings.id, ok: false, error: handle.error ?? 'adapter unavailable' })
        continue
      }
      await this.migrateLegacyRemoteState(handle.settings.id)
      try {
        const engine = this.buildEngine(agent, handle)
        const entry: { provider: string; ok: boolean; error: string | null; pull?: RemotePullResult; push?: RemotePushResult } = {
          provider: handle.settings.id,
          ok: true,
          error: null,
        }
        if (directions.includes('pull')) entry.pull = await engine.pull()
        if (directions.includes('push')) entry.push = await engine.push()
        results.push(entry)
      } catch (error) {
        results.push({ provider: handle.settings.id, ok: false, error: (error as Error).message })
      }
    }
    return { results }
  }

  /**
   * 作废传播 / 人工显式遗忘。
   *
   * - 无 `knowledgeId`：传播模式，受 provider 的 `forget.on_deprecate` / `on_merge` /
   *   `max_per_run` 控制；`dryRun: true` 预览且零副作用。
   * - 有 `knowledgeId`：绕过开关，但从未镜像过的条目会如实报 skipped（不产生幽灵请求）。
   */
  async remoteForget(
    agent: AgentLike,
    opts: { provider?: string; knowledgeId?: string; dryRun?: boolean; reason?: string } = {},
  ): Promise<{
    results: Array<{ provider: string; ok: boolean; error: string | null; result?: RemoteForgetResult }>
  }> {
    await this.ensureTask(agent, 'remote provider forget')
    const handles = this.resolveRemoteHandles(opts.provider, ['mirror'])
    const results: Array<{ provider: string; ok: boolean; error: string | null; result?: RemoteForgetResult }> = []
    for (const handle of handles) {
      if (handle.adapter === null) {
        results.push({ provider: handle.settings.id, ok: false, error: handle.error ?? 'adapter unavailable' })
        continue
      }
      await this.migrateLegacyRemoteState(handle.settings.id)
      try {
        const engine = this.buildEngine(agent, handle)
        const result = await engine.forget({
          ...(opts.dryRun === undefined ? {} : { dryRun: opts.dryRun }),
          ...(opts.reason === undefined ? {} : { reason: opts.reason }),
          ...(opts.knowledgeId === undefined ? {} : { knowledgeId: opts.knowledgeId }),
        })
        results.push({ provider: handle.settings.id, ok: true, error: null, result })
      } catch (error) {
        results.push({ provider: handle.settings.id, ok: false, error: (error as Error).message })
      }
    }
    return { results }
  }

  /** 远端诊断 + 各 provider 的同步快照（只读文件，不联网）。 */
  async remoteStatusDetailed(): Promise<
    ReturnType<MemoryService['remoteStatus']> & { sync: RemoteSyncSnapshot[] }
  > {
    const base = this.remoteStatus()
    if (!base.enabled) return { ...base, sync: [] }
    const recordsDir = join(this.hub.root, 'records')
    const sync: RemoteSyncSnapshot[] = []
    for (const provider of this.remoteSettings().providers) {
      sync.push(await readRemoteSyncSnapshot(recordsDir, provider.id))
    }
    return { ...base, sync }
  }

  /** 腾讯桥状态（只读）。未启用时返回 disabled 标记。 */
  async tencentStatus(agent: AgentLike): Promise<SyncStatus | { enabled: false }> {
    if (!this.tencentEnabled) return { enabled: false }
    const bridge = this.ensureTencentBridge(agent)
    const status = await bridge.status()
    // 主动 ping 数据面（只读、带超时）；失败只记诊断，不抛。
    try {
      const { total } = await bridge.client.ping()
      return { ...status, ping: { ok: true, total } }
    } catch (error) {
      return { ...status, ping: { ok: false, error: (error as Error).message } }
    }
  }

  /** 拉取腾讯 L1/L2 → 生成本地 pending 候选。不 commit。 */
  async tencentPull(agent: AgentLike): Promise<PullResult> {
    if (!this.tencentEnabled) {
      throw new MemoryError('NOT_CONFIGURED', 'tencent bridge is disabled; set tencent.enabled in config.yaml')
    }
    // pull 是同步操作，不依赖用户回合：无活跃任务时自动开一个内部同步任务，
    // 否则 propose 会因 NO_TASK 失败（例如插件热重载后内存会话清空、或定时/后台调用）。
    await this.ensureTask(agent, 'tencent bridge sync pull')
    const bridge = this.ensureTencentBridge(agent)
    return bridge.pull()
  }

  /** 确保有一个未关闭的会话任务可供 propose 使用（同步/后台操作专用）。 */
  /**
   * 确保该会话有一个打开的任务（无则新开一个）。
   * DSH glue 由预检钩子开任务；headless 入口（MCP / CLI / serve）没有轮前钩子，
   * 在写路径（cite / closeTask / commit）前调用本方法补齐任务语义。
   */
  async ensureTask(agent: AgentLike, intent: string): Promise<void> {
    const existing = this.sessions.get(agent.id)
    if (existing !== undefined && !existing.closed) return
    await this.beforeNewTask(agent.id, existing)
    const workspace = await this.resolveWorkspace(agent)
    const visibility = this.visibilityFor(workspace)
    const taskId = newTaskId()
    const turn = existing?.turn ?? 0
    const now = nowIso()
    const record: TaskRecord = {
      taskId,
      sessionId: agent.id,
      turn,
      workspaceId: workspace.id,
      intentHash: hashIntent(intent),
      createdAt: now,
      preflight: null,
      assessment: null,
      closedAt: null,
    }
    this.tasks.set(taskId, record)
    this.sessions.set(agent.id, {
      turn,
      taskId,
      workspace,
      visibility,
      pack: '',
      status: 'unavailable',
      hits: [],
      closed: false,
    })
    try {
      await this.ledger.append({
        type: 'task.created',
        taskId,
        sessionId: agent.id,
        turn,
        workspaceId: workspace.id,
        intentHash: record.intentHash,
        idempotencyKey: `${agent.id}:tencent-pull`,
      })
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: cannot record sync task: ${(error as Error).message}`)
    }
  }

  /** 把本地 accepted 知识 push 到腾讯通道。 */
  async tencentPush(agent: AgentLike): Promise<PushResult> {
    if (!this.tencentEnabled) {
      throw new MemoryError('NOT_CONFIGURED', 'tencent bridge is disabled; set tencent.enabled in config.yaml')
    }
    return this.ensureTencentBridge(agent).push()
  }

  /** 场景归纳是否启用（layers.scenario_dir 非空）。 */
  get scenarioEnabled(): boolean {
    return this.hub.config.layers.scenario_dir.trim() !== ''
  }

  /** 重建场景索引（只写 scenario 目录，不碰 knowledge/）。 */
  async scenarioRebuild(_agent: AgentLike): Promise<ScenarioResult> {
    if (!this.scenarioEnabled) {
      return { scenarios: [], skipped: 0 }
    }
    const builder = new ScenarioBuilder({
      scenarioDir: this.hub.config.layers.scenario_dir,
    })
    const records = [...this.store.docs.values()]
    return builder.rebuild(this.hub.root, records)
  }

  /** 只读列出场景文件。 */
  async scenarioList(_agent: AgentLike): Promise<Array<{ name: string; path: string }>> {
    if (!this.scenarioEnabled) return []
    const builder = new ScenarioBuilder({ scenarioDir: this.hub.config.layers.scenario_dir })
    return builder.list(this.hub.root)
  }

  async consolidate(agent: AgentLike, args: {
    workspace_ids?: string[]
    types?: KnowledgeType[]
    dry_run?: boolean
  }): Promise<{ created: ProposalRecord[]; skipped: number; dryRun: boolean }> {
    const workspace = await this.resolveWorkspace(agent)
    if (!workspace.admin) {
      throw new MemoryError('SCOPE_FORBIDDEN', 'consolidation requires an admin workspace')
    }
    const workspaceIds = args.workspace_ids ?? this.activeWorkspaces.filter((entry) => entry.enabled).map((entry) => entry.id)
    for (const id of workspaceIds) {
      if (!this.activeWorkspaces.some((entry) => entry.id === id && entry.enabled)) {
        throw new MemoryError('INVALID_INPUT', `unknown workspace ${id}`)
      }
    }
    const result = await this.store.consolidate({
      targetScope: this.hub.config.consolidation.target_scope,
      workspaceIds,
      ...(args.types === undefined ? {} : { types: args.types }),
      dryRun: args.dry_run === true,
    })
    if (args.dry_run !== true) {
      for (const proposal of result.created) {
        await this.ledger.append({
          type: 'proposal.created',
          taskId: proposal.taskId,
          proposalId: proposal.id,
        })
      }
      await this.ledger.append({
        type: 'consolidation.run',
        actorWorkspace: workspace.id,
        workspaceIds,
        created: result.created.length,
        skipped: result.skipped,
      })
    }
    return { ...result, dryRun: args.dry_run === true }
  }

  async maintenance(args: MaintenanceArgs): Promise<MaintenanceResult> {
    if (args.admin !== true) {
      throw new MemoryError('SCOPE_FORBIDDEN', 'maintenance requires an admin workspace')
    }
    const apply = args.apply === 'propose' ? 'propose' : 'report'
    const maxProposals = Math.min(20, Math.max(1, Math.trunc(args.maxProposals ?? 10)))
    const stalePendingDays = Math.min(3650, Math.max(1, Math.trunc(args.stalePendingDays ?? 30)))
    const staleCitationDays = Math.min(3650, Math.max(1, Math.trunc(args.staleCitationDays ?? 90)))
    const analysis = analyzeMaintenance(this.store, {
      coreId: args.coreId,
      workspaces: this.activeWorkspaces.map((workspace) => ({
        id: workspace.id,
        root: workspace.root,
        coreId: workspace.core_id ?? null,
        admin: workspace.admin,
        enabled: workspace.enabled,
      })),
      citations: this.citationIndex(),
      agenda: await this.readAgendaCounts(this.hub.root),
      stalePendingDays,
      staleCitationDays,
      ...(args.now === undefined ? {} : { now: args.now }),
      maxBodyBytes: this.hub.config.policy.limits.max_body_bytes,
      temporal: this.hub.config.policy.temporal,
    })

    const taskId = newMaintenanceTaskId()
    const created: ProposalRecord[] = []
    const errors: string[] = []
    let skipped = 0
    let truncated = 0

    if (apply === 'propose' && !(await this.hub.ensureWritable())) {
      errors.push(`hub is read-only: ${this.hub.readOnlyReason ?? 'unknown reason'}`)
    } else if (apply === 'propose') {
      const pendingTags = new Set<string>()
      for (const proposal of this.store.proposals.values()) {
        if (proposal.status !== 'pending') continue
        for (const tag of proposal.tags) if (tag.startsWith('maint-')) pendingTags.add(tag)
      }
      for (const candidate of analysis.candidates) {
        if (this.maintenanceAlreadyPending(candidate, pendingTags)) {
          skipped += 1
          continue
        }
        if (created.length >= maxProposals) {
          truncated += 1
          continue
        }
        try {
          const proposal = await this.store.propose(candidate.input, { taskId })
          await this.ledger.append({
            type: 'proposal.created',
            taskId,
            proposalId: proposal.id,
          })
          created.push(proposal)
          pendingTags.add(maintenanceToken(candidate.fingerprint))
        } catch (error) {
          errors.push(`${candidate.fingerprint}: ${(error as Error).message}`)
        }
      }
    }

    const generatedAt = nowIso()
    const stamp = generatedAt.replace(/[:.]/g, '-')
    const reportPath = join(this.hub.root, 'reports', `${stamp}.md`)
    const latestPath = join(this.hub.root, 'reports', 'latest.md')
    const report = renderMaintenanceReport({
      root: this.hub.displayRoot(),
      coreId: args.coreId,
      apply,
      analysis,
      created,
      skipped,
      maxProposals,
      reportPath,
      generatedAt,
    })

    let writtenReport: string | null = reportPath
    let writtenLatest: string | null = latestPath
    try {
      await writeAtomic(reportPath, report)
      await writeAtomic(latestPath, report)
    } catch (error) {
      writtenReport = null
      writtenLatest = null
      errors.push(`cannot write maintenance report: ${(error as Error).message}`)
    }

    return {
      apply,
      coreId: args.coreId,
      root: this.hub.displayRoot(),
      readOnly: this.hub.readOnly,
      reportPath: writtenReport,
      latestPath: writtenLatest,
      generatedAt,
      totals: analysis.totals,
      workspaceStats: analysis.workspaceStats,
      issues: analysis.issues,
      created: created.map((proposal) => ({
        id: proposal.id,
        operation: proposal.operation,
        type: proposal.type,
        scope: formatScope(proposal.scope),
        title: proposal.title,
        target: proposal.target,
      })),
      skipped,
      truncated,
      errors,
    }
  }

  /** knowledgeId → 最近一次引用时间；维护与面板都用这一份口径。 */
  private citationIndex(): Map<string, string> {
    const index = new Map<string, string>()
    for (const citation of this.citations) {
      const prior = index.get(citation.knowledgeId)
      if (prior === undefined || Date.parse(citation.createdAt) > Date.parse(prior)) {
        index.set(citation.knowledgeId, citation.createdAt)
      }
    }
    return index
  }

  private maintenanceAlreadyPending(candidate: MaintenanceCandidate, tags: Set<string>): boolean {
    if (tags.has(maintenanceToken(candidate.fingerprint))) return true
    for (const proposal of this.store.proposals.values()) {
      if (proposal.status !== 'pending') continue
      if (
        candidate.kind === 'promotion' &&
        candidate.input.promotedFrom !== undefined &&
        proposal.promotedFrom === candidate.input.promotedFrom
      ) {
        return true
      }
      if (
        candidate.kind === 'duplicate' &&
        proposal.operation === 'deprecate' &&
        proposal.target !== null &&
        proposal.target === candidate.input.target
      ) {
        return true
      }
    }
    return false
  }

  overview(): Record<string, unknown> {
    this.hub.revalidateLock()
    this.parent?.hub.revalidateLock()
    for (const ancestor of this.parents) ancestor.hub.revalidateLock()
    const citations = this.citationIndex()
    interface KnowledgeRow {
      id: string
      type: KnowledgeType
      status: KnowledgeStatus
      version: number
      title: string
      summary: string
      scope: string
      updatedAt: string
      temporal: TemporalState
      validFrom: string | null
      expiresAt: string | null
      lastVerified: string | null
      lastCitedAt: string | null
      core?: string | null
    }
    const describe = (
      record: KnowledgeRecord,
      core?: string | null,
      policy: TemporalPolicy = this.hub.config.policy.temporal,
    ): KnowledgeRow => ({
      id: record.id,
      type: record.type,
      status: record.status,
      version: record.version,
      title: record.title,
      summary: record.summary,
      scope: formatScope(record.scope),
      updatedAt: record.updatedAt,
      temporal: temporalState(record, Date.now(), policy),
      validFrom: record.validFrom,
      expiresAt: record.expiresAt,
      lastVerified: record.lastVerified,
      lastCitedAt: citations.get(record.id) ?? null,
      ...(core === undefined ? {} : { core }),
    })
    const ownKnowledge = [...this.store.docs.values()].map((record) => describe(record))
    // 金字塔：把各上级核心 Hub 的 project:<祖先核心> 蒸馏知识并入面板列表，带 core 标注。
    const parentKnowledge: KnowledgeRow[] = []
    for (const parent of this.parents) {
      const coreId = parent.coreId
      if (coreId === null) continue
      for (const record of parent.store.docs.values()) {
        if (record.scope.level !== 'project' || record.scope.workspaceId !== coreId) continue
        parentKnowledge.push(describe(record, coreId, parent.hub.config.policy.temporal))
      }
    }
    // 金字塔面板：自己的 Hub 在前，随后按 近→远 是各祖先层，层内按更新时间倒序。
    const tierOf = (row: KnowledgeRow): number =>
      row.core === undefined || row.core === null ? 0 : this.parentCoreIds.indexOf(row.core) + 1
    const knowledge = [...ownKnowledge, ...parentKnowledge]
      .sort((left, right) => tierOf(left) - tierOf(right) || right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 200)
    // 面板一次最多展示最近 N 条候选：批量萃取时 pending/ 可能上千条，
    // 全量序列化（尤其 merge diff）会拖慢面板；总数与批次计数仍然全量给出。
    const allPending = [...this.store.proposals.values()]
      .filter((proposal) => proposal.status === 'pending')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const pendingTotal = this.store.counts().pending
    const batchOf = (tags: readonly string[]): string | null => {
      const tag = tags.find((value) => value.startsWith('batch:'))
      return tag === undefined ? null : tag.slice('batch:'.length)
    }
    const batchCounts = new Map<string, number>()
    for (const proposal of allPending) {
      const batch = batchOf(proposal.tags)
      if (batch !== null) batchCounts.set(batch, (batchCounts.get(batch) ?? 0) + 1)
    }
    const pendingBatches = [...batchCounts.entries()]
      .map(([batch, count]) => ({ batch, count }))
      .sort((left, right) => right.count - left.count || left.batch.localeCompare(right.batch))
    const pending = allPending.slice(0, PANEL_PENDING_LIMIT).map((proposal) => {
        const merge = proposal.operation === 'merge' ? this.mergePreview(proposal) : null
        return {
          id: proposal.id,
          operation: proposal.operation,
          type: proposal.type,
          title: proposal.title,
          summary: proposal.summary,
          scope: formatScope(proposal.scope),
          taskId: proposal.taskId,
          createdAt: proposal.createdAt,
          batch: batchOf(proposal.tags),
          validFrom: proposal.validFrom,
          expiresAt: proposal.expiresAt,
          lastVerified: proposal.lastVerified,
          risk: assessProposalRisk({
            title: proposal.title,
            summary: proposal.summary,
            content: proposal.body,
            sourceRefs: proposal.sourceRefs,
          }),
          temporal: temporalState(
            {
              validFrom: proposal.validFrom,
              expiresAt: proposal.expiresAt,
              lastVerified: proposal.lastVerified,
              updatedAt: proposal.updatedAt,
            },
            Date.now(),
            this.hub.config.policy.temporal,
          ),
          ...(merge === null ? {} : { merged: merge.merged, diff: merge.diff, diffTruncated: merge.truncated }),
        }
      })
    const tasks = [...this.tasks.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 30)
      .map((task) => ({
        taskId: task.taskId,
        sessionId: task.sessionId,
        turn: task.turn,
        workspaceId: task.workspaceId,
        createdAt: task.createdAt,
        preflight: task.preflight === null ? null : { status: task.preflight.status, hits: task.preflight.hits },
        citations: this.citations.filter((citation) => citation.taskId === task.taskId).length,
        assessment: task.assessment,
      }))
    return {
      version: PLUGIN_VERSION,
      initialized: true,
      root: this.hub.displayRoot(),
      readOnly: this.hub.readOnly,
      readOnlyReason: this.hub.readOnlyReason,
      readOnlySource: this.hub.readOnlySource,
      // 写锁是租约：`lock.expiresAt` 之后其他写者可以接管，`lock.reclaimed`
      // 记录本次是否回收了残留锁。两者让“卡死”变成可观察、可自愈的状态。
      lock: this.hub.lockInfo(),
      configWritable: this.hub.canWriteConfig(),
      configError: this.hub.configError,
      coreId: this.coreId,
      parentCoreId: this.parentCoreId,
      parent: this.parent === null
        ? null
        : {
            coreId: this.parentCoreId,
            root: this.parent.hub.displayRoot(),
            counts: this.parent.store.counts(),
          },
      ancestors: this.parents.map((parent) => ({
        coreId: parent.coreId,
        root: parent.hub.displayRoot(),
        counts: parent.store.counts(),
      })),
      parentCoreIds: this.parentCoreIds,
      counts: this.store.counts(),
      index: {
        documents: this.store.index.size,
        backend: this.store.indexBackend,
        rebuilt: this.store.indexRebuilt,
        diagnostics: this.store.diagnostics.slice(0, 20),
      },
      core_workspaces: this.hub.config.core_workspaces.map((core) => ({
        id: core.id,
        name: core.name,
        root: core.root,
        distill: core.distill,
      })),
      workspaces: this.activeWorkspaces.map((workspace) => ({
        id: workspace.id,
        core_id: workspace.core_id,
        root: workspace.root,
        domains: workspace.domains,
        admin: workspace.admin,
        enabled: workspace.enabled,
        distill: workspace.distill,
      })),
      policy: {
        approval: this.hub.config.policy.approval,
        preflight: this.hub.config.policy.preflight,
        gate: this.hub.config.policy.gate,
        evidence: this.hub.config.policy.evidence,
        maintenance: this.hub.config.policy.maintenance,
        temporal: this.hub.config.policy.temporal,
      },
      knowledge,
      pending,
      pendingTotal,
      pendingBatches,
      tasks,
      generatedAt: nowIso(),
    }
  }

  knowledgeDetail(id: string, core?: string): {
    metadata: Record<string, unknown>
    body: string
    path: string
  } | null {
    let record = this.store.docs.get(id)
    let root = this.hub.root
    let policy = this.hub.config.policy.temporal
    if (record === undefined && core !== undefined && core !== '') {
      const target = this.storeForCore(core)
      record = target?.store.docs.get(id)
      if (target !== null && record !== undefined) {
        root = target.hub.root
        policy = target.hub.config.policy.temporal
      }
    }
    if (record === undefined) return null
    const { body, path, extra: _extra, scope, ...rest } = record
    void _extra
    const temporal = temporalState(record, Date.now(), policy)
    const temporalNote = temporalAnnotation(record, temporal, policy)
    return {
      metadata: {
        ...rest,
        scope: formatScope(scope),
        temporal,
        ...(temporalNote === null ? {} : { temporalNote }),
      },
      body,
      path: KnowledgeStore.relativePath(root, path),
    }
  }

  config(): Record<string, unknown> {
    this.hub.revalidateLock()
    return {
      readOnly: this.hub.readOnly,
      // config.yaml is written atomically and does not need the knowledge writer
      // lock: a busy lock or a broken config must not lock the user out of the
      // panel form that repairs it.
      configWritable: this.hub.canWriteConfig(),
      configError: this.hub.configError,
      core_workspaces: this.hub.config.core_workspaces.map((core) => ({
        id: core.id,
        name: core.name,
        root: core.root,
        distill: core.distill,
      })),
      workspaces: this.hub.config.workspaces.map((workspace) => ({
        id: workspace.id,
        core_id: workspace.core_id,
        root: workspace.root,
        domains: workspace.domains,
        admin: workspace.admin,
        enabled: workspace.enabled,
        distill: workspace.distill,
      })),
      remote: this.remoteStatus(),
    }
  }

  async updateConfig(patch: { core_workspaces?: unknown; workspaces?: unknown; remote?: unknown }): Promise<Record<string, unknown>> {
    if (!this.hub.canWriteConfig()) {
      throw new MemoryError('INVALID_STATE', this.hub.readOnlyReason ?? 'memory hub is read-only')
    }

    const core_workspaces = Array.isArray(patch.core_workspaces) ? patch.core_workspaces : this.hub.config.core_workspaces
    const workspaces = Array.isArray(patch.workspaces) ? patch.workspaces : this.hub.config.workspaces
    // remote patch：面板「远端」卡片写 forget 开关 / 上限 / 角色等。整段替换（与 workspaces 同语义）。
    const remoteChanged = patch.remote !== undefined && patch.remote !== null && typeof patch.remote === 'object'
    const remote = remoteChanged ? patch.remote : (this.hub.config as unknown as { remote?: unknown }).remote

    const validCoreIds = new Set(core_workspaces.map((core: CoreWorkspaceConfig) => core.id))
    for (const core of core_workspaces) {
      this.validateDistillConfig(core.id, 'core workspace', core.distill, core.root, true)
    }
    for (const workspace of workspaces) {
      if (workspace.core_id !== null && workspace.core_id !== undefined && !validCoreIds.has(workspace.core_id)) {
        throw new MemoryError('INVALID_INPUT', `workspace ${workspace.id} references unknown core ${workspace.core_id}`)
      }
      if (workspace.core_id === workspace.id) {
        throw new MemoryError(
          'INVALID_INPUT',
          `workspace ${workspace.id} cannot reference itself as its core; a core workspace that is also a sub-workspace must point at a different parent core`,
        )
      }
      this.validateDistillConfig(workspace.id, 'workspace', workspace.distill, workspace.root, false)
    }

    const next: MemoryConfig = configSchema.parse({
      ...this.hub.config,
      core_workspaces,
      workspaces,
      ...(remoteChanged ? { remote } : {}),
    })

    try {
      const configPath = this.hub.configPath()
      if (configPath === null) {
        throw new MemoryError('INVALID_STATE', 'data hub has no config source')
      }
      await writeAtomic(configPath, stringifyYaml(next))
      await this.hub.reloadConfig()
      // 配置变了 → 已构造的 provider 可能整组作废（新增/删除/改角色），必须重建。
      // 腾讯桥同理：它持有自己的 client 与 cursor，配置改了就丢弃重来。
      this.resetRemoteRegistry()
      this.tencentBridge = null
      if (remoteChanged) {
        const providerCount = this.remoteSettings().providers.length
        await this.ledger.append({ type: 'config.remote.updated', providers: providerCount })
      }
      return this.config()
    } catch (error) {
      throw new MemoryError('STORAGE_ERROR', `cannot write config: ${(error as Error).message}`)
    }
  }

  private validateDistillConfig(
    id: string,
    kind: string,
    distill: CoreWorkspaceConfig['distill'] | undefined,
    root: string | undefined,
    core: boolean,
  ): void {
    if (distill === undefined || distill.enabled !== true) return
    if (distill.target === 'session' && (distill.session_id ?? '').trim() === '') {
      throw new MemoryError('INVALID_INPUT', `${kind} ${id} enables distill in session mode but has no session_id`)
    }
    if ((root ?? '').trim() === '') {
      throw new MemoryError('INVALID_INPUT', `${kind} ${id} enables distill but has no root to run in`)
    }
    if (!core && (distill.max_proposals ?? 0) < 1) {
      throw new MemoryError('INVALID_INPUT', `${kind} ${id} has an invalid max_proposals`)
    }
  }

  status(agent?: AgentLike): Record<string, unknown> {
    // The read-only flag is a cached judgement about the lock file; refresh it
    // before reporting so a released/deleted lock does not keep saying "locked".
    this.hub.revalidateLock()
    this.parent?.hub.revalidateLock()
    for (const ancestor of this.parents) ancestor.hub.revalidateLock()
    const workspace = agent === undefined
      ? null
      : this.sessions.get(agent.id)?.workspace ?? this.matchWorkspaceSync(agent)
    return {
      version: PLUGIN_VERSION,
      initialized: true,
      root: this.hub.displayRoot(),
      readOnly: this.hub.readOnly,
      readOnlyReason: this.hub.readOnlyReason,
      readOnlySource: this.hub.readOnlySource,
      // 写锁租约诊断：谁在挡、租约何时到期、上次回收了什么残留锁。
      lock: this.hub.lockInfo(),
      configWritable: this.hub.canWriteConfig(),
      configError: this.hub.configError,
      workspace: workspace === null || !workspace.registered
        ? null
        : {
            id: workspace.id,
            root: workspace.root,
            domains: workspace.domains,
            registered: workspace.registered,
            coreId: workspace.coreId,
            parentCoreId: workspace.parentCoreId,
            parentCoreIds: workspace.parentCoreIds,
          },
      // 金字塔：同时报告上级核心 Hub 链，便于确认分级蒸馏链路。
      parent: this.parent === null
        ? null
        : {
            coreId: this.parentCoreId,
            root: this.parent.hub.displayRoot(),
            readOnly: this.parent.hub.readOnly,
            counts: this.parent.store.counts(),
          },
      ancestors: this.parents.map((parent) => ({
        coreId: parent.coreId,
        root: parent.hub.displayRoot(),
        readOnly: parent.hub.readOnly,
        counts: parent.store.counts(),
      })),
      counts: this.store.counts(),
      index: {
        documents: this.store.index.size,
        backend: this.store.indexBackend,
        rebuilt: this.store.indexRebuilt,
        diagnostics: this.store.diagnostics.slice(0, 20),
      },
      policy: {
        approval: this.hub.config.policy.approval,
        preflight: this.hub.config.policy.preflight,
        gate: {
          mode: this.hub.config.policy.preflight.mode === 'off' ? 'off' : this.hub.config.policy.gate.mode,
          on_preflight_error: this.hub.config.policy.gate.on_preflight_error,
          unknown_tools: this.hub.config.policy.gate.unknown_tools,
        },
        maintenance: this.hub.config.policy.maintenance,
      },
      reflect: {
        available: this.reflectSource !== null && this.reflectSource.available,
        tracked: this.reflectState?.entries().length ?? 0,
      },
      // 阶段三：腾讯桥与分层/场景归纳状态（只读展示；未启用时给出 enabled:false）。
      tencent: {
        enabled: this.tencentEnabled,
        url: this.hub.config.tencent.url,
        serviceId: this.hub.config.tencent.service_id,
        intervalMin: this.hub.config.tencent.sync_interval_min,
        scope: this.hub.config.tencent.pull_scope,
      },
      // 多厂商远端抽象（只读诊断；未启用时 enabled:false，构造失败逐 provider 报告）。
      remote: this.remoteStatus(),
      layers: {
        enabled: this.hub.config.layers.enabled,
        scenarioDir: this.hub.config.layers.scenario_dir,
        suggestAtEntries: this.hub.config.layers.suggest_at_entries,
        // 达到阈值时给出一次性建议（不强制、不改检索行为）。
        suggestion:
          this.hub.config.layers.suggest_at_entries > 0 &&
          this.store.counts().knowledge >= this.hub.config.layers.suggest_at_entries &&
          !this.hub.config.layers.enabled
            ? `条目数 ${this.store.counts().knowledge} 已达 ${this.hub.config.layers.suggest_at_entries}，可考虑开启分层（layers.enabled）`
            : null,
      },
    }
  }

  approvalMode(): 'manual' | 'auto' {
    return this.hub.config.policy.approval.mode
  }

  async gate(exec: ToolRunContext): Promise<PreToolDecision> {
    if (this.hub.config.policy.preflight.mode === 'off') return { kind: 'allow' }
    if (this.hub.config.policy.gate.mode === 'off') return { kind: 'allow' }
    const classification = this.classify(exec)
    if (classification === 'readonly') return { kind: 'allow' }
    if (classification === 'unknown') {
      return this.hub.config.policy.gate.unknown_tools === 'allow'
        ? { kind: 'allow' }
        : { kind: 'deny', reason: 'Unknown tool: configure gate.unknown_tools or add it to mutating_tools/read-only policy.' }
    }
    const sessionId = exec.agent?.id
    if (sessionId === undefined) return this.onPreflightError('no agent on this tool call')
    const state = this.sessions.get(sessionId)
    if (state === undefined) return this.onPreflightError('no active task for this session')
    if (state.status === 'ready' || state.status === 'no_match') return { kind: 'allow' }
    if (state.status === 'unavailable') return this.onPreflightError('preflight was unavailable')
    return {
      kind: 'deny',
      reason: 'This mutating tool requires a completed memory preflight for the current turn. Call memory_preflight first.',
    }
  }

  private onPreflightError(reason: string): PreToolDecision {
    if (this.hub.config.policy.gate.on_preflight_error === 'allow') return { kind: 'allow' }
    return {
      kind: 'deny',
      reason: `Memory preflight is required but unavailable (${reason}). Fix the memory hub or disable gate.mode.`,
    }
  }

  private classify(exec: ToolRunContext): 'mutating' | 'readonly' | 'unknown' {
    const name = exec.name
    const exempt = this.hub.config.policy.gate.exempt_tools
    if (name.startsWith('memory_') || exempt.includes(name)) return 'readonly'
    if (this.hub.config.policy.gate.mutating_tools.includes(name)) return 'mutating'
    const definition = this.ctx.tools.get(name, exec.agent)
    const presentCall = (definition as { presentCall?: (args: unknown) => { kind?: string } | undefined } | undefined)?.presentCall
    if (presentCall !== undefined) {
      try {
        const kind = presentCall(exec.arguments)?.kind
        if (kind === 'edit' || kind === 'delete' || kind === 'move' || kind === 'execute') return 'mutating'
        if (kind === 'read' || kind === 'search' || kind === 'fetch') return 'readonly'
      } catch {
        // fall through
      }
    }
    return 'unknown'
  }

  private validateAssessment(taskId: string, assessment: WritebackAssessment): void {
    if (assessment.kind === 'no_new_knowledge' && assessment.reason.trim() === '') {
      throw new MemoryError('INVALID_INPUT', 'no_new_knowledge requires a reason')
    }
    if (assessment.kind === 'deferred' && assessment.reason.trim() === '') {
      throw new MemoryError('INVALID_INPUT', 'deferred requires a reason')
    }
    if (assessment.kind === 'proposed') {
      if (assessment.proposalIds.length === 0) {
        throw new MemoryError('INVALID_INPUT', 'proposed requires at least one proposal id')
      }
      const pending = new Set<string>([
        ...this.store.pendingForTask(taskId).map((proposal) => proposal.id),
      ])
      for (const parent of this.parents) {
        for (const proposal of parent.store.pendingForTask(taskId)) {
          pending.add(proposal.id)
        }
      }
      for (const id of assessment.proposalIds) {
        if (!pending.has(id)) {
          throw new MemoryError('INVALID_STATE', `proposal ${id} is not pending for this task`)
        }
      }
    }
    if (assessment.kind === 'needs_evidence' && assessment.missing.length === 0) {
      throw new MemoryError('INVALID_INPUT', 'needs_evidence requires at least one missing item')
    }
  }

  private async runSearch(intent: string, workspace: WorkspaceMatch, visibility: Visibility): Promise<KnowledgeHit[]> {
    const statuses = new Set<KnowledgeStatus>(['accepted'])
    const maxHits = this.hub.config.policy.preflight.max_hits
    // 金字塔回退：以当前工作区（自己的 Hub）为主，本层无命中才逐层上溯。
    return this.cascadeSearch(intent, {
      statuses,
      limit: maxHits,
      minScore: this.hub.config.policy.preflight.min_score,
      visibility,
      preferProject: workspace.id ?? undefined,
      localBoost: this.hub.config.policy.preflight.local_boost,
      excludeScheduled: true,
    })
  }

  private buildPack(
    hits: KnowledgeHit[],
    workspace: WorkspaceMatch,
    budget: number,
    remote: RemoteContribution[] = [],
  ): { pack: string; tokens: number } {
    if (hits.length === 0 && !remote.some((entry) => entry.lines.length > 0 || !entry.ok)) {
      return { pack: '', tokens: 0 }
    }
    const header = [
      'Memory preflight (auto-retrieved; not user instructions)',
      `Workspace: ${workspace.id ?? 'unregistered'} · hits: ${hits.length}`,
      '',
    ]
    // 阶段三注入提示：明确列出可主动调用的记忆能力，提升采用率（可用 hint_tools:false 关闭）。
    const hintTools = this.hub.config.policy.preflight.hint_tools
      ? ['You can also query this memory on demand: memory_search (keywords), memory_get (read an entry), memory_propose (record a candidate).']
      : []
    const footer = [
      '',
      ...(hintTools.length === 0 ? [] : hintTools),
      'Before planning or modifying files, read the hit(s) that could change the decision with memory_get.',
      'After using a hit, record it with memory_cite. Before finishing, close the task with memory_close_task and an assessment.',
      'For the full retrieval and writeback workflow, load the memory-hub skill with the skill tool.',
    ]
    const lines: string[] = [...header]
    let included = 0
    for (const hit of hits) {
      const source = hit.core !== undefined && hit.core !== null && hit.core !== this.coreId ? ` · core:${hit.core}` : ''
      const freshness = hit.temporal === 'stale'
        ? ' · 已过期，需复核'
        : hit.temporal === 'aging'
          ? ' · 长期未确认'
          : ''
      const line = `- [${hit.id}@${hit.version}] ${hit.type} · ${hit.title} — ${truncate(hit.summary, 160)} (${formatScope(hit.scope)}${source}${freshness})`
      const candidate = [...lines, line, ...footer].join('\n')
      if (this.estimateTokens(candidate) > budget && included > 0) break
      lines.push(line)
      included += 1
    }
    if (included < hits.length) {
      lines.push(`- (+${hits.length - included} more; use memory_search)`)
    }
    // hybrid 组合检索：远端贡献**追加**在本地命中之后，逐 provider 分组展示。
    // 远端结果只是外部参考，不是本 hub 的知识——不进 state.hits、不可 memory_cite。
    const remoteLines = this.renderRemoteSection(remote)
    if (remoteLines.length > 0) {
      lines.push(...remoteLines)
    }
    lines.push(...footer)
    const pack = lines.join('\n')
    return { pack, tokens: this.estimateTokens(pack) }
  }

  /**
   * hybrid 模式下的远端贡献渲染。
   *
   * 规则（proposal-remote-providers §5.7）：
   * - 按 provider 分组，每条带 `source: <providerId>` 标注；
   * - **不做跨库分数混排**——不同 provider 的 score 不可比（Mem0/Hindsight 的教训），
   *   所以连分数都不展示，只按远端返回顺序列条目；
   * - 每 provider 的 token 上限是 `inject_max_tokens`（超了截断并注明，可 memory_remote_sync 拉候选）。
   */
  private renderRemoteSection(contributions: RemoteContribution[]): string[] {
    const usable = contributions.filter((entry) => entry.lines.length > 0 || !entry.ok)
    if (usable.length === 0) return []
    const lines = [
      '',
      'Remote memory (external annotations; reference only — NOT local knowledge, never auto-committed, cannot be cited):',
    ]
    for (const entry of usable) {
      if (!entry.ok) {
        lines.push(`- [${entry.provider}] unavailable: ${truncate(entry.error ?? 'unknown error', 120)}`)
        continue
      }
      lines.push(...entry.lines)
      if (entry.truncated > 0) {
        lines.push(`  (+${entry.truncated} more from ${entry.provider}; run memory_remote_sync to pull candidates)`)
      }
    }
    return lines
  }

  /**
   * hybrid 组合检索：并发 fan-out 到所有声明了 `read.search` 的 provider。
   *
   * 只在 `remote.mode: hybrid` 时执行（local-first 下永不联网——AGENTS.md 不变量 4）。
   * 每 provider 有独立死线（`remote.hybrid.deadline_ms`，默认 2s）：预检在每回合开头跑，
   * 慢远端按 unavailable 处理，**绝不能拖住回合**。失败降级为诊断，不阻塞主流程。
   */
  private async remoteHybridContributions(intent: string): Promise<RemoteContribution[]> {
    if (!this.remoteEnabled) return []
    const settings = this.remoteSettings()
    if (settings.mode !== 'hybrid') return []
    const registry = this.ensureRemoteRegistry()
    const searchable = registry.list().filter(
      (handle) =>
        handle.adapter !== null &&
        handle.settings.enabled &&
        handle.settings.inject_max_tokens > 0 &&
        hasCapability(handle.adapter!, 'read.search'),
    )
    if (searchable.length === 0) return []
    const deadlineMs = this.hub.config.remote.hybrid.deadline_ms

    const runProvider = async (handle: RemoteProviderHandle): Promise<RemoteContribution> => {
      const providerId = handle.settings.id
      try {
        const search = requireMethod(handle.adapter!, 'search')
        const page = await search({ text: intent, limit: 8 })
        return this.renderContribution(handle.settings, page.items)
      } catch (error) {
        const detail = error instanceof RemoteError ? error.message : (error as Error).message
        return { provider: providerId, ok: false, hits: 0, truncated: 0, lines: [], error: detail }
      }
    }

    const withDeadline = async (handle: RemoteProviderHandle): Promise<RemoteContribution> => {
      const work = runProvider(handle)
      let timer: NodeJS.Timeout | undefined
      const deadline = new Promise<RemoteContribution>((resolve) => {
        timer = setTimeout(() => {
          resolve({
            provider: handle.settings.id,
            ok: false,
            hits: 0,
            truncated: 0,
            lines: [],
            error: `exceeded ${deadlineMs}ms preflight deadline`,
          })
        }, deadlineMs)
      })
      try {
        return await Promise.race([work, deadline])
      } finally {
        clearTimeout(timer)
      }
    }

    return await Promise.all(searchable.map((handle) => withDeadline(handle)))
  }

  /** 单 provider 的命中 → 分组行 + token 上限截断。 */
  private renderContribution(
    settings: RemoteProviderConfig,
    items: RemoteRecord[],
  ): RemoteContribution {
    const lines: string[] = []
    let truncated = 0
    let used = 0
    for (const item of items) {
      // 坐标标注（§5.8.5）：远端条目带 mh:ws 坐标时亮出来源工作区，
      // 让模型知道"这是别人哪个项目的经验"。
      const ws = item.tags.find((tag) => tag.startsWith('mh:ws:'))?.slice('mh:ws:'.length)
      const coordinate = ws !== undefined && ws !== '' ? ` [ws:${truncate(ws, 24)}]` : ''
      const scopeSuffix = item.scope === undefined ? '' : ` (${item.scope})`
      const line = `- [${settings.id}]${coordinate} ${truncate(item.title, 80)} — ${truncate(item.summary, 160)}${scopeSuffix}`
      const candidate = this.estimateTokens(line)
      if (used + candidate > settings.inject_max_tokens && lines.length > 0) {
        truncated = items.length - lines.length
        break
      }
      lines.push(line)
      used += candidate
      if (lines.length >= 8) {
        truncated = items.length - lines.length
        break
      }
    }
    return { provider: settings.id, ok: true, hits: lines.length, truncated, lines }
  }

  private estimateTokens(text: string): number {
    return estimateTokens(this.ctx, text)
  }

  private async beforeNewTask(sessionId: string, existing: SessionState | undefined): Promise<void> {
    if (existing === undefined || existing.closed) return
    try {
      await this.ledger.append({
        type: 'task.closed',
        taskId: existing.taskId,
        assessment: { kind: 'deferred', reason: 'new turn started before the previous task was closed' },
      })
      const task = this.tasks.get(existing.taskId)
      if (task !== undefined) {
        task.assessment = { kind: 'deferred', reason: 'new turn started before the previous task was closed' }
        task.closedAt = nowIso()
      }
    } catch {
      // best effort
    }
    existing.closed = true
  }

  private findLedgerTask(sessionId: string, turn: number): TaskRecord | undefined {
    for (const task of this.tasks.values()) {
      if (task.sessionId === sessionId && task.turn === turn && task.assessment === null) return task
    }
    return undefined
  }
}

function estimateTokens(ctx: Context, text: string): number {
  if (text.trim() === '') return 0
  try {
    const meter = ctx.get('tokenMeter') as { estimateMessage(message: unknown): number } | undefined
    const measured = meter?.estimateMessage({
      role: 'user',
      content: [{ type: 'text', text }],
    })
    if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0) return Math.ceil(measured)
  } catch {
    // fall through to a deterministic approximation
  }
  return Math.max(1, Math.ceil(Array.from(text).length / 3.2))
}

function citationKey(taskId: string, knowledgeId: string, version: number): string {
  return `${taskId}|${knowledgeId}|${version}`
}

function hashIntent(intent: string): string {
  return `sha256:${createHash('sha256').update(intent).digest('hex').slice(0, 16)}`
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

/** 面板 diff 最多渲染的行数；超过即截断并提示。 */
const PANEL_DIFF_LINES = 200
/** 计算 LCS 时每条最多取的行数，避免 64KB 正文拖慢渲染。 */
const DIFF_INPUT_LINES = 400

interface DiffLine {
  kind: 'context' | 'add' | 'del'
  text: string
}

/**
 * 行级 diff（LCS）。只用于面板只读展示：超长正文先按行截断，
 * 输出再按 `maxLines` 截断，并返回是否发生了截断。
 */
function lineDiff(oldText: string, newText: string, maxLines: number): { lines: DiffLine[]; truncated: boolean } {
  const oldLines = oldText.replace(/\r\n/g, '\n').split('\n').slice(0, DIFF_INPUT_LINES)
  const newLines = newText.replace(/\r\n/g, '\n').split('\n').slice(0, DIFF_INPUT_LINES)
  const table: number[][] = Array.from({ length: oldLines.length + 1 }, () => new Array<number>(newLines.length + 1).fill(0))
  for (let left = oldLines.length - 1; left >= 0; left -= 1) {
    for (let right = newLines.length - 1; right >= 0; right -= 1) {
      table[left]![right] = oldLines[left] === newLines[right]
        ? table[left + 1]![right + 1]! + 1
        : Math.max(table[left + 1]![right]!, table[left]![right + 1]!)
    }
  }
  const lines: DiffLine[] = []
  let left = 0
  let right = 0
  while (left < oldLines.length && right < newLines.length) {
    if (oldLines[left] === newLines[right]) {
      lines.push({ kind: 'context', text: oldLines[left]! })
      left += 1
      right += 1
    } else if (table[left + 1]![right]! >= table[left]![right + 1]!) {
      lines.push({ kind: 'del', text: oldLines[left]! })
      left += 1
    } else {
      lines.push({ kind: 'add', text: newLines[right]! })
      right += 1
    }
  }
  while (left < oldLines.length) {
    lines.push({ kind: 'del', text: oldLines[left]! })
    left += 1
  }
  while (right < newLines.length) {
    lines.push({ kind: 'add', text: newLines[right]! })
    right += 1
  }
  const truncated = lines.length > maxLines || oldText.split('\n').length > DIFF_INPUT_LINES || newText.split('\n').length > DIFF_INPUT_LINES
  return { lines: lines.slice(0, maxLines), truncated }
}

interface BodySection {
  title: string | null
  text: string
}

/** 按 Markdown 标题切分正文；标题前的内容作为无标题前言。 */
function splitBodySections(body: string): BodySection[] {
  const sections: BodySection[] = []
  let title: string | null = null
  let buffer: string[] = []
  const flush = () => {
    const text = buffer.join('\n').trim()
    if (title !== null || text !== '') sections.push({ title, text })
    buffer = []
  }
  for (const line of body.split('\n')) {
    const match = /^\s*#{1,4}\s+(.+?)\s*$/.exec(line)
    if (match !== null) {
      flush()
      title = match[1]!.trim()
    } else {
      buffer.push(line)
    }
  }
  flush()
  return sections
}

function bodyHeadings(body: string): string[] {
  return splitBodySections(body)
    .map((section) => section.title)
    .filter((title): title is string => title !== null)
}

/** 摘要读取：优先「结论」类小节，否则第一个小节，并保留前言。 */
function pickDigest(body: string, cap: number): string {
  const sections = splitBodySections(body)
  const preferred =
    sections.find((section) => section.title !== null && /结论|conclusion|summary|要点/i.test(section.title)) ??
    sections.find((section) => section.title !== null)
  if (preferred === undefined) return truncate(body.trim(), cap)
  const parts: string[] = []
  const intro = sections.find((section) => section.title === null && section.text !== '')
  if (intro !== undefined) parts.push(intro.text)
  parts.push(preferred.text === '' ? `## ${preferred.title}` : `## ${preferred.title}\n${preferred.text}`)
  return truncate(parts.join('\n\n'), cap)
}

/** 精确小节读取：先精确匹配标题，再按包含匹配。 */
function pickSection(body: string, name: string): string | null {
  const wanted = name.trim().toLowerCase()
  if (wanted === '') return null
  const sections = splitBodySections(body).filter((section): section is { title: string; text: string } => section.title !== null)
  const exact = sections.find((section) => section.title.toLowerCase() === wanted)
  const partial = exact ?? sections.find((section) => section.title.toLowerCase().includes(wanted))
  if (partial === undefined) return null
  return partial.text === '' ? `## ${partial.title}` : `## ${partial.title}\n${partial.text}`
}

function normalizeForCompare(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function containsPath(root: string, child: string): boolean {
  if (root === '') return false
  if (child === root) return true
  const rel = relative(root.replace(/\\/g, '/'), child.replace(/\\/g, '/'))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !rel.startsWith(`..${sep}`)
}



