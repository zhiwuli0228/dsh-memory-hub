import { MemoryError } from './errors.js'
import type { AgentLike, ContentBlock, ToolDefinition, ToolRunContext } from './host.js'
import type { MemoryService } from './service.js'
import { KNOWLEDGE_STATUSES, KNOWLEDGE_TYPES, type WritebackAssessment } from './types.js'

export interface MaintenanceToolArgs {
  all_cores?: boolean
  apply?: 'report' | 'propose'
  max_proposals?: number
  stale_pending_days?: number
  stale_citation_days?: number
}

export interface ToolHost {
  service(agent: AgentLike): Promise<MemoryService>
  status(agent?: AgentLike): Record<string, unknown>
  maintenance(agent: AgentLike, args: MaintenanceToolArgs): Promise<unknown>
}

function renderJson(_args: unknown, value: unknown): ContentBlock[] {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

function define(input: {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: unknown, exec: ToolRunContext, host: ToolHost) => Promise<unknown>
  concurrencySafe?: boolean
}, host: ToolHost): ToolDefinition {
  return {
    name: input.name,
    description: input.description,
    parameters: input.parameters,
    output: { schema: {}, render: renderJson },
    async execute(args, exec) {
      return input.execute(args, exec, host)
    },
    ...(input.concurrencySafe === true ? { isConcurrencySafe: () => true } : {}),
  }
}

function requireAgent(exec: ToolRunContext): AgentLike {
  if (exec.agent === undefined) {
    throw new MemoryError('NO_TASK', 'memory tools require an agent context')
  }
  return exec.agent
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    ...(required.length === 0 ? {} : { required }),
    additionalProperties: false,
  }
}

const knowledgeTypesSchema = {
  type: 'array',
  items: { type: 'string', enum: [...KNOWLEDGE_TYPES] },
  description: 'Optional knowledge type filter.',
}

const knowledgeStatusesSchema = {
  type: 'array',
  items: { type: 'string', enum: [...KNOWLEDGE_STATUSES] },
  description: 'Optional status filter; defaults to accepted.',
}

const assessmentSchema = objectSchema(
  {
    kind: {
      type: 'string',
      enum: ['proposed', 'no_new_knowledge', 'needs_evidence', 'deferred'],
      description: 'Assessment kind.',
    },
    proposal_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'Pending proposal ids created by this task (proposed only).',
    },
    reason: { type: 'string', description: 'Reason for no_new_knowledge or deferred.' },
    missing: {
      type: 'array',
      items: { type: 'string' },
      description: 'Missing evidence items (needs_evidence only).',
    },
  },
  ['kind'],
)

function normalizeAssessment(raw: unknown): WritebackAssessment {
  if (raw === null || typeof raw !== 'object') {
    throw new MemoryError('INVALID_INPUT', 'assessment must be an object')
  }
  const value = raw as Record<string, unknown>
  const kind = value.kind
  if (kind === 'proposed') {
    const ids = Array.isArray(value.proposal_ids) ? value.proposal_ids.filter((id): id is string => typeof id === 'string') : []
    return { kind, proposalIds: ids }
  }
  if (kind === 'no_new_knowledge') {
    return { kind, reason: typeof value.reason === 'string' ? value.reason : '' }
  }
  if (kind === 'needs_evidence') {
    const missing = Array.isArray(value.missing) ? value.missing.filter((item): item is string => typeof item === 'string') : []
    return { kind, missing }
  }
  if (kind === 'deferred') {
    return { kind, reason: typeof value.reason === 'string' ? value.reason : '' }
  }
  throw new MemoryError('INVALID_INPUT', 'assessment.kind must be proposed, no_new_knowledge, needs_evidence, or deferred')
}

