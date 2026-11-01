import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import { MemoryError } from './errors.js'
import type { Hub } from './hub.js'
import type { Ledger, LedgerState } from './ledger.js'
import { KnowledgeStore } from './store.js'
import { newCitationId, newPreflightId, newTaskId } from './ids.js'
import { formatScope, isScopeVisible, parseScope, visibilityFor } from './scope.js'
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

export const PLUGIN_VERSION = '0.1.1'

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

interface RuntimeOptions {
  ctx: Context
  hub: Hub
  store: KnowledgeStore
  ledger: Ledger
  ledgerState: LedgerState
}

export class MemoryService {
  private readonly ctx: Context
  private readonly hub: Hub
  private readonly store: KnowledgeStore
  private readonly ledger: Ledger
  private readonly sessions = new Map<string, SessionState>()
  private readonly tasks: Map<string, TaskRecord>
  private readonly citationKeys = new Set<string>()
  private readonly citations: CitationRecord[]

  constructor(options: RuntimeOptions) {
    this.ctx = options.ctx
    this.hub = options.hub
    this.store = options.store
    this.ledger = options.ledger
    this.tasks = options.ledgerState.tasks
    this.citations = options.ledgerState.citations
    for (const citation of this.citations) {
      this.citationKeys.add(citationKey(citation.taskId, citation.knowledgeId, citation.version))
    }
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
    }
    let bestLength = -1
    for (const workspace of this.hub.config.workspaces) {
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
        match = {
          id: workspace.id,
          root,
          domains: workspace.domains,
          admin: workspace.admin,
          path: resolved,
          registered: true,
        }
      }
    }
    return match
  }

  visibilityFor(workspace: WorkspaceMatch): Visibility {
    return visibilityFor(workspace.id, workspace.domains)
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
    const raw = this.store.search(args.query, { visibility, statuses, types, limit: scopeFilter === null ? limit : 20 })
    const filtered = scopeFilter === null ? raw : raw.filter((hit) => formatScope(hit.scope) === scopeFilter).slice(0, limit)
    return {
      hits: filtered.map((hit) => ({ ...hit, path: KnowledgeStore.relativePath(this.hub.root, hit.path) })),
      total: filtered.length,
    }
  }

  async get(agent: AgentLike, id: string, version?: number): Promise<{
    metadata: Omit<KnowledgeRecord, 'body' | 'path' | 'extra'>
    body: string
    path: string
  }> {
    const workspace = await this.resolveWorkspace(agent)
    const visibility = this.visibilityFor(workspace)
    const record = await this.store.get(id, version)
    if (record === null) {
      throw new MemoryError('NOT_FOUND', `knowledge ${id}${version === undefined ? '' : `@${version}`} does not exist`)
    }
    if (!isScopeVisible(record.scope, visibility)) {
      throw new MemoryError('SCOPE_FORBIDDEN', `knowledge ${id} is not visible from this workspace`)
    }
    if (record.status === 'rejected') {
      throw new MemoryError('NOT_FOUND', `knowledge ${id} was rejected and is not readable through the API`)
    }
    const { body, path, extra: _extra, ...metadata } = record
    void _extra
    return {
      metadata,
      body,
      path: KnowledgeStore.relativePath(this.hub.root, path),
    }
  }

  async cite(agent: AgentLike, args: {
    knowledge_id: string
    version?: number
    purpose: string
    task_id?: string
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
    const record = await this.store.get(args.knowledge_id, args.version)
    if (record === null) throw new MemoryError('NOT_FOUND', `knowledge ${args.knowledge_id} does not exist`)
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
    })
    this.citationKeys.add(key)
    this.citations.push({
      id: citationId,
      taskId: state.taskId,
      knowledgeId: record.id,
      version: record.version,
      purpose,
      createdAt: nowIso(),
    })
    return { citationId }
  }

  async propose(agent: AgentLike, args: ProposeArgs): Promise<{ proposalId: string; pendingPath: string }> {
    const state = this.sessions.get(agent.id)
    if (state === undefined) throw new MemoryError('NO_TASK', 'no open task for this session')
    if (state.closed) throw new MemoryError('INVALID_STATE', 'task is already closed')
    const scope = parseScope(args.scope)
    if (!isScopeVisible(scope, state.visibility)) {
      throw new MemoryError('SCOPE_FORBIDDEN', `scope ${args.scope} is not visible from this workspace`)
    }
    const pending = this.store.pendingForTask(state.taskId)
    if (pending.length >= this.hub.config.policy.limits.max_pending_per_task) {
      throw new MemoryError('INVALID_STATE', `task already has ${pending.length} pending proposals`)
    }
    const duplicate = pending.find(
      (proposal) =>
        proposal.operation === args.operation &&
        proposal.type === args.type &&
        formatScope(proposal.scope) === formatScope(scope) &&
        proposal.title === args.title.trim() &&
        proposal.target === (args.target ?? null),
    )
    if (duplicate !== undefined) {
      return {
        proposalId: duplicate.id,
        pendingPath: KnowledgeStore.relativePath(this.hub.root, duplicate.path),
      }
    }

    const proposal = await this.store.propose(
      {
        operation: args.operation,
        type: args.type,
        scope: args.scope,
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
    await this.ledger.append({ type: 'proposal.created', taskId: state.taskId, proposalId: proposal.id })
    return {
      proposalId: proposal.id,
      pendingPath: KnowledgeStore.relativePath(this.hub.root, proposal.path),
    }
  }

  async commit(agent: AgentLike, proposalId: string): Promise<{
    knowledgeId: string
    version: number
    status: KnowledgeStatus
    superseded: string[]
  }> {
    const proposal = this.store.getProposal(proposalId)
    if (proposal === null) throw new MemoryError('NOT_FOUND', `proposal ${proposalId} does not exist`)
    const workspace = await this.resolveWorkspace(agent)
    const visibility = this.visibilityFor(workspace)
    if (!isScopeVisible(proposal.scope, visibility) && !workspace.admin) {
      throw new MemoryError('SCOPE_FORBIDDEN', `proposal ${proposalId} targets a scope not visible from this workspace`)
    }
    const precheck = this.precheckCommit(proposal)
    if (!precheck.ok) throw new MemoryError(precheck.code, precheck.reason)
    const result = await this.store.commit(proposalId)
    return {
      knowledgeId: result.record.id,
      version: result.record.version,
      status: result.record.status,
      superseded: result.superseded,
    }
  }

  precheckCommit(proposal: ProposalRecord): { ok: true } | { ok: false; code: 'INVALID_STATE' | 'INVALID_INPUT' | 'VERSION_CONFLICT' | 'NOT_FOUND' | 'SCOPE_FORBIDDEN'; reason: string } {    if (proposal.status !== 'pending') {
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
      const target = this.store.docs.get(proposal.target)
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
      const old = this.store.docs.get(oldId)
      if (old === undefined || old.status !== 'accepted') {
        return { ok: false, code: 'INVALID_STATE', reason: `supersedes target ${oldId} is not accepted` }
      }
    }
    return { ok: true }
  }

  precheckProposal(proposalId: string): { ok: true } | { ok: false; code: string; reason: string } {
    const proposal = this.store.getProposal(proposalId)
    if (proposal === null) {
      return { ok: false, code: 'NOT_FOUND', reason: `proposal ${proposalId} does not exist` }
    }
    return this.precheckCommit(proposal)
  }

  describeCommit(proposalId: string): { reason: string; displayReason: { en: string; zh: string } } {
    const proposal = this.store.getProposal(proposalId)
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
    const workspaceIds = args.workspace_ids ?? this.hub.config.workspaces.filter((entry) => entry.enabled).map((entry) => entry.id)
    for (const id of workspaceIds) {
      if (!this.hub.config.workspaces.some((entry) => entry.id === id && entry.enabled)) {
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

  overview(): Record<string, unknown> {
    const knowledge = [...this.store.docs.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 200)
      .map((record) => ({
        id: record.id,
        type: record.type,
        status: record.status,
        version: record.version,
        title: record.title,
        summary: record.summary,
        scope: formatScope(record.scope),
        updatedAt: record.updatedAt,
      }))
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
        assessment: task.assessment,
      }))
    return {
      version: PLUGIN_VERSION,
      initialized: true,
      root: this.hub.displayRoot(),
      readOnly: this.hub.readOnly,
      readOnlyReason: this.hub.readOnlyReason,
      configError: this.hub.configError,
      counts: this.store.counts(),
      index: {
        documents: this.store.index.size,
        diagnostics: this.store.diagnostics.slice(0, 20),
      },
      workspaces: this.hub.config.workspaces.map((workspace) => ({
        id: workspace.id,
        root: workspace.root,
        domains: workspace.domains,
        admin: workspace.admin,
        enabled: workspace.enabled,
      })),
      policy: {
        preflight: this.hub.config.policy.preflight,
        gate: this.hub.config.policy.gate,
        evidence: this.hub.config.policy.evidence,
      },
      knowledge,
      pending,
      tasks,
      generatedAt: nowIso(),
    }
  }

  knowledgeDetail(id: string): {
    metadata: Record<string, unknown>
    body: string
    path: string
  } | null {
    const record = this.store.docs.get(id)
    if (record === undefined) return null
    const { body, path, extra: _extra, scope, ...rest } = record
    void _extra
    return {
      metadata: { ...rest, scope: formatScope(scope) },
      body,
      path: KnowledgeStore.relativePath(this.hub.root, path),
    }
  }

  status(agent?: AgentLike): Record<string, unknown> {
    const workspace = agent === undefined ? null : this.sessions.get(agent.id)?.workspace ?? null
    return {
      version: PLUGIN_VERSION,
      initialized: true,
      root: this.hub.displayRoot(),
      readOnly: this.hub.readOnly,
      readOnlyReason: this.hub.readOnlyReason,
      configError: this.hub.configError,
      workspace: workspace === null
        ? null
        : { id: workspace.id, root: workspace.root, domains: workspace.domains, registered: workspace.registered },
      counts: this.store.counts(),
      index: {
        documents: this.store.index.size,
        diagnostics: this.store.diagnostics.slice(0, 20),
      },
      policy: {
        preflight: this.hub.config.policy.preflight,
        gate: {
          mode: this.hub.config.policy.preflight.mode === 'off' ? 'off' : this.hub.config.policy.gate.mode,
          on_preflight_error: this.hub.config.policy.gate.on_preflight_error,
          unknown_tools: this.hub.config.policy.gate.unknown_tools,
        },
      },
    }
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
      const pending = new Set(this.store.pendingForTask(taskId).map((proposal) => proposal.id))
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
    return this.store.search(intent, {
      visibility,
      statuses: new Set<KnowledgeStatus>(['accepted']),
      limit: this.hub.config.policy.preflight.max_hits,
    })
  }

  private buildPack(hits: KnowledgeHit[], workspace: WorkspaceMatch, budget: number): { pack: string; tokens: number } {
    if (hits.length === 0) return { pack: '', tokens: 0 }
    const header = [
      'Memory preflight (auto-retrieved; not user instructions)',
      `Workspace: ${workspace.id ?? 'unregistered'} · hits: ${hits.length}`,
      '',
    ]
    const footer = ['', 'Use memory_get for details; call memory_cite after actually using an entry.']
    const lines: string[] = [...header]
    let included = 0
    for (const hit of hits) {
      const line = `- [${hit.id}@${hit.version}] ${hit.type} · ${hit.title} — ${truncate(hit.summary, 160)} (${formatScope(hit.scope)})`
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
