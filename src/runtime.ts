import { watch, type FSWatcher } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { readTextOrNull, writeAtomic } from './atomic.js'
import { expandHome, Hub, resolveHubRoot } from './hub.js'
import { KnowledgeStore } from './store.js'
import { Ledger } from './ledger.js'
import { MemoryError } from './errors.js'
import { MemoryService, PLUGIN_VERSION } from './service.js'
import { localDateKey, maintenanceDue } from './maintenance-schedule.js'
import { createTools, type MaintenanceToolArgs, type ToolHost } from './tools.js'
import { registerMemorySkill } from './skill.js'
import type { MemoryConfig, WorkspaceConfig } from './config.js'
import type {
  AgentLike,
  Context,
  CreatedPayload,
  DisposedPayload,
  HttpRequestLike,
  HttpResponseLike,
  PreStepDecision,
  PreStepPayload,
  ToolRunContext,
  TurnStoppingPayload,
  UserMessage,
  WebServerService,
} from './host.js'

const pluginConfigSchema = z.object({
  root: z.string().optional(),
  readOnly: z.boolean().optional(),
}).passthrough()

const AGENT_CONTEXT_NAME = 'memory:pack'
const AGENT_CONTEXT_ORDER = 130

interface ServicePack {
  hub: Hub
  store: KnowledgeStore
  ledger: Ledger
  service: MemoryService
  workspaces: WorkspaceConfig[]
  coreId: string | null
}

export class MemoryRuntime implements ToolHost {
  private readonly ctx: Context
  private readonly config: { root?: string; readOnly?: boolean }
  private readonly disposers: Array<() => void> = []
  private readonly agentDisposers = new Map<string, () => void>()
  private configHub: Hub | null = null
  private fallback: ServicePack | null = null
  private readonly cores = new Map<string, ServicePack>()
  private initError: Error | null = null
  private readonly watchHandles = new Map<string, FSWatcher>()
  private readonly watchTimers = new Map<string, NodeJS.Timeout>()
  private started = false
  private disposed = false
  private maintenanceTimer: NodeJS.Timeout | null = null
  private maintenanceRunning = false
  private maintenanceLastDate: string | null = null
  private readonly ready: Promise<void>
  private resolveReady: (() => void) | null = null

