import { watch, type FSWatcher } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { readTextOrNull, writeAtomic } from './atomic.js'
import { expandHome, Hub, resolveHubRoot } from './hub.js'
import { KnowledgeStore } from './store.js'
import { Ledger } from './ledger.js'
import { MemoryError } from './errors.js'
import { MemoryService, PLUGIN_VERSION, type ParentPack } from './service.js'
import { localDateKey, maintenanceDue } from './maintenance-schedule.js'
import { reconcileDistillSchedules, type DistillReconcileReport, type DistillScheduleService } from './distill.js'
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

const DISTILL_RETRY_LIMIT = 5
const DISTILL_RETRY_BASE_MS = 2000
const DISTILL_RETRY_MAX_MS = 15000
/** Host 的 schedule/session-controller 尚未就绪时产生的可自愈错误。 */
const DISTILL_TRANSIENT_ERROR = /cannot create Sessions|service unavailable|not available|not mounted|no such service/i

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
  /** 金字塔：本核心的祖先核心链（近→远，父、祖父、…），由 workspaces[].core_id 逐层推导。 */
  ancestorIds: string[]
}

/** 金字塔链的最大层级数（父 + 祖父 + …，不含自身），防环上限。 */
const MAX_ANCESTOR_DEPTH = 8

/** 面板批量审核单次最多处理的候选数，避免一次请求长时间占用。 */
const MAX_REVIEW_BATCH = 50

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
  private distillReport: { at: string; entries: DistillReconcileReport['entries']; removed: number; error: string | null } | null = null
  private distillRetryTimer: NodeJS.Timeout | null = null
  private distillRetryCount = 0
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
    this.watchScheduleService()
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

  /**
   * 插件可能先于 schedule 服务挂载；等它就绪后再对齐一次，避免启动顺序导致
   * 定时蒸馏只留下 "service unavailable" 诊断。
   */
  private watchScheduleService(): void {
    try {
      this.ctx.inject(['schedule'], () => {
        if (!this.disposed) void this.reconcileDistill()
      })
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: schedule injection failed: ${(error as Error).message}`)
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
      // Only an explicit `readOnly: true` is global. A busy lock or an unreadable
      // config.yaml degrades the config root alone; every core hub decides for its
      // own root, so one locked workspace never freezes the rest.
      const forcedReadOnly = this.config.readOnly === true
      const configHub = await Hub.open({ root: configRoot, readOnly: forcedReadOnly })
      this.configHub = configHub

      const globalConfig = configHub.config
      this.fallback = await this.openServicePack(configHub, globalConfig, this.standaloneWorkspaces(globalConfig), null, [])

      for (const core of globalConfig.core_workspaces) {
        if (core.root === undefined) continue
        const root = resolve(expandHome(core.root))
        // A core that points at the config root would open a second Hub on the
        // same directory and fight its own process for the lock. Share the lock.
        const sharesConfigRoot = normalizeForCompare(root) === normalizeForCompare(configHub.root)
        if (sharesConfigRoot) {
          this.ctx.logger.warn(
            `dsh-memory-hub: core workspace ${core.id} uses the config hub root; sharing its writer lock`,
          )
        }
        const dataHub = await Hub.open({
          root,
          readOnly: sharesConfigRoot ? configHub.readOnly : forcedReadOnly,
          ...(sharesConfigRoot && configHub.readOnlyReason !== null
            ? { readOnlyReason: configHub.readOnlyReason }
            : {}),
          config: globalConfig,
          configPath: configHub.configPath() ?? undefined,
          lock: !sharesConfigRoot,
        })
        const pack = await this.openServicePack(
          dataHub,
          globalConfig,
          this.coreWorkspaces(globalConfig, core.id, root),
          core.id,
          this.ancestorIds(globalConfig, core.id),
        )
        this.cores.set(core.id, pack)
      }

      // 金字塔分级蒸馏：核心 Hub 打开后，把祖先核心 pack 链（近→远）挂到它自己的 service 上。
      for (const pack of this.cores.values()) {
        this.wireAncestors(pack)
      }

      this.registerExistingAgents()
      this.warmClientModule()
      this.startWatcher()
      this.startMaintenanceTimer()
      await this.reconcileDistill()
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

  /** Host `schedule` 服务（可选）：缺失时定时蒸馏只记录诊断，不影响插件其他功能。 */
  private scheduleService(): DistillScheduleService | null {
    try {
      const service = this.ctx.get('schedule') as Partial<DistillScheduleService> | undefined
      if (service === undefined || service === null) return null
      if (
        typeof service.list !== 'function' ||
        typeof service.create !== 'function' ||
        typeof service.edit !== 'function'
      ) {
        return null
      }
      return service as DistillScheduleService
    } catch {
      return null
    }
  }

  /**
   * 按 config.yaml 的每个工作区 `distill` 设置对齐 Host 定时任务：
   * 到点新建会话（cwd = 工作区 root）或投递到指定会话，由会话执行蒸馏提示词。
   */
  private async reconcileDistill(): Promise<void> {
    if (this.disposed || this.configHub === null) return
    const service = this.scheduleService()
    if (service === null) {
      this.distillReport = {
        at: new Date().toISOString(),
        entries: [],
        removed: 0,
        error: 'schedule service unavailable; distill schedules were not registered',
      }
      this.scheduleDistillRetry(true)
      return
    }
    try {
      const report = await reconcileDistillSchedules(service, this.configHub.config, this.configHub.config.hub.id)
      this.distillReport = {
        at: new Date().toISOString(),
        entries: report.entries,
        removed: report.removed,
        error: null,
      }
      const changed = report.entries.filter((entry) => entry.action !== 'kept').length
      if (changed > 0) {
        this.ctx.logger.info(
          `dsh-memory-hub: distill schedules reconciled (${changed} change(s), ${report.removed} removed)`,
        )
      }
      // Host 的 session-controller 可能比 schedule 晚就绪；此时新建会话被拒绝，
      // 稍后重试即可，不需要用户改配置或重启。
      const pending = report.entries.filter(
        (entry) => entry.action === 'error' && DISTILL_TRANSIENT_ERROR.test(entry.error ?? ''),
      ).length
      this.scheduleDistillRetry(pending > 0)
    } catch (error) {
      this.distillReport = {
        at: new Date().toISOString(),
        entries: [],
        removed: 0,
        error: (error as Error).message,
      }
      this.ctx.logger.warn(`dsh-memory-hub: distill schedule reconciliation failed: ${(error as Error).message}`)
      this.scheduleDistillRetry(true)
    }
  }

  /** 有限次退避重试，只针对“服务尚未就绪”这类可自愈错误。 */
  private scheduleDistillRetry(retry: boolean): void {
    if (!retry) {
      this.distillRetryCount = 0
      if (this.distillRetryTimer !== null) {
        clearTimeout(this.distillRetryTimer)
        this.distillRetryTimer = null
      }
      return
    }
    if (this.disposed || this.distillRetryTimer !== null || this.distillRetryCount >= DISTILL_RETRY_LIMIT) return
    this.distillRetryCount += 1
    const delay = Math.min(DISTILL_RETRY_BASE_MS * this.distillRetryCount, DISTILL_RETRY_MAX_MS)
    this.distillRetryTimer = setTimeout(() => {
      this.distillRetryTimer = null
      void this.reconcileDistill()
    }, delay)
    this.distillRetryTimer.unref?.()
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
    ancestorIds: string[],
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
      coreId,
    })
    return { hub, store, ledger, service, workspaces, coreId, ancestorIds }
  }

  /** 双角色声明：workspaces[] 里存在 id === coreId 且 core_id 指向另一个核心的条目 → 最近的父核心。 */
  private dualRoleParent(config: MemoryConfig, coreId: string): string | null {
    for (const workspace of config.workspaces) {
      if (workspace.id !== coreId) continue
      if (workspace.core_id !== undefined && workspace.core_id !== null && workspace.core_id !== coreId) {
        return workspace.core_id
      }
    }
    return null
  }

  /**
   * 金字塔祖先链：沿 workspaces[].core_id 逐层向上推导（父、祖父、…，近→远）。
   * 带环检测与最大深度保护，链上任一环节缺失即停止。
   */
  private ancestorIds(config: MemoryConfig, coreId: string): string[] {
    const chain: string[] = []
    const seen = new Set<string>([coreId])
    let current = coreId
    while (chain.length < MAX_ANCESTOR_DEPTH) {
      const next = this.dualRoleParent(config, current)
      if (next === null) break
      if (seen.has(next)) {
        this.ctx.logger.warn(`dsh-memory-hub: ancestor chain for core ${coreId} cycles at ${next}; stopping`)
        break
      }
      seen.add(next)
      chain.push(next)
      current = next
    }
    return chain
  }

  /** 把祖先核心 pack 链（近→远）挂到 service；缺失的祖先给出 warning 并跳过。 */
  private wireAncestors(pack: ServicePack): void {
    const parents: ParentPack[] = []
    for (const ancestorId of pack.ancestorIds) {
      const ancestor = this.cores.get(ancestorId)
      if (ancestor === undefined) {
        this.ctx.logger.warn(
          `dsh-memory-hub: core ${pack.coreId} declares ancestor ${ancestorId} without an open hub (no root?); that layer is unavailable`,
        )
        continue
      }
      parents.push({
        coreId: ancestor.coreId ?? ancestorId,
        store: ancestor.store,
        ledger: ancestor.ledger,
        hub: ancestor.hub,
      })
    }
    pack.service.setParents(parents)
  }

  /**
   * 配置热更新：按最新 config.yaml 增删 core、刷新工作区清单并重新接线双角色父核心。
   * 面板保存或 watcher 触发 reloadConfig 后调用，新增核心/开启双角色无需重启。
   */
  private async reconfigureCores(): Promise<void> {
    if (this.configHub === null || this.disposed) return
    const globalConfig = this.configHub.config
    const forcedReadOnly = this.config.readOnly === true

    const desiredRoot = new Map<string, string>()
    for (const core of globalConfig.core_workspaces) {
      if (core.root === undefined) continue
      desiredRoot.set(core.id, normalizeForCompare(resolve(expandHome(core.root))))
    }

    // 1) 移除不再配置或 root 变化的 core。
    const removedIds = new Set<string>()
    for (const [id, pack] of this.cores) {
      const want = desiredRoot.get(id)
      if (want === undefined || normalizeForCompare(pack.hub.root) !== want) removedIds.add(id)
    }
    for (const id of removedIds) {
      const pack = this.cores.get(id)
      if (pack === undefined) continue
      this.cores.delete(id)
      // 移除后的接线统一在步骤 3 的 wireAncestors 里重算（缺失祖先自然被跳过）。
      try {
        await pack.hub.close()
        await pack.ledger.close()
      } catch (error) {
        this.ctx.logger.warn(`dsh-memory-hub: failed to close removed core ${id}: ${(error as Error).message}`)
      }
    }

    // 2) 打开新增 core。
    for (const core of globalConfig.core_workspaces) {
      if (core.root === undefined) continue
      const root = resolve(expandHome(core.root))
      const key = normalizeForCompare(root)
      const exists = [...this.cores.values()].some((pack) => normalizeForCompare(pack.hub.root) === key)
      if (exists) continue
      const sharesConfigRoot = key === normalizeForCompare(this.configHub.root)
      const dataHub = await Hub.open({
        root,
        readOnly: sharesConfigRoot ? this.configHub.readOnly : forcedReadOnly,
        ...(sharesConfigRoot && this.configHub.readOnlyReason !== null
          ? { readOnlyReason: this.configHub.readOnlyReason }
          : {}),
        config: globalConfig,
        configPath: this.configHub.configPath() ?? undefined,
        lock: !sharesConfigRoot,
      })
      const pack = await this.openServicePack(
        dataHub,
        globalConfig,
        this.coreWorkspaces(globalConfig, core.id, root),
        core.id,
        this.ancestorIds(globalConfig, core.id),
      )
      this.cores.set(core.id, pack)
      this.ctx.logger.info(`dsh-memory-hub: opened core hub ${core.id} at ${root}`)
    }

    // 3) 重新接线父核心并刷新各 pack 的工作区清单。
    for (const pack of this.cores.values()) {
      // 核心 Hub 打开时持有旧的 config 对象；reloadConfig 只更新了配置 Hub，
      // 这里把最新配置同步过去，让 policy/gate/limits 的热更新也作用到核心。
      pack.hub.config = globalConfig
      pack.service.updateWorkspaces(this.coreWorkspaces(globalConfig, pack.coreId ?? '', pack.hub.root))
      pack.ancestorIds = this.ancestorIds(globalConfig, pack.coreId ?? '')
      this.wireAncestors(pack)
    }

    if (this.fallback !== null) {
      this.fallback.service.updateWorkspaces(this.standaloneWorkspaces(globalConfig))
    }

    // 4) 新 root 的 watcher 句柄（已有 root 跳过）。
    this.startWatcher()

    // 5) 工作区蒸馏配置可能刚变化：对齐 Host 定时任务。
    await this.reconcileDistill()
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
    let bestCore: { id: string; root: string; own: boolean } | null = null
    let bestLength = -1
    for (const [id, pack] of this.cores) {
      for (const workspace of pack.service.activeWorkspaces) {
        const rootCompared = normalizeForCompare(workspace.root)
        if (!containsPath(rootCompared, compared)) continue
        const own = workspace.id === id
        if (rootCompared.length > bestLength) {
          bestLength = rootCompared.length
          bestCore = { id, root: workspace.root, own }
        } else if (rootCompared.length === bestLength && own && bestCore !== null && !bestCore.own) {
          // 双角色：同一目录既是某核心的 root、又是父核心的子工作区（等长前缀平局），
          // 自己的核心仓优先，不再依赖 core_workspaces[] 配置顺序。
          bestCore = { id, root: workspace.root, own }
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
        const core = readOptionalCore(exec.arguments)
        if (service !== null && proposalId !== null) {
          const precheck = service.precheckProposal(proposalId, core)
          if (!precheck.ok) return { kind: 'deny', reason: precheck.reason }
          if (service.approvalMode() === 'auto') {
            this.ctx.logger.warn(`dsh-memory-hub: approval mode is auto; committing ${proposalId} without approval`)
            return base
          }
          reason = service.describeCommit(proposalId, core)
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
        for (const path of ['/dsh-memory-hub/api/overview', '/dsh-memory-hub/api/knowledge', '/dsh-memory-hub/api/config', '/dsh-memory-hub/api/hubs', '/dsh-memory-hub/api/pending']) {
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
        payload.distill = this.distillReport
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
          const core = url.searchParams.get('core')
          const detail = pack.service.knowledgeDetail(id, core === null || core === '' ? undefined : core)
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
            sendJson(response, 200, { ...this.fallback.service.config(), distill: this.distillReport }, method)
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
            await this.reconcileDistill()
            sendJson(response, 200, { ...payload, distill: this.distillReport }, method)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(response, 400, { error: 'invalid-config', message }, method)
          }
          return
        }
      }
      if (url.pathname === '/dsh-memory-hub/api/pending') {
        if (method !== 'POST') {
          sendJson(response, 405, { error: 'method-not-allowed' }, method)
          return
        }
        // 面板审核把“人工点击”当作批准依据：只接受面板自己发的同源请求
        // （自定义头 + 同源 Origin），并受 policy.panel.review 开关约束。
        const headers = request.headers ?? {}
        const header = (name: string): string => {
          const value = headers[name] ?? headers[name.toLowerCase()]
          return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
        }
        if (header('x-dmh-review') !== '1') {
          sendJson(response, 403, { error: 'review-header-required', message: 'missing x-dmh-review header' }, method)
          return
        }
        const origin = header('origin')
        if (origin !== '' && !isLocalOrigin(origin)) {
          sendJson(response, 403, { error: 'origin-forbidden', message: `origin ${origin} is not allowed` }, method)
          return
        }
        try {
          if (this.fallback === null) throw new Error('not initialized')
          const pack = this.getPackFromQuery(url)
          if (pack.hub.config.policy.panel.review === false) {
            sendJson(response, 403, { error: 'review-disabled', message: 'panel review is disabled by policy.panel.review' }, method)
            return
          }
          const body = (await readJsonBody(request)) as Record<string, unknown>
          const action = typeof body.action === 'string' ? body.action : ''
          if (action !== 'approve' && action !== 'reject') {
            sendJson(response, 400, { error: 'invalid-action', message: 'action must be approve or reject' }, method)
            return
          }
          const rawIds = Array.isArray(body.ids)
            ? body.ids.filter((value): value is string => typeof value === 'string')
            : typeof body.id === 'string'
              ? [body.id]
              : []
          const ids = [...new Set(rawIds.map((value) => value.trim()).filter((value) => value !== ''))]
          if (ids.length === 0) {
            sendJson(response, 400, { error: 'missing-id' }, method)
            return
          }
          if (ids.length > MAX_REVIEW_BATCH) {
            sendJson(response, 400, { error: 'batch-too-large', message: `at most ${MAX_REVIEW_BATCH} proposals per request` }, method)
            return
          }
          const reason = typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : undefined
          const results: Array<Record<string, unknown>> = []
          for (const id of ids) {
            try {
              if (action === 'approve') {
                const result = await pack.service.approveProposal(id)
                results.push({ id, ok: true, action, knowledgeId: result.knowledgeId, version: result.version })
              } else {
                const result = await pack.service.rejectProposal(id, reason)
                results.push({ id, ok: true, action, status: result.status })
              }
            } catch (error) {
              results.push({ id, ok: false, message: error instanceof Error ? error.message : String(error) })
            }
          }
          const failed = results.filter((result) => result.ok !== true).length
          const firstFailure = results.find((result) => result.ok !== true)
          sendJson(
            response,
            failed === ids.length ? 409 : 200,
            {
              ok: failed === 0,
              action,
              approved: results.length - failed,
              failed,
              ...(firstFailure === undefined ? {} : { message: firstFailure.message }),
              results,
            },
            method,
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          sendJson(response, 409, { error: 'review-failed', message }, method)
        }
        return
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
      if (this.watchHandles.has(root)) continue
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
        await this.reconfigureCores()
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
    if (this.distillRetryTimer !== null) {
      clearTimeout(this.distillRetryTimer)
      this.distillRetryTimer = null
    }
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

function readOptionalCore(args: unknown): string | undefined {
  if (args === null || typeof args !== 'object') return undefined
  const value = (args as Record<string, unknown>).core
  return typeof value === 'string' && value.length > 0 ? value : undefined
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

/** 面板审核只接受本机 Origin（http://127.0.0.1|localhost:<port>）。 */
function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]' || url.hostname === '::1'
  } catch {
    return false
  }
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
