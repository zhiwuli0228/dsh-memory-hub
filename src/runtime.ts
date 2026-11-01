import { watch, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'
import { z } from 'zod'
import { Hub } from './hub.js'
import { KnowledgeStore } from './store.js'
import { Ledger } from './ledger.js'
import { MemoryError } from './errors.js'
import { MemoryService, PLUGIN_VERSION } from './service.js'
import { createTools, type ToolHost } from './tools.js'
import type {
  AgentLike,
  Context,
  CreatedPayload,
  DisposedPayload,
  PreStepDecision,
  PreStepPayload,
  ToolRunContext,
  TurnStoppingPayload,
  UserMessage,
} from './host.js'

const pluginConfigSchema = z.object({
  root: z.string().optional(),
  readOnly: z.boolean().optional(),
}).passthrough()

const AGENT_CONTEXT_NAME = 'memory:pack'
const AGENT_CONTEXT_ORDER = 130

export class MemoryRuntime implements ToolHost {
  private readonly ctx: Context
  private readonly config: { root?: string; readOnly?: boolean }
  private readonly disposers: Array<() => void> = []
  private readonly agentDisposers = new Map<string, () => void>()
  private hub: Hub | null = null
  private store: KnowledgeStore | null = null
  private ledger: Ledger | null = null
  private serviceInstance: MemoryService | null = null
  private initError: Error | null = null
  private watchHandle: FSWatcher | null = null
  private readonly watchTimers = new Map<string, NodeJS.Timeout>()
  private started = false
  private disposed = false
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

    this.listen('agent/created', this.onAgentCreated)
    this.listen('agent/pre-step', this.onPreStep)
    this.listen('agent/turn-stopping', this.onTurnStopping)
    this.listen('agent/disposed', this.onAgentDisposed)
    this.listen('tools/pre-execute', this.onPreExecute)
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
      const hub = await Hub.open({ root: this.config.root, readOnly: this.config.readOnly === true })
      this.hub = hub
      const ledger = new Ledger(hub.ledgerPath())
      const ledgerState = await ledger.load({ repair: !hub.readOnly })
      const store = new KnowledgeStore(hub, ledger)
      await store.load()
      this.ledger = ledger
      this.store = store
      this.serviceInstance = new MemoryService({ ctx: this.ctx, hub, store, ledger, ledgerState })
      this.registerExistingAgents()
      this.startWatcher()
      this.ctx.logger.info(
        `dsh-memory-hub ${PLUGIN_VERSION} ready at ${hub.displayRoot()} (${store.docs.size} entries${hub.readOnly ? ', read-only' : ''})`,
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

  async service(): Promise<MemoryService> {
    await this.ready
    if (this.initError !== null) {
      throw new MemoryError('NOT_CONFIGURED', `memory hub initialization failed: ${this.initError.message}`)
    }
    if (this.serviceInstance === null) {
      throw new MemoryError('NOT_CONFIGURED', 'memory hub is not initialized')
    }
    return this.serviceInstance
  }

  status(agent?: AgentLike): Record<string, unknown> {
    if (this.serviceInstance !== null) return this.serviceInstance.status(agent)
    return {
      version: PLUGIN_VERSION,
      initialized: false,
      error: this.initError?.message ?? null,
      root: this.hub?.displayRoot() ?? null,
      readOnly: this.hub?.readOnly ?? null,
      readOnlyReason: this.hub?.readOnlyReason ?? null,
    }
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
            return this.serviceInstance?.packFor(agent.id) ?? ''
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
    if (this.serviceInstance !== null) {
      void this.serviceInstance.closeDeferred(agent.id).catch(() => {})
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
      const service = await this.service()
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
      if (this.serviceInstance === null) return
      await this.serviceInstance.closeDeferred(payload.agent.id, payload.turn)
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
        const service = await this.service()
        const proposalId = readProposalId(exec.arguments)
        if (proposalId !== null) {
          const precheck = service.precheckProposal(proposalId)
          if (!precheck.ok) return { kind: 'deny', reason: precheck.reason }
          reason = service.describeCommit(proposalId)
        }
      } catch {
        // The approval still gates the call; execution will report initialization errors.
      }
      return { kind: 'ask', reason: reason.reason, displayReason: reason.displayReason }
    }

    try {
      const service = await this.service()
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

  private startWatcher(): void {
    const hub = this.hub
    const store = this.store
    if (hub === null || store === null) return
    if (!hub.config.storage.watch) return
    try {
      this.watchHandle = watch(hub.root, { recursive: true }, (_event, filename) => {
        if (filename === null) return
        const path = join(hub.root, filename)
        this.schedule(path)
      })
      this.watchHandle.on('error', (error) => {
        this.ctx.logger.warn(`dsh-memory-hub: watcher error: ${error.message}`)
      })
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: watcher unavailable: ${(error as Error).message}`)
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
    if (this.hub === null || this.store === null) return
    if (basename(path) === 'config.yaml') {
      await this.hub.reloadConfig()
      return
    }
    const normalized = path.replace(/\\/g, '/')
    if (normalized.includes('/knowledge/') || normalized.includes('/pending/')) {
      await this.store.refreshPath(path)
      return
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    if (this.watchHandle !== null) {
      this.watchHandle.close()
      this.watchHandle = null
    }
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
    if (this.ledger !== null) {
      await this.ledger.close().catch(() => {})
      this.ledger = null
    }
    if (this.hub !== null) {
      await this.hub.close().catch(() => {})
      this.hub = null
    }
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