  constructor(ctx: Context, config: unknown) {
    this.ctx = ctx
    const parsed = pluginConfigSchema.safeParse(config ?? {})
    this.config = parsed.success ? parsed.data : {}
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve
    })
  }

  register(): void {
    const host: ToolHost = this
    for (const definition of createTools(host)) {
      try {
        this.disposers.push(this.ctx.tools.register(definition))
      } catch (error) {
        this.ctx.logger.warn(`dsh-memory-hub: cannot register ${definition.name}: ${(error as Error).message}`)
      }
    }

    this.registerSkill()
    this.listen('agent/created', this.onAgentCreated)
    this.listen('agent/pre-step', this.onPreStep)
    this.listen('agent/turn-stopping', this.onTurnStopping)
    this.listen('agent/disposed', this.onAgentDisposed)
    this.listen('tools/pre-execute', this.onPreExecute)
    this.registerHttpRoutes()
    try {
      this.ctx.inject(['clientModules'], () => this.warmClientModule())
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: client module injection failed: ${(error as Error).message}`)
    }
    this.disposers.push(() => {
      for (const dispose of this.agentDisposers.values()) {
        try {
          dispose()
        } catch {
          // ignore
        }
      }
      this.agentDisposers.clear()
    })
  }

  private registerSkill(): void {
    try {
      this.ctx.inject(['skills'], (skillsCtx) => {
        if (this.disposed) return
        try {
          const dispose = registerMemorySkill(skillsCtx)
          if (dispose !== null) this.disposers.push(dispose)
        } catch (error) {
          this.ctx.logger.warn(`dsh-memory-hub: cannot register memory-hub skill: ${(error as Error).message}`)
        }
      })
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: skills injection failed: ${(error as Error).message}`)
    }
  }

  private listen(name: string, listener: (...args: any[]) => unknown): void {
    try {
      this.disposers.push(this.ctx.on(name, listener))
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: cannot listen to ${name}: ${(error as Error).message}`)
    }
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    try {
      const configRoot = this.config.root ?? ''
      const configHub = await Hub.open({ root: configRoot, readOnly: this.config.readOnly === true })
      this.configHub = configHub

      const globalConfig = configHub.config
      this.fallback = await this.openServicePack(configHub, globalConfig, this.standaloneWorkspaces(globalConfig), null)

      for (const core of globalConfig.core_workspaces) {
        if (core.root === undefined) continue
        const root = resolve(expandHome(core.root))
        const dataHub = await Hub.open({
          root,
          readOnly: configHub.readOnly,
          config: globalConfig,
          configPath: configHub.configPath() ?? undefined,
        })
        const pack = await this.openServicePack(
          dataHub,
          globalConfig,
          this.coreWorkspaces(globalConfig, core.id, root),
          core.id,
        )
        this.cores.set(core.id, pack)
      }

      this.registerExistingAgents()
      this.warmClientModule()
      this.startWatcher()
      this.startMaintenanceTimer()
      const total = this.fallback.store.docs.size + [...this.cores.values()].reduce((sum, pack) => sum + pack.store.docs.size, 0)
      this.ctx.logger.info(
        `dsh-memory-hub ${PLUGIN_VERSION} ready with ${this.cores.size} core hub(s) and fallback (${total} entries)`,
      )
    } catch (error) {
      this.initError = error instanceof Error ? error : new Error(String(error))
      this.ctx.logger.error(`dsh-memory-hub: initialization failed: ${this.initError.message}`)
    } finally {
      if (this.disposed) {
        await this.dispose()
      }
      this.resolveReady?.()
      this.resolveReady = null
    }
  }

  async service(agent: AgentLike): Promise<MemoryService> {
    await this.ready
    if (this.initError !== null) {
      throw new MemoryError('NOT_CONFIGURED', `memory hub initialization failed: ${this.initError.message}`)
    }
    const pack = this.serviceFor(agent)
    if (pack === null) {
      throw new MemoryError('NOT_CONFIGURED', 'no memory hub matches the current workspace')
    }
    return pack.service
  }

  status(agent?: AgentLike): Record<string, unknown> {
    if (this.initError !== null) {
      return {
        version: PLUGIN_VERSION,
        initialized: false,
        error: this.initError.message,
        root: this.configHub?.displayRoot() ?? null,
        readOnly: this.configHub?.readOnly ?? null,
        readOnlyReason: this.configHub?.readOnlyReason ?? null,
      }
    }
    if (agent === undefined) {
      return this.fallback?.service.status() ?? { version: PLUGIN_VERSION, initialized: false }
    }
    const pack = this.serviceFor(agent)
    if (pack === null) return { version: PLUGIN_VERSION, initialized: false, error: 'no matching hub' }
    return pack.service.status(agent)
  }

  private startMaintenanceTimer(): void {
    if (this.configHub === null) return
    // Keep the timer alive even when disabled so enabling it in config.yaml
    // takes effect without a plugin reload; runScheduledMaintenance checks the flag.
    const tick = (): void => {
      void this.runScheduledMaintenance()
    }
    const timer = setInterval(tick, 60_000)
    timer.unref?.()
    this.maintenanceTimer = timer
    this.disposers.push(() => {
      if (this.maintenanceTimer !== null) {
        clearInterval(this.maintenanceTimer)
        this.maintenanceTimer = null
      }
    })
    tick()
  }

  private async runScheduledMaintenance(): Promise<void> {
    if (this.disposed || this.maintenanceRunning || this.configHub === null) return
    const policy = this.configHub.config.policy.maintenance
    if (policy.enabled !== true) return
    const now = new Date()
    if (!maintenanceDue(policy.time, now)) return
    const today = localDateKey(now)
    if (this.maintenanceLastDate === today) return
    const last = await this.readMaintenanceState()
    if (last === today) {
      this.maintenanceLastDate = today
      return
    }

    this.maintenanceRunning = true
    try {
      const packs = policy.all_cores
        ? [...this.cores.values(), ...(this.fallback === null ? [] : [this.fallback])]
        : this.fallback === null
          ? []
          : [this.fallback]
      const seen = new Set<string>()
      for (const pack of packs) {
        const key = pack.hub.root.replace(/\\/g, '/').toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        try {
          await pack.service.maintenance({
            admin: true,
            coreId: pack.coreId,
            apply: policy.apply,
            maxProposals: policy.max_proposals,
            stalePendingDays: policy.stale_pending_days,
            staleCitationDays: policy.stale_citation_days,
          })
        } catch (error) {
          this.ctx.logger.warn(
            `dsh-memory-hub: scheduled maintenance failed for ${pack.coreId ?? pack.hub.displayRoot()}: ${(error as Error).message}`,
          )
        }
      }
      this.maintenanceLastDate = today
      await writeAtomic(this.maintenanceStatePath(), JSON.stringify({ lastRunDate: today, completedAt: now.toISOString() }, null, 2))
      this.ctx.logger.info(`dsh-memory-hub: scheduled maintenance completed for ${today}`)
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: cannot record maintenance state: ${(error as Error).message}`)
    } finally {
      this.maintenanceRunning = false
    }
  }

  private maintenanceStatePath(): string {
    return join(this.configHub?.root ?? '', 'records', 'maintenance-state.json')
  }

  private async readMaintenanceState(): Promise<string | null> {
    try {
      const raw = await readTextOrNull(this.maintenanceStatePath())
      if (raw === null) return null
      const parsed = JSON.parse(raw) as { lastRunDate?: unknown }
      return typeof parsed.lastRunDate === 'string' ? parsed.lastRunDate : null
    } catch {
      return null
    }
  }

  async maintenance(agent: AgentLike, args: MaintenanceToolArgs): Promise<unknown> {
    await this.ready
    if (this.initError !== null) {
      throw new MemoryError('NOT_CONFIGURED', `memory hub initialization failed: ${this.initError.message}`)
    }
    const current = this.serviceFor(agent)
    if (current === null) throw new MemoryError('NOT_CONFIGURED', 'no memory hub matches the current workspace')
    const workspace = await current.service.resolveWorkspace(agent)
    if (!workspace.admin) {
      throw new MemoryError('SCOPE_FORBIDDEN', 'memory maintenance requires an admin workspace')
    }

    const allCores = args.all_cores !== false
    const packs = allCores
      ? [...this.cores.values(), ...(this.fallback === null ? [] : [this.fallback])]
      : [current]
    const seen = new Set<string>()
    const hubs: unknown[] = []
    for (const pack of packs) {
      const key = pack.hub.root.replace(/\\/g, '/').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      try {
        hubs.push(
          await pack.service.maintenance({
            admin: true,
            coreId: pack.coreId,
            ...(args.apply === undefined ? {} : { apply: args.apply }),
            ...(args.max_proposals === undefined ? {} : { maxProposals: args.max_proposals }),
            ...(args.stale_pending_days === undefined ? {} : { stalePendingDays: args.stale_pending_days }),
            ...(args.stale_citation_days === undefined ? {} : { staleCitationDays: args.stale_citation_days }),
          }),
        )
      } catch (error) {
        hubs.push({
          coreId: pack.coreId,
          root: pack.hub.displayRoot(),
          error: (error as Error).message,
        })
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      allCores,
      hubs,
    }
  }

  private async openServicePack(
    hub: Hub,
    config: MemoryConfig,
    workspaces: WorkspaceConfig[],
    coreId: string | null,
  ): Promise<ServicePack> {
    const ledger = new Ledger(hub.ledgerPath())
    const ledgerState = await ledger.load({ repair: !hub.readOnly })
    const store = new KnowledgeStore(hub, ledger)
    await store.load()
    const service = new MemoryService({
      ctx: this.ctx,
      hub,
      store,
      ledger,
      ledgerState,
      workspaces,
    })
    return { hub, store, ledger, service, workspaces, coreId }
  }

  private standaloneWorkspaces(config: MemoryConfig): WorkspaceConfig[] {
    return config.workspaces.filter((workspace) => !workspace.core_id)
  }

  private coreWorkspaces(config: MemoryConfig, coreId: string, coreRoot: string): WorkspaceConfig[] {
    const subWorkspaces = config.workspaces.filter((workspace) => workspace.core_id === coreId)
    const coreWorkspace: WorkspaceConfig = {
      id: coreId,
      root: coreRoot,
      domains: [],
      admin: false,
      enabled: true,
    }
    if (subWorkspaces.length === 0) {
      // 没有子工作区时，核心仓本身作为一个项目作用域。
      return [coreWorkspace]
    }
    // 有子工作区时，核心仓本身也作为可见的项目作用域，让子工作区能反向查找主仓知识。
    return [coreWorkspace, ...subWorkspaces]
  }

  private getWorkingDirectory(agent?: AgentLike): string {
    let directory = ''
    try {
      const workingDirectory = this.ctx.get('workingDirectory') as { get: (session: { id: string }) => string } | undefined
      if (workingDirectory !== undefined && agent !== undefined) {
        directory = workingDirectory.get(agent.session)
      }
    } catch {
      directory = ''
    }
    if (directory === '') {
      try {
        const workingDirectory = this.ctx.get('workingDirectory') as { defaultDirectory?: string } | undefined
        directory = workingDirectory?.defaultDirectory ?? ''
      } catch {
        directory = ''
      }
    }
    return directory
  }

  private serviceFor(agent: AgentLike | undefined): ServicePack | null {
    if (this.fallback === null) return null
    if (agent === undefined) return this.fallback
    const directory = this.getWorkingDirectory(agent)
    if (directory === '') return this.fallback

    const compared = normalizeForCompare(directory)
    let bestCore: { id: string; root: string } | null = null
    let bestLength = -1
    for (const [id, pack] of this.cores) {
      for (const workspace of pack.service.activeWorkspaces) {
        const rootCompared = normalizeForCompare(workspace.root)
        if (!containsPath(rootCompared, compared)) continue
        if (rootCompared.length > bestLength) {
          bestLength = rootCompared.length
          bestCore = { id, root: workspace.root }
        }
      }
    }

    if (bestCore === null) return this.fallback
    const pack = this.cores.get(bestCore.id)
    return pack ?? this.fallback
  }

  private getPackFromQuery(url: URL): ServicePack {
    const coreId = url.searchParams.get('core')
    if (coreId !== null && coreId !== '') {
      const pack = this.cores.get(coreId)
      if (pack !== undefined) return pack
    }
    if (this.fallback === null) {
      throw new MemoryError('NOT_CONFIGURED', 'memory hub is not initialized')
    }
    return this.fallback
  }

  private onAgentCreated = (payload: CreatedPayload): void => {
    const agent = payload?.agent
    if (agent === undefined) return
    try {
      const systemPrompt = agent.ctx.get('systemPrompt') as
        | { context(context: { name: string; order: number; text: () => string }): () => void }
        | undefined
      if (systemPrompt === undefined) return
      const dispose = systemPrompt.context({
        name: AGENT_CONTEXT_NAME,
        order: AGENT_CONTEXT_ORDER,
        text: () => {
          try {
            return this.serviceFor(agent)?.service.packFor(agent.id) ?? ''
          } catch {
            return ''
          }
        },
      })
      const existing = this.agentDisposers.get(agent.id)
      existing?.()
      this.agentDisposers.set(agent.id, dispose)
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: cannot register context for ${agent.id}: ${(error as Error).message}`)
    }
  }

  private onAgentDisposed = (payload: DisposedPayload): void => {
    const agent = payload?.agent
    if (agent === undefined) return
    const dispose = this.agentDisposers.get(agent.id)
    if (dispose !== undefined) {
      dispose()
      this.agentDisposers.delete(agent.id)
    }
    const pack = this.serviceFor(agent)
    if (pack !== null) {
      void pack.service.closeDeferred(agent.id).catch(() => {})
    }
  }

  private onPreStep = async (payload: PreStepPayload, next: () => Promise<PreStepDecision>): Promise<PreStepDecision> => {
    let decision: PreStepDecision
    try {
      decision = await next()
    } catch (error) {
      throw error
    }
    try {
      if (payload?.signal?.aborted === true) return decision
      if (payload?.step !== 1) return decision
      if (decision.kind !== 'enter') return decision
      const messages = decision.messages ?? payload.messages
      if (!Array.isArray(messages) || messages.length === 0) return decision
      const intent = extractIntent(messages)
      if (intent === '') return decision
      const service = await this.service(payload.agent)
      const state = service.stateFor(payload.agent.id)
      if (state !== undefined && state.turn === payload.turn && !state.closed) return decision
      await service.preflightForTurn(payload.agent, payload.turn, intent)
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: pre-step preflight skipped: ${(error as Error).message}`)
    }
    return decision
  }

  private onTurnStopping = async (payload: TurnStoppingPayload): Promise<void> => {
    try {
      const pack = this.serviceFor(payload.agent)
      if (pack === null) return
      await pack.service.closeDeferred(payload.agent.id, payload.turn)
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: turn close failed: ${(error as Error).message}`)
    }
  }

  private onPreExecute = async (
    exec: ToolRunContext,
    next: () => Promise<unknown>,
  ): Promise<unknown> => {
    const base = (await next()) as { kind: string; reason?: string }
    if (base.kind !== 'allow') return base

    if (exec.name === 'memory_commit') {
      let reason = { reason: 'Commit a memory proposal', displayReason: { en: 'Commit a memory proposal', zh: '提交记忆提案' } }
      try {
        const service = exec.agent === undefined ? null : await this.service(exec.agent)
        const proposalId = readProposalId(exec.arguments)
        if (service !== null && proposalId !== null) {
          const precheck = service.precheckProposal(proposalId)
          if (!precheck.ok) return { kind: 'deny', reason: precheck.reason }
          if (service.approvalMode() === 'auto') {
            this.ctx.logger.warn(`dsh-memory-hub: approval mode is auto; committing ${proposalId} without approval`)
            return base
          }
          reason = service.describeCommit(proposalId)
        }
      } catch {
        // The approval still gates the call; execution will report initialization errors.
      }
      return { kind: 'ask', reason: reason.reason, displayReason: reason.displayReason }
    }

    try {
      if (exec.agent === undefined) return base
      const service = await this.service(exec.agent)
      return await service.gate(exec)
    } catch {
      return base
    }
  }

  private registerExistingAgents(): void {
    try {
      const agents = this.ctx.get('agents') as { list?: () => AgentLike[] } | undefined
      for (const agent of agents?.list?.() ?? []) {
        this.onAgentCreated({ agent })
      }
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: cannot inspect existing agents: ${(error as Error).message}`)
    }
  }

  private registerHttpRoutes(): void {
    try {
      this.ctx.inject(['webServer'], (scope) => {
        const server = scope.get('webServer') as WebServerService | undefined
        if (server === undefined || typeof server.register !== 'function') return
        for (const path of ['/dsh-memory-hub/api/overview', '/dsh-memory-hub/api/knowledge', '/dsh-memory-hub/api/config', '/dsh-memory-hub/api/hubs']) {
          try {
            scope.effect(() =>
              server.register({
                kind: 'exact',
                path,
                handler: (request, response) => this.handleHttp(request, response),
              }),
            )
          } catch (error) {
            this.ctx.logger.warn(`dsh-memory-hub: cannot register ${path}: ${(error as Error).message}`)
          }
        }
      })
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: web server injection failed: ${(error as Error).message}`)
    }
  }

  private handleHttp = async (request: HttpRequestLike, response: HttpResponseLike): Promise<void> => {
    const method = typeof request.method === 'string' ? request.method : 'GET'
    if (!isLoopbackRequest(request)) {
      sendJson(response, 403, { error: 'loopback-only' }, method)
      return
    }
    if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
      sendJson(response, 405, { error: 'method-not-allowed' }, method)
      return
    }
    let url: URL
    try {
      url = new URL(typeof request.url === 'string' ? request.url : '/', 'http://localhost')
    } catch {
      sendJson(response, 400, { error: 'bad-request' }, method)
      return
    }
    try {
      if (url.pathname === '/dsh-memory-hub/api/overview') {
        let payload: Record<string, unknown>
        try {
          const pack = this.getPackFromQuery(url)
          payload = pack.service.overview()
        } catch (error) {
          payload = {
            version: PLUGIN_VERSION,
            initialized: false,
            error: (error as Error).message,
            generatedAt: new Date().toISOString(),
          }
        }
        payload.client = this.clientInfo()
        sendJson(response, 200, payload, method)
        return
      }
      if (url.pathname === '/dsh-memory-hub/api/knowledge') {
        const id = url.searchParams.get('id')
        if (id === null || id === '') {
          sendJson(response, 400, { error: 'missing-id' }, method)
          return
        }
        try {
          const pack = this.getPackFromQuery(url)
          const detail = pack.service.knowledgeDetail(id)
          if (detail === null) {
            sendJson(response, 404, { error: 'not-found', id }, method)
            return
          }
          sendJson(response, 200, detail, method)
        } catch (error) {
          sendJson(response, 503, { error: 'not-initialized', message: (error as Error).message }, method)
        }
        return
      }
      if (url.pathname === '/dsh-memory-hub/api/hubs') {
        const cores = [...this.cores.entries()].map(([id, pack]) => ({ id, root: pack.hub.root }))
        if (this.fallback !== null) {
          cores.unshift({ id: '', root: this.fallback.hub.root })
        }
        sendJson(response, 200, { cores }, method)
        return
      }
      if (url.pathname === '/dsh-memory-hub/api/config') {
        if (method === 'GET' || method === 'HEAD') {
          try {
            if (this.fallback === null) throw new Error('not initialized')
            sendJson(response, 200, this.fallback.service.config(), method)
          } catch (error) {
            sendJson(response, 503, { error: 'not-initialized', message: (error as Error).message }, method)
          }
          return
        }
        if (method === 'POST') {
          try {
            if (this.fallback === null) throw new Error('not initialized')
            const body = await readJsonBody(request)
            const payload = await this.fallback.service.updateConfig(body as { core_workspaces?: unknown; workspaces?: unknown })
            sendJson(response, 200, payload, method)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(response, 400, { error: 'invalid-config', message }, method)
          }
          return
        }
      }
      sendJson(response, 404, { error: 'not-found', path: url.pathname }, method)
    } catch (error) {
      sendJson(response, 500, { error: 'internal', message: (error as Error).message }, method)
    }
  }

  private clientInfo(): Record<string, unknown> {
    try {
      const modules = this.ctx.get('clientModules') as
        | {
            clientPath?: (id: string) => string | undefined
            graph?: () => { entries?: Array<{ id: string; url: string }> }
          }
        | undefined
      if (modules === undefined) return { advertised: false, reason: 'clientModules service unavailable' }
      const path = modules.clientPath?.('dsh-memory-hub') ?? null
      const graph = modules.graph?.()
      const entry = graph?.entries?.find((candidate) => candidate.id === 'dsh-memory-hub') ?? null
      return {
        advertised: entry !== null || path !== null,
        url: entry?.url ?? null,
      }
    } catch (error) {
      return { advertised: false, error: (error as Error).message }
    }
  }

  /**
   * Best-effort compatibility shim for DSH 0.2.1-rc.5: `clientModules` caches a
   * null package resolution when a package was first scanned before its client
   * declaration existed, and only a restart clears that cache. Dropping the
   * cached entry and marking the Loader name dirty recomposes the graph
   * without a restart. Every field is guarded, so a future Host that renames
   * them simply falls back to the restart path.
   */
  private warmClientModule(): void {
    try {
      const modules = this.ctx.get('clientModules') as
        | {
            clientPath?: (id: string) => string | undefined
            pkgMeta?: Map<string, unknown>
            dirty?: Set<string>
            flush?: (onError: (error: unknown) => void) => void
          }
        | undefined
      if (modules === undefined) return
      if (modules.clientPath?.('dsh-memory-hub') !== undefined) return
      if (!(modules.pkgMeta instanceof Map) || !(modules.dirty instanceof Set) || typeof modules.flush !== 'function') return
      let cleared = false
      for (const key of [...modules.pkgMeta.keys()]) {
        if (key.endsWith('\0dsh-memory-hub')) {
          modules.pkgMeta.delete(key)
          cleared = true
        }
      }
      if (!cleared) return
      modules.dirty.add('dsh-memory-hub')
      modules.flush((error) => {
        this.ctx.logger.warn(`dsh-memory-hub: client graph refresh failed: ${(error as Error).message}`)
      })
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: client graph warm-up skipped: ${(error as Error).message}`)
    }
  }

  private startWatcher(): void {
    const watchConfig = this.configHub?.config.storage.watch ?? true
    if (!watchConfig) return
    const roots = new Set<string>()
    if (this.fallback !== null) roots.add(this.fallback.hub.root)
    for (const pack of this.cores.values()) roots.add(pack.hub.root)
    for (const root of roots) {
      try {
        const handle = watch(root, { recursive: true }, (_event, filename) => {
          if (filename === null) return
          const path = join(root, filename)
          this.schedule(path)
        })
        handle.on('error', (error) => {
          this.ctx.logger.warn(`dsh-memory-hub: watcher error: ${error.message}`)
        })
        this.watchHandles.set(root, handle)
      } catch (error) {
        this.ctx.logger.warn(`dsh-memory-hub: watcher unavailable for ${root}: ${(error as Error).message}`)
      }
    }
  }

  private schedule(path: string): void {
    const existing = this.watchTimers.get(path)
    if (existing !== undefined) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.watchTimers.delete(path)
      void this.handleChange(path)
    }, 300)
    timer.unref?.()
    this.watchTimers.set(path, timer)
  }

  private async handleChange(path: string): Promise<void> {
    if (this.configHub === null) return
    if (basename(path) === 'config.yaml') {
      if (this.configHub.configPath() === path) {
        await this.configHub.reloadConfig()
      }
      return
    }
    const normalized = path.replace(/\\/g, '/')
    if (!normalized.includes('/knowledge/') && !normalized.includes('/pending/')) return
    const allPacks = [this.fallback, ...this.cores.values()].filter((pack): pack is ServicePack => pack !== null)
    for (const pack of allPacks) {
      if (path.startsWith(pack.hub.root)) {
        await pack.store.refreshPath(path)
        return
      }
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const handle of this.watchHandles.values()) {
      try {
        handle.close()
      } catch {
        // ignore
      }
    }
    this.watchHandles.clear()
    for (const timer of this.watchTimers.values()) clearTimeout(timer)
    this.watchTimers.clear()
    for (const dispose of this.agentDisposers.values()) {
      try {
        dispose()
      } catch {
        // ignore
      }
    }
    this.agentDisposers.clear()
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose()
      } catch {
        // ignore
      }
    }
    const allPacks = [this.fallback, ...this.cores.values()].filter((pack): pack is ServicePack => pack !== null)
    for (const pack of allPacks) {
      try {
        await pack.ledger.close().catch(() => {})
      } catch {
        // ignore
      }
      try {
        await pack.hub.close().catch(() => {})
      } catch {
        // ignore
      }
    }
    this.fallback = null
    this.cores.clear()
  }
}