export function createTools(host: ToolHost): ToolDefinition[] {
  const tool = (input: Omit<Parameters<typeof define>[0], 'execute'> & {
    execute: (args: unknown, exec: ToolRunContext) => Promise<unknown>
    concurrencySafe?: boolean
  }): ToolDefinition => define({ ...input, execute: (args, exec) => input.execute(args, exec) }, host)

  return [
    tool({
      name: 'memory_search',
      concurrencySafe: true,
      description:
        'Search the user\'s accepted long-term memory (project, domain, and global knowledge). Use it before planning or modifying a project, and after a preflight hint points at an entry. Returns ids, versions, summaries, and relative paths; call memory_get for the full body and memory_cite after actually using an entry.',
      parameters: objectSchema(
        {
          query: { type: 'string', description: 'Keywords or a natural-language question.' },
          types: knowledgeTypesSchema,
          scope: { type: 'string', description: 'Optional exact scope filter: global, domain:<id>, or project:<workspace-id>.' },
          status: knowledgeStatusesSchema,
          limit: { type: 'number', description: 'Maximum hits, 1..20; defaults to 8.' },
        },
        ['query'],
      ),
      async execute(args, exec) {
        const input = args as { query: string; types?: string[]; scope?: string; status?: string[]; limit?: number }
        const service = await host.service(requireAgent(exec))
        return service.search(requireAgent(exec), {
          query: input.query,
          ...(input.types === undefined ? {} : { types: input.types as never }),
          ...(input.scope === undefined ? {} : { scope: input.scope }),
          ...(input.status === undefined ? {} : { statuses: input.status as never }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        })
      },
    }),

    tool({
      name: 'memory_get',
      concurrencySafe: true,
      description:
        'Read one memory entry in full, including its frontmatter metadata and provenance. Use the id from memory_search or the preflight hint; pass version only when you need a historical version.',
      parameters: objectSchema(
        {
          id: { type: 'string', description: 'Knowledge id, for example DEC-000001.' },
          version: { type: 'number', description: 'Optional historical version; defaults to the current version.' },
        },
        ['id'],
      ),
      async execute(args, exec) {
        const input = args as { id: string; version?: number }
        const service = await host.service(requireAgent(exec))
        return service.get(requireAgent(exec), input.id, input.version)
      },
    }),

    tool({
      name: 'memory_status',
      concurrencySafe: true,
      description:
        'Report memory hub diagnostics: version, root, workspace mapping, read-only state, entry counts, index diagnostics, and policy. Use it when memory tools fail or before asking the user to fix configuration.',
      parameters: objectSchema({}),
      async execute(_args, exec) {
        try {
          const service = await host.service(requireAgent(exec))
          return service.status(exec.agent)
        } catch {
          return host.status(exec.agent)
        }
      },
    }),

    tool({
      name: 'memory_preflight',
      description:
        'Run or refresh the memory preflight for the current task. The harness runs a preflight automatically at the start of each user turn; call this only when you need a fresh search after the task changed direction. Returns hits and the compact context pack.',
      parameters: objectSchema(
        {
          intent: { type: 'string', description: 'What the task is trying to do; used as the search query.' },
          force: { type: 'boolean', description: 'Re-run the search even when a preflight already exists.' },
        },
        ['intent'],
      ),
      async execute(args, exec) {
        const input = args as { intent: string; force?: boolean }
        const service = await host.service(requireAgent(exec))
        return service.manualPreflight(requireAgent(exec), input.intent, input.force === true)
      },
    }),

    tool({
      name: 'memory_cite',
      description:
        'Record that a memory entry actually influenced the current task. Search hits are not citations; call this only after using the entry. The same entry/version is deduplicated per task.',
      parameters: objectSchema(
        {
          knowledge_id: { type: 'string', description: 'Knowledge id being used.' },
          version: { type: 'number', description: 'Optional version; defaults to the current version.' },
          purpose: { type: 'string', description: 'How the entry was used, at most 200 characters.' },
          task_id: { type: 'string', description: 'Optional current task id; other tasks are rejected.' },
        },
        ['knowledge_id', 'purpose'],
      ),
      async execute(args, exec) {
        const input = args as { knowledge_id: string; version?: number; purpose: string; task_id?: string }
        const service = await host.service(requireAgent(exec))
        return service.cite(requireAgent(exec), {
          knowledge_id: input.knowledge_id,
          ...(input.version === undefined ? {} : { version: input.version }),
          purpose: input.purpose,
          ...(input.task_id === undefined ? {} : { task_id: input.task_id }),
        })
      },
    }),

    tool({
      name: 'memory_propose',
      description:
        'Create a candidate memory entry in pending/. Candidates are not authoritative: the user must approve memory_commit before anything becomes accepted knowledge. Include concrete evidence in source_refs; for decisions, constraints, processes, and API catalogs evidence is required at commit time.',
      parameters: objectSchema(
        {
          operation: { type: 'string', enum: ['create', 'update', 'deprecate'], description: 'What to do with the knowledge.' },
          type: { type: 'string', enum: [...KNOWLEDGE_TYPES], description: 'Knowledge type.' },
          scope: { type: 'string', description: 'global, domain:<id>, project:<workspace-id>, or core (alias for the current core workspace project scope, used to share reusable plugin-development knowledge).' },
          title: { type: 'string', description: 'Short title, at most 200 characters.' },
          summary: { type: 'string', description: 'One-sentence conclusion, at most 240 characters.' },
          content: { type: 'string', description: 'Markdown body for create/update; optional for deprecate.' },
          source_refs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Evidence refs: session:<id>#from-to, file:<path>, url:<https-url>, or note:<text>.',
          },
          tags: { type: 'array', items: { type: 'string' }, description: 'Up to 12 tags.' },
          related: { type: 'array', items: { type: 'string' }, description: 'Related knowledge ids.' },
          supersedes: { type: 'array', items: { type: 'string' }, description: 'Accepted ids this new entry replaces (create only).' },
          applies_to: {
            type: 'object',
            properties: {
              branches: { type: 'array', items: { type: 'string' } },
              versions: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
          target: { type: 'string', description: 'Target id for update/deprecate.' },
          expected_version: { type: 'number', description: 'Current target version for update/deprecate.' },
          reason: { type: 'string', description: 'Required for deprecate; recorded in the audit log.' },
        },
        ['operation', 'type', 'scope', 'title', 'summary'],
      ),
      async execute(args, exec) {
        const input = args as Record<string, unknown>
        const service = await host.service(requireAgent(exec))
        return service.propose(requireAgent(exec), {
          operation: input.operation as never,
          type: input.type as never,
          scope: String(input.scope),
          title: String(input.title),
          summary: String(input.summary),
          ...(input.content === undefined ? {} : { content: String(input.content) }),
          ...(input.source_refs === undefined ? {} : { source_refs: input.source_refs as string[] }),
          ...(input.tags === undefined ? {} : { tags: input.tags as string[] }),
          ...(input.related === undefined ? {} : { related: input.related as string[] }),
          ...(input.supersedes === undefined ? {} : { supersedes: input.supersedes as string[] }),
          ...(input.applies_to === undefined ? {} : { applies_to: input.applies_to as never }),
          ...(input.target === undefined ? {} : { target: String(input.target) }),
          ...(input.expected_version === undefined ? {} : { expected_version: Number(input.expected_version) }),
          ...(input.reason === undefined ? {} : { reason: String(input.reason) }),
        })
      },
    }),

    tool({
      name: 'memory_commit',
      description:
        'Commit a pending proposal after the user approves it. The harness asks the user through the native approval prompt before this tool executes; do not retry a rejected proposal and never claim approval yourself. In local test mode (policy.approval.mode=auto) the commit proceeds without a prompt and the ledger records approvalRef test:auto.',
      parameters: objectSchema(
        { proposal_id: { type: 'string', description: 'Pending proposal id, for example PRO-000001.' } },
        ['proposal_id'],
      ),
      async execute(args, exec) {
        const input = args as { proposal_id: string }
        const service = await host.service(requireAgent(exec))
        return service.commit(requireAgent(exec), input.proposal_id)
      },
    }),

    tool({
      name: 'memory_close_task',
      description:
        'Close the current task with a writeback assessment. Every task must be assessed; use no_new_knowledge when nothing durable was learned, needs_evidence when a candidate is blocked, and proposed only after creating the proposals.',
      parameters: objectSchema(
        {
          assessment: assessmentSchema,
          task_id: { type: 'string', description: 'Optional current task id; other tasks are rejected.' },
        },
        ['assessment'],
      ),
      async execute(args, exec) {
        const input = args as { assessment: unknown; task_id?: string }
        const service = await host.service(requireAgent(exec))
        return service.closeTask(requireAgent(exec), normalizeAssessment(input.assessment), input.task_id)
      },
    }),

    tool({
      name: 'memory_maintenance',
      description:
        'Run deterministic memory maintenance: scan the current hub (or all cores), write a Markdown report, and optionally create pending proposals for exact duplicates and explicitly reusable project knowledge. It never commits, deletes, or rewrites knowledge. Use it for a nightly review; review the pending proposals in the morning. Requires an admin workspace.',
      parameters: objectSchema({
        apply: {
          type: 'string',
          enum: ['report', 'propose'],
          description: 'report (default) writes only the report; propose also creates pending proposals.',
        },
        all_cores: {
          type: 'boolean',
          description: 'Scan every configured core hub, not only the current one; defaults to true.',
        },
        max_proposals: {
          type: 'number',
          description: 'Maximum pending proposals to create this run, 1..20; defaults to 10.',
        },
        stale_pending_days: {
          type: 'number',
          description: 'Report pending proposals older than this many days; defaults to 30.',
        },
        stale_citation_days: {
          type: 'number',
          description: 'Report accepted entries not cited for this many days; defaults to 90.',
        },
      }),
      async execute(args, exec) {
        const input = args as MaintenanceToolArgs
        return host.maintenance(requireAgent(exec), {
          ...(input.all_cores === undefined ? {} : { all_cores: input.all_cores }),
          ...(input.apply === undefined ? {} : { apply: input.apply }),
          ...(input.max_proposals === undefined ? {} : { max_proposals: input.max_proposals }),
          ...(input.stale_pending_days === undefined ? {} : { stale_pending_days: input.stale_pending_days }),
          ...(input.stale_citation_days === undefined ? {} : { stale_citation_days: input.stale_citation_days }),
        })
      },
    }),

    tool({
      name: 'memory_consolidate',
      description:
        'Manually promote accepted project knowledge into global/domain proposals. Requires an admin workspace. Produces pending proposals only; it never overwrites downstream entries. Safe to re-run: already-promoted keys are skipped.',
      parameters: objectSchema({
        workspace_ids: { type: 'array', items: { type: 'string' }, description: 'Workspace ids to scan; defaults to all enabled.' },
        types: knowledgeTypesSchema,
        dry_run: { type: 'boolean', description: 'Preview proposals without writing them.' },
      }),
      async execute(args, exec) {
        const input = args as { workspace_ids?: string[]; types?: string[]; dry_run?: boolean }
        const service = await host.service(requireAgent(exec))
        const result = await service.consolidate(requireAgent(exec), {
          ...(input.workspace_ids === undefined ? {} : { workspace_ids: input.workspace_ids }),
          ...(input.types === undefined ? {} : { types: input.types as never }),
          ...(input.dry_run === undefined ? {} : { dry_run: input.dry_run }),
        })
        return {
          dryRun: result.dryRun,
          skipped: result.skipped,
          proposals: result.created.map((proposal) => ({
            id: proposal.id,
            type: proposal.type,
            scope: proposal.scope,
            title: proposal.title,
            promotedFrom: proposal.promotedFrom,
          })),
        }
      },
    }),
  ]
}
