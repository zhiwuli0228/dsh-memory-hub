import { open, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ensureDir, readTextOrNull } from './atomic.js'
import { MemoryError } from './errors.js'
import { nowIso } from './time.js'
import type {
  CitationRecord,
  PreflightStatus,
  TaskRecord,
  WritebackAssessment,
} from './types.js'

interface EventBase {
  v: 1
  at: string
}

export type LedgerEvent =
  | (EventBase & {
      type: 'task.created'
      taskId: string
      sessionId: string
      turn: number
      workspaceId: string | null
      intentHash: string
      idempotencyKey: string
    })
  | (EventBase & {
      type: 'preflight.recorded'
      taskId: string
      preflightId: string
      status: PreflightStatus
      hits: Array<{ id: string; version: number }>
      tokens: number
      error?: string
    })
  | (EventBase & {
      type: 'citation.added'
      taskId: string
      citationId: string
      knowledgeId: string
      version: number
      purpose: string
    })
  | (EventBase & {
      type: 'proposal.created'
      taskId: string
      proposalId: string
    })
  | (EventBase & {
      type: 'proposal.committed'
      proposalId: string
      knowledgeId: string
      version: number
      approvalRef: string
    })
  | (EventBase & {
      type: 'proposal.rejected'
      proposalId: string
      reason?: string
    })
  | (EventBase & {
      type: 'task.closed'
      taskId: string
      assessment: WritebackAssessment
    })
  | (EventBase & {
      type: 'gate.denied'
      sessionId: string
      tool: string
      reason: string
    })
  | (EventBase & {
      type: 'gate.degraded'
      sessionId: string
      tool: string
      reason: string
    })
  | (EventBase & {
      type: 'consolidation.run'
      actorWorkspace: string | null
      workspaceIds: string[]
      created: number
      skipped: number
    })
  | (EventBase & {
      type: 'recovered'
      knowledgeId: string
      version: number
      note: string
    })

export type LedgerEventInput =
  LedgerEvent extends infer T
    ? T extends LedgerEvent
      ? Omit<T, 'v' | 'at'>
      : never
    : never

export interface LedgerState {
  tasks: Map<string, TaskRecord>
  citations: CitationRecord[]
  proposalIds: Set<string>
  diagnostics: string[]
}

function emptyState(): LedgerState {
  return {
    tasks: new Map(),
    citations: [],
    proposalIds: new Set(),
    diagnostics: [],
  }
}

export class Ledger {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly file: string) {}

  async load(options: { repair?: boolean } = {}): Promise<LedgerState> {
    const raw = await readTextOrNull(this.file)
    if (raw === null || raw.trim() === '') return emptyState()

    let content = raw
    if (!content.endsWith('\n')) {
      const cut = content.lastIndexOf('\n')
      content = cut >= 0 ? content.slice(0, cut + 1) : ''
      if (options.repair !== false && content !== raw) {
        await writeFile(this.file, content, 'utf8')
      }
    }

    const state = emptyState()
    for (const line of content.split('\n')) {
      if (line.trim() === '') continue
      let event: LedgerEvent
      try {
        event = JSON.parse(line) as LedgerEvent
      } catch {
        state.diagnostics.push(`ignored unparsable ledger line: ${line.slice(0, 120)}`)
        continue
      }
      if (event === null || typeof event !== 'object' || typeof event.type !== 'string') {
        state.diagnostics.push('ignored ledger line without a type')
        continue
      }
      applyEvent(state, event)
    }
    return state
  }

  append(event: LedgerEventInput): Promise<void> {
    const line = JSON.stringify({ ...event, v: 1, at: nowIso() }) + '\n'
    const run = this.queue.then(async () => {
      try {
        await ensureDir(dirname(this.file))
        const handle = await open(this.file, 'a')
        try {
          await handle.write(line)
          await handle.sync()
        } finally {
          await handle.close()
        }
      } catch (error) {
        throw new MemoryError('STORAGE_ERROR', `cannot append ledger ${this.file}: ${(error as Error).message}`)
      }
    })
    this.queue = run.catch(() => {})
    return run
  }

  async close(): Promise<void> {
    await this.queue.catch(() => {})
  }
}

function applyEvent(state: LedgerState, event: LedgerEvent): void {
  switch (event.type) {
    case 'task.created': {
      state.tasks.set(event.taskId, {
        taskId: event.taskId,
        sessionId: event.sessionId,
        turn: event.turn,
        workspaceId: event.workspaceId,
        intentHash: event.intentHash,
        createdAt: event.at,
        preflight: null,
        assessment: null,
        closedAt: null,
      })
      break
    }
    case 'preflight.recorded': {
      const task = state.tasks.get(event.taskId)
      if (task === undefined) break
      task.preflight = {
        id: event.preflightId,
        taskId: event.taskId,
        sessionId: task.sessionId,
        turn: task.turn,
        workspaceId: task.workspaceId,
        status: event.status,
        hits: event.hits,
        tokens: event.tokens,
        createdAt: event.at,
      }
      break
    }
    case 'citation.added': {
      state.citations.push({
        id: event.citationId,
        taskId: event.taskId,
        knowledgeId: event.knowledgeId,
        version: event.version,
        purpose: event.purpose,
        createdAt: event.at,
      })
      break
    }
    case 'proposal.created':
    case 'proposal.committed': {
      state.proposalIds.add(event.proposalId)
      break
    }
    case 'task.closed': {
      const task = state.tasks.get(event.taskId)
      if (task === undefined) break
      task.assessment = event.assessment
      task.closedAt = event.at
      break
    }
    default:
      break
  }
}