function readProposalId(args: unknown): string | null {
  if (args === null || typeof args !== 'object') return null
  const value = (args as Record<string, unknown>).proposal_id
  return typeof value === 'string' && value.length > 0 ? value : null
}

function extractIntent(messages: readonly UserMessage[]): string {
  const preferred = messages.find((message) => message.source?.kind === 'user') ?? messages[0]
  const collect = (selected: readonly UserMessage[]): string => {
    const parts: string[] = []
    for (const message of selected) {
      if (!Array.isArray(message.content)) continue
      for (const block of message.content) {
        if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
          parts.push(block.text.trim())
        }
      }
    }
    return parts.join('\n')
  }
  const preferredText = preferred === undefined ? '' : collect([preferred])
  return (preferredText !== '' ? preferredText : collect(messages)).slice(0, 2000)
}

function normalizeForCompare(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function containsPath(root: string, child: string): boolean {
  if (root === '') return false
  if (child === root) return true
  const rel = relative(root.replace(/\\/g, '/'), child.replace(/\\/g, '/'))
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith('/') && !relativeIsEscape(rel)
}

function relativeIsEscape(rel: string): boolean {
  const parts = rel.split(/[/\\]/)
  return parts.some((part) => part === '..')
}

function isLoopbackRequest(request: HttpRequestLike): boolean {
  const address = request.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function sendJson(
  response: HttpResponseLike,
  status: number,
  body: unknown,
  method: string,
): void {
  if (response.writableEnded === true) return
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(text, 'utf8')),
  })
  response.end(method === 'HEAD' ? undefined : text)
}

function readJsonBody(request: HttpRequestLike): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const readable = request as unknown as { on: (event: string, listener: (...args: unknown[]) => void) => void }
    readable.on('data', (chunk: unknown) => {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk)
    })
    readable.on('error', (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))))
    readable.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text === '' ? {} : JSON.parse(text))
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  })
}
