import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentLike, Context } from '../src/host.js'
import { Hub } from '../src/hub.js'
import { Ledger } from '../src/ledger.js'
import { MemoryService } from '../src/service.js'
import { KnowledgeStore } from '../src/store.js'
import type { KnowledgeType, Scope } from '../src/types.js'

export interface Harness {
  root: string
  hub: Hub
  ledger: Ledger
  store: KnowledgeStore
  service: MemoryService
  ctx: Context
  agent: AgentLike
  cleanup: () => Promise<void>
  setDirectory: (directory: string) => void
  seed: (input: SeedInput) => Promise<string>
}

export interface SeedInput {
  type?: KnowledgeType
  scope?: string
  title: string
  summary: string
  body?: string
  sourceRefs?: string[]
  tags?: string[]
}

export async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-test-'))
  const hub = await Hub.open({ root, lock: false })
  const ledger = new Ledger(hub.ledgerPath())
  const ledgerState = await ledger.load()
  const store = new KnowledgeStore(hub, ledger)
  await store.load()

  let directory = root
  const ctx: Context = {
    tools: {
      register: () => () => {},
      get: () => undefined,
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    get: (name: string) => {
      if (name === 'workingDirectory') return ctx.workingDirectory
      if (name === 'tokenMeter') return ctx.tokenMeter
      return undefined
    },
    on: () => () => {},
    effect: () => () => {},
    inject: () => {},
    workingDirectory: {
      defaultDirectory: directory,
      get: () => directory,
    },
    tokenMeter: {
      estimateMessage: (message: unknown) => Math.max(1, Math.ceil(JSON.stringify(message).length / 3.2)),
    },
  }

  const service = new MemoryService({ ctx, hub, store, ledger, ledgerState })
  const agent: AgentLike = {
    id: 'session-test',
    ctx,
    session: { id: 'session-test', seq: 0 },
  }

  const setDirectory = (next: string): void => {
    directory = next
  }

  const seed = async (input: SeedInput): Promise<string> => {
    const scope: Scope = parseScopeOrDefault(input.scope)
    const proposal = await store.propose(
      {
        operation: 'create',
        type: input.type ?? 'decision',
        scope: formatScopeOrDefault(scope),
        title: input.title,
        summary: input.summary,
        content: input.body ?? `## 结论\n${input.summary}\n`,
        sourceRefs: input.sourceRefs ?? ['note:test fixture'],
        ...(input.tags === undefined ? {} : { tags: input.tags }),
      },
      { taskId: 'TSK-seed' },
    )
    const { record } = await store.commit(proposal.id)
    return record.id
  }

  return {
    root,
    hub,
    ledger,
    store,
    service,
    ctx,
    agent,
    cleanup: async () => {
      await hub.close()
      await ledger.close()
      await rm(root, { recursive: true, force: true })
    },
    setDirectory,
    seed,
  }
}

function parseScopeOrDefault(value: string | undefined): Scope {
  if (value === undefined) return { level: 'global' }
  if (value === 'global') return { level: 'global' }
  const [level, id] = value.split(':', 2)
  if (level === 'domain' && id !== undefined) return { level: 'domain', id }
  if (level === 'project' && id !== undefined) return { level: 'project', workspaceId: id }
  throw new Error(`invalid seed scope ${value}`)
}

function formatScopeOrDefault(scope: Scope): string {
  if (scope.level === 'global') return 'global'
  if (scope.level === 'domain') return `domain:${scope.id}`
  return `project:${scope.workspaceId}`
}
