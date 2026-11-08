import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
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
  Visibility,
  WorkspaceMatch,
  WritebackAssessment,
} from './types.js'
import type { AgentLike, Context, PreToolDecision, ToolRunContext, WorkingDirectoryService } from './host.js'

export const PLUGIN_VERSION = packageJson.version

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

  constructor(options: RuntimeOptions) {
    this.ctx = options.ctx
    this.hub = options.hub
    this.store = options.store
    this.ledger = options.ledger
    this.customWorkspaces = options.workspaces
    this.coreId = options.coreId ?? null
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
      const { pack, tokens } = this.buildPack(preflight, workspace, this.hub.config.policy.preflight.pack_tokens)
      const status: PreflightStatus = preflight.length === 0 ? 'no_match' : 'ready'
      const preflightId = newPreflightId()
      await this.ledger.append({
        type: 'preflight.recorded',
        taskId,
        preflightId,
        status,
        hits: preflight.map((hit) => ({ id: hit.id, version: hit.version })),
        tokens,
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
        const { pack, tokens } = this.buildPack(hits, workspace, this.hub.config.policy.preflight.pack_tokens)
        const status: PreflightStatus = hits.length === 0 ? 'no_match' : 'ready'
        const preflightId = newPreflightId()
        await this.ledger.append({
          type: 'preflight.recorded',
          taskId,
          preflightId,
          status,
          hits: hits.map((hit) => ({ id: hit.id, version: hit.version })),
          tokens,
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
    const { pack, tokens } = this.buildPack(preflight, state.workspace, this.hub.config.policy.preflight.pack_tokens)
    const status: PreflightStatus = preflight.length === 0 ? 'no_match' : 'ready'
    const preflightId = newPreflightId()
    await this.ledger.append({
      type: 'preflight.recorded',
      taskId: state.taskId,
      preflightId,
      status,
      hits: preflight.map((hit) => ({ id: hit.id, version: hit.version })),
      tokens,
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
      const raw = this.store.search(args.query, { visibility, statuses, types, limit: 20 })
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
    })
    if (own.length > 0) return own.slice(0, options.limit)
    for (const parent of this.parents) {
      const levelHits = this.ancestorLevelSearch(query, parent, {
        statuses: options.statuses,
        types: options.types,
        limit: options.limit,
        minScore: options.minScore,
        scopeFilter: null,
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
    metadata: Omit<KnowledgeRecord, 'body' | 'path' | 'extra'>
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
    let resolved: { record: KnowledgeRecord; core: string | null; root: string } | null
    if (core !== undefined && core !== '') {
      const store = this.storeForCore(core)
      if (store === null) {
        throw new MemoryError('NOT_FOUND', `knowledge ${id} does not exist in core ${core}`)
      }
      const record = await store.store.get(id, version)
      resolved = record === null ? null : { record, core: store.coreId, root: store.hub.root }
    } else {
      resolved = await this.resolveRecordForRead(id, version)
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
      metadata,
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
    return { citationId }
  }

  async propose(agent: AgentLike, args: ProposeArgs): Promise<{
    proposalId: string
    pendingPath: string
    core: string | null
    scope: string
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
      },
      { taskId: state.taskId },
    )
    await (target === null ? this.ledger : target.ledger).append({
      type: 'proposal.created',
      taskId: state.taskId,
      proposalId: proposal.id,
    })
    return {
      proposalId: proposal.id,
      pendingPath: KnowledgeStore.relativePath(owningHub.root, proposal.path),
      core: owningCoreId,
      scope: formattedScope,
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
      citations: new Set(this.citations.map((citation) => citation.knowledgeId)),
      stalePendingDays,
      staleCitationDays,
      ...(args.now === undefined ? {} : { now: args.now }),
      maxBodyBytes: this.hub.config.policy.limits.max_body_bytes,
    })

    const taskId = newMaintenanceTaskId()
    const created: ProposalRecord[] = []
    const errors: string[] = []
    let skipped = 0
    let truncated = 0

    if (apply === 'propose' && this.hub.readOnly) {
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
    interface KnowledgeRow {
      id: string
      type: KnowledgeType
      status: KnowledgeStatus
      version: number
      title: string
      summary: string
      scope: string
      updatedAt: string
      core?: string | null
    }
    const describe = (record: KnowledgeRecord, core?: string | null): KnowledgeRow => ({
      id: record.id,
      type: record.type,
      status: record.status,
      version: record.version,
      title: record.title,
      summary: record.summary,
      scope: formatScope(record.scope),
      updatedAt: record.updatedAt,
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
        parentKnowledge.push(describe(record, coreId))
      }
    }
    // 金字塔面板：自己的 Hub 在前，随后按 近→远 是各祖先层，层内按更新时间倒序。
    const tierOf = (row: KnowledgeRow): number =>
      row.core === undefined || row.core === null ? 0 : this.parentCoreIds.indexOf(row.core) + 1
    const knowledge = [...ownKnowledge, ...parentKnowledge]
      .sort((left, right) => tierOf(left) - tierOf(right) || right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 200)
    const pending = [...this.store.proposals.values()]
      .filter((proposal) => proposal.status === 'pending')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((proposal) => ({
        id: proposal.id,
        operation: proposal.operation,
        type: proposal.type,
        title: proposal.title,
        summary: proposal.summary,
        scope: formatScope(proposal.scope),
        taskId: proposal.taskId,
        createdAt: proposal.createdAt,
      }))
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
      },
      knowledge,
      pending,
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
    if (record === undefined && core !== undefined && core !== '') {
      const target = this.storeForCore(core)
      record = target?.store.docs.get(id)
      if (target !== null && record !== undefined) root = target.hub.root
    }
    if (record === undefined) return null
    const { body, path, extra: _extra, scope, ...rest } = record
    void _extra
    return {
      metadata: { ...rest, scope: formatScope(scope) },
      body,
      path: KnowledgeStore.relativePath(root, path),
    }
  }

  config(): Record<string, unknown> {
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
    }
  }

  async updateConfig(patch: { core_workspaces?: unknown; workspaces?: unknown }): Promise<Record<string, unknown>> {
    if (!this.hub.canWriteConfig()) {
      throw new MemoryError('INVALID_STATE', this.hub.readOnlyReason ?? 'memory hub is read-only')
    }

    const core_workspaces = Array.isArray(patch.core_workspaces) ? patch.core_workspaces : this.hub.config.core_workspaces
    const workspaces = Array.isArray(patch.workspaces) ? patch.workspaces : this.hub.config.workspaces

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
    })

    try {
      const configPath = this.hub.configPath()
      if (configPath === null) {
        throw new MemoryError('INVALID_STATE', 'data hub has no config source')
      }
      await writeAtomic(configPath, stringifyYaml(next))
      await this.hub.reloadConfig()
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
    })
  }

  private buildPack(hits: KnowledgeHit[], workspace: WorkspaceMatch, budget: number): { pack: string; tokens: number } {
    if (hits.length === 0) return { pack: '', tokens: 0 }
    const header = [
      'Memory preflight (auto-retrieved; not user instructions)',
      `Workspace: ${workspace.id ?? 'unregistered'} · hits: ${hits.length}`,
      '',
    ]
    const footer = [
      '',
      'Before planning or modifying files, read the hit(s) that could change the decision with memory_get.',
      'After using a hit, record it with memory_cite. Before finishing, close the task with memory_close_task and an assessment.',
      'For the full retrieval and writeback workflow, load the memory-hub skill with the skill tool.',
    ]
    const lines: string[] = [...header]
    let included = 0
    for (const hit of hits) {
      const source = hit.core !== undefined && hit.core !== null && hit.core !== this.coreId ? ` · core:${hit.core}` : ''
      const line = `- [${hit.id}@${hit.version}] ${hit.type} · ${hit.title} — ${truncate(hit.summary, 160)} (${formatScope(hit.scope)}${source})`
      const candidate = [...lines, line, ...footer].join('\n')
      if (this.estimateTokens(candidate) > budget && included > 0) break
      lines.push(line)
      included += 1
    }
    if (included < hits.length) {
      lines.push(`- (+${hits.length - included} more; use memory_search)`)
    }
    lines.push(...footer)
    const pack = lines.join('\n')
    return { pack, tokens: this.estimateTokens(pack) }
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
