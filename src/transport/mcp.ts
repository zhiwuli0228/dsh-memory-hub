/**
 * MCP stdio transport（ADR-0010 S2 / V0.8）。
 *
 * 三层依赖里只允许 import `core`（hub/service/store/ledger）——本文件是 transport 层，
 * 不得引用 DSH 宿主包、不得触碰宿主的 web 服务注册面与客户端模块注册面
 * （tests/mcp-stdio.test.ts 有静态断言）。
 *
 * 协议：MCP stdio = 换行分隔的 JSON-RPC 2.0（单行一条，行内不得有换行）。
 * 零 SDK 依赖：只实现本产品需要的面——initialize / ping / tools/list / tools/call。
 *
 * 治理不变量在本层的体现：
 * - **不暴露 commit 通路**：`memory_commit` 恒定失败关闭（APPROVAL_UNAVAILABLE），
 *   即使 config 里 approval.mode=auto 也不放行——MCP 宿主没有原生审批 UI，
 *   审批走面板 / `memory-hub inbox --approve`（§4 三条不可协商之二）。
 * - **错误语义不自创**：MemoryError code 原样透传；非 MemoryError 才记 INTERNAL。
 * - headless 没有轮前钩子：写路径前用 `service.ensureTask` 补齐任务语义。
 */

import { createInterface } from 'node:readline'
import { MemoryError } from '../errors.js'
import { KNOWLEDGE_TYPES } from '../types.js'
import { formatScope } from '../scope.js'
import { assessmentSchema, knowledgeStatusesSchema, knowledgeTypesSchema, normalizeAssessment } from '../tools.js'
import { openMemoryHubForTransport, type TransportHandle } from './hub-handle.js'

/** headless 启动共享件已抽到 ./hub-handle.ts（MCP / CLI / serve 三入口共用）。 */
export { openMemoryHubForTransport, type TransportHandle } from './hub-handle.js'

/* ------------------------------------------------------------------ */
/* 工具目录（tool-surface.md §7 初版 8 个）                              */
/* ------------------------------------------------------------------ */

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  call: (args: Record<string, unknown>) => Promise<unknown>
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}), additionalProperties: false }
}

/** 工具目录 + 调用分发。MCP 与未来 CLI 共用这一份（tool-surface §6：不各写一套）。 */
export function createMemoryToolCatalog(handle: TransportHandle): McpToolDefinition[] {
  const { service, agent } = handle
  return [
    {
      name: 'memory_search',
      description:
        'Search the user\'s accepted long-term memory (project, domain, and global knowledge). Use it before planning or modifying a project, and after a preflight hint points at an entry. Returns ids, versions, summaries, and relative paths; call memory_get for the body and memory_cite after actually using an entry.',
      inputSchema: objectSchema(
        {
          query: { type: 'string', description: 'Keywords or a natural-language question.' },
          types: knowledgeTypesSchema,
          scope: { type: 'string', description: 'Optional exact scope filter: global, domain:<id>, or project:<workspace-id>.' },
          status: knowledgeStatusesSchema,
          limit: { type: 'number', description: 'Maximum hits, 1..20; defaults to 8.' },
          detail: {
            type: 'string',
            enum: ['brief', 'ids'],
            description: 'brief (default) returns summaries and snippets; ids returns only id/version/type/title/scope.',
          },
        },
        ['query'],
      ),
      call: async (args) => {
        const input = args as { query: string; types?: string[]; scope?: string; status?: string[]; limit?: number; detail?: 'brief' | 'ids' }
        const result = await service.search(agent, {
          query: input.query,
          ...(input.types === undefined ? {} : { types: input.types as never }),
          ...(input.scope === undefined ? {} : { scope: input.scope }),
          ...(input.status === undefined ? {} : { statuses: input.status as never }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        })
        if (input.detail !== 'ids') return result
        return {
          total: result.total,
          hits: result.hits.map((hit) => ({
            id: hit.id,
            version: hit.version,
            type: hit.type,
            title: hit.title,
            scope: formatScope(hit.scope),
            ...(hit.core === undefined || hit.core === null ? {} : { core: hit.core }),
          })),
        }
      },
    },
    {
      name: 'memory_get',
      description:
        'Read one memory entry. By default returns its metadata plus the conclusion section and a list of section headings; pass section to read one named section or full:true to read everything. Use the id from memory_search or the preflight hint; pass version only when you need a historical version.',
      inputSchema: objectSchema(
        {
          id: { type: 'string', description: 'Knowledge id, for example DEC-000001.' },
          version: { type: 'number', description: 'Optional historical version; defaults to the current version.' },
          section: { type: 'string', description: 'Optional heading title to read one section only (exact match first, then substring).' },
          full: { type: 'boolean', description: 'Return the entire body instead of the digest.' },
          max_chars: { type: 'number', description: 'Cap the returned text, 200..20000.' },
        },
        ['id'],
      ),
      call: async (args) => {
        const input = args as { id: string; version?: number; section?: string; full?: boolean; max_chars?: number }
        const options: { full?: boolean; section?: string; max_chars?: number } = {}
        if (input.full !== undefined) options.full = input.full
        if (input.section !== undefined) options.section = input.section
        if (input.max_chars !== undefined) options.max_chars = input.max_chars
        return service.get(agent, input.id, input.version, undefined, options)
      },
    },
    {
      name: 'memory_status',
      description:
        'Report memory hub diagnostics: version, root, workspace mapping, read-only state, entry counts, index diagnostics, and policy. Use it when memory tools fail or before asking the user to fix configuration.',
      inputSchema: objectSchema({}),
      call: async () => service.status(agent),
    },
    {
      name: 'memory_preflight',
      description:
        'Run or refresh the memory preflight for the current task. Non-DSH hosts have no automatic per-turn injection; call this at the start of a task (or when the task changes direction) to pull the relevant memory into context. Returns hits and the compact context pack.',
      inputSchema: objectSchema(
        {
          intent: { type: 'string', description: 'What the task is trying to do; used as the search query.' },
          force: { type: 'boolean', description: 'Re-run the search even when a preflight already exists.' },
        },
        ['intent'],
      ),
      call: async (args) => {
        const input = args as { intent: string; force?: boolean }
        await service.ensureTask(agent, input.intent)
        return service.manualPreflight(agent, input.intent, input.force === true)
      },
    },
    {
      name: 'memory_cite',
      description:
        'Record that a memory entry actually influenced the current task. Search hits are not citations; call this only after using the entry. The same entry/version is deduplicated per task.',
      inputSchema: objectSchema(
        {
          knowledge_id: { type: 'string', description: 'Knowledge id being used.' },
          version: { type: 'number', description: 'Optional version; defaults to the current version.' },
          purpose: { type: 'string', description: 'How the entry was used, at most 200 characters.' },
        },
        ['knowledge_id', 'purpose'],
      ),
      call: async (args) => {
        const input = args as { knowledge_id: string; version?: number; purpose: string }
        await service.ensureTask(agent, input.purpose)
        return service.cite(agent, {
          knowledge_id: input.knowledge_id,
          ...(input.version === undefined ? {} : { version: input.version }),
          purpose: input.purpose,
        })
      },
    },
    {
      name: 'memory_propose',
      description:
        'Create a candidate memory entry in pending/. Candidates are not authoritative: the user must approve before anything becomes accepted knowledge. Include concrete evidence in source_refs; for decisions, constraints, processes, and API catalogs evidence is required at commit time. The text is scanned for prompt-injection phrases, credential shapes and invisible characters: the response carries a risk flag for the human reviewer, but creation is never blocked.',
      inputSchema: objectSchema(
        {
          operation: { type: 'string', enum: ['create', 'update', 'deprecate', 'merge'], description: 'What to do with the knowledge.' },
          type: { type: 'string', enum: [...KNOWLEDGE_TYPES], description: 'Knowledge type.' },
          scope: { type: 'string', description: 'global, domain:<id>, project:<workspace-id>, or core.' },
          title: { type: 'string', description: 'Short title, at most 200 characters.' },
          summary: { type: 'string', description: 'One-sentence conclusion, at most 240 characters.' },
          content: { type: 'string', description: 'Markdown body for create/update; optional for deprecate.' },
          source_refs: { type: 'array', items: { type: 'string' }, description: 'Evidence refs: session:<id>#from-to, file:<path>, url:<https-url>, or note:<text>.' },
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
          merged_ids: { type: 'array', items: { type: 'string' }, maxItems: 10, description: 'Merge only: accepted ids to fold into target (1..10).' },
          valid_from: { type: 'string', description: 'Optional ISO 8601 timestamp: when the fact starts to hold.' },
          expires_at: { type: 'string', description: 'Optional ISO 8601 timestamp: when the fact stops being trustworthy.' },
          last_verified: { type: 'string', description: 'Optional ISO 8601 timestamp: when the fact was last confirmed.' },
        },
        ['operation', 'type', 'scope', 'title', 'summary'],
      ),
      call: async (args) => {
        const input = args as Record<string, unknown>
        // propose 也要挂在任务上（候选记 taskId）：headless 没有轮前钩子，先补开任务。
        await service.ensureTask(agent, String(input.title))
        return service.propose(agent, {
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
          ...(input.valid_from === undefined ? {} : { valid_from: String(input.valid_from) }),
          ...(input.expires_at === undefined ? {} : { expires_at: String(input.expires_at) }),
          ...(input.last_verified === undefined ? {} : { last_verified: String(input.last_verified) }),
          ...(input.merged_ids === undefined ? {} : { merged_ids: input.merged_ids as string[] }),
        })
      },
    },
    {
      name: 'memory_commit',
      description:
        'Commit a pending proposal after a HUMAN approves it. Over MCP this always fails closed: the MCP host has no native approval prompt, so the model can never self-approve. Direct the user to the review panel or `memory-hub inbox --approve <ID>`.',
      inputSchema: objectSchema(
        {
          proposal_id: { type: 'string', description: 'Pending proposal id, for example PRO-000001.' },
        },
        ['proposal_id'],
      ),
      call: async (args) => {
        const input = args as { proposal_id: string }
        // 失败关闭（tool-surface §4）：MCP 宿主没有原生审批，恒定拒批——
        // 即使 config.approval.mode=auto 也不放行。审批是人敲面板/CLI 的动作。
        throw new MemoryError(
          'APPROVAL_UNAVAILABLE',
          `proposal ${input.proposal_id} needs human approval: approve it in the review panel or run \`memory-hub inbox --approve ${input.proposal_id}\`. The model cannot self-approve (invariant 2).`,
        )
      },
    },
    {
      name: 'memory_close_task',
      description:
        'Close the current task with a writeback assessment. Every task must be assessed; use no_new_knowledge when nothing durable was learned, needs_evidence when a candidate is blocked, and proposed only after creating the proposals.',
      inputSchema: objectSchema(
        {
          assessment: assessmentSchema,
        },
        ['assessment'],
      ),
      call: async (args) => {
        const input = args as { assessment: unknown }
        await service.ensureTask(agent, 'close task with writeback assessment')
        return service.closeTask(agent, normalizeAssessment(input.assessment))
      },
    },
  ]
}

/* ------------------------------------------------------------------ */
/* JSON-RPC 派发（纯函数，进程内可测）                                    */
/* ------------------------------------------------------------------ */

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface McpRpcOptions {
  serverInfo: { name: string; version: string }
  tools: McpToolDefinition[]
  /** MCP protocolVersion 回显；缺省 '2024-11-05'。 */
  protocolVersion?: string
}

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602

/** 单条 JSON-RPC 消息 → 响应（notification 返回 null，不回包）。 */
export function createMcpRpcHandler(options: McpRpcOptions): (message: unknown) => Promise<JsonRpcResponse | null> {
  const supportedVersions = new Set(['2024-11-05', '2025-06-18', options.protocolVersion ?? '2024-11-05'])
  const fallbackVersion = options.protocolVersion ?? '2024-11-05'
  const tools = new Map(options.tools.map((tool) => [tool.name, tool]))
  return async (raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { jsonrpc: '2.0', id: null, error: { code: INVALID_REQUEST, message: 'request must be a JSON object' } }
    }
    const message = raw as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }
    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return { jsonrpc: '2.0', id: normalizeId(message.id), error: { code: INVALID_REQUEST, message: 'missing jsonrpc:2.0 or method' } }
    }
    const isNotification = message.id === undefined
    const id = normalizeId(message.id)
    const reply = (result: unknown): JsonRpcResponse | null => (isNotification ? null : { jsonrpc: '2.0', id, result })
    const fail = (code: number, text: string): JsonRpcResponse | null => (isNotification ? null : { jsonrpc: '2.0', id, error: { code, message: text } })

    if (message.method === 'initialize') {
      // 版本协商：客户端请求的版本在支持集合内就回显，否则回退自己支持的最新版。
      const requested = (message.params as { protocolVersion?: unknown } | undefined)?.protocolVersion
      const agreed = typeof requested === 'string' && supportedVersions.has(requested) ? requested : fallbackVersion
      return reply({
        protocolVersion: agreed,
        capabilities: { tools: { listChanged: false } },
        serverInfo: options.serverInfo,
      })
    }
    if (message.method === 'ping') return reply({})
    if (message.method === 'tools/list') {
      return reply({
        tools: options.tools.map(({ call: _call, ...meta }) => meta),
      })
    }
    if (message.method === 'tools/call') {
      const params = (message.params ?? {}) as { name?: unknown; arguments?: unknown }
      if (typeof params.name !== 'string') return fail(INVALID_PARAMS, 'tools/call requires params.name')
      const tool = tools.get(params.name)
      if (tool === undefined) return fail(INVALID_PARAMS, `unknown tool: ${params.name}`)
      const args = (params.arguments ?? {}) as Record<string, unknown>
      try {
        const result = await tool.call(args)
        return reply({
          content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
          isError: false,
        })
      } catch (error) {
        const text = error instanceof MemoryError
          ? error.message // code 原样透传（tool-surface §5：错误语义不自创）
          : `[INTERNAL] ${(error as Error).message}`
        return reply({ content: [{ type: 'text', text }], isError: true })
      }
    }
    if (message.method.startsWith('notifications/')) return null
    return fail(METHOD_NOT_FOUND, `unknown method: ${message.method}`)
  }
}

function normalizeId(id: unknown): number | string | null {
  if (typeof id === 'number' || typeof id === 'string') return id
  return null
}

/* ------------------------------------------------------------------ */
/* stdio 主循环                                                          */
/* ------------------------------------------------------------------ */

/** 换行分隔 JSON-RPC：stdin 逐行读，stdout 逐行写。stdin 结束即退出。 */
export async function runMcpStdio(
  handle: TransportHandle,
  options: McpRpcOptions & { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream } = { serverInfo: { name: 'memory-hub', version: '0.0.0' }, tools: [] },
): Promise<void> {
  const handler = createMcpRpcHandler(options)
  const output = options.output ?? process.stdout
  const input = options.input ?? process.stdin
  const lines = createInterface({ input: input as NodeJS.ReadableStream, crlfDelay: Infinity })
  await new Promise<void>((resolveP, rejectP) => {
    lines.on('line', (line) => {
      const trimmed = line.trim()
      if (trimmed === '') return
      let message: unknown
      try {
        message = JSON.parse(trimmed)
      } catch (error) {
        writeLine(output, { jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: `invalid JSON: ${(error as Error).message}` } })
        return
      }
      void handler(message)
        .then((response) => {
          if (response !== null) writeLine(output, response)
        })
        .catch((error: unknown) => {
          // 派发器自己不该抛；兜底成 -32603，保住进程不因单条消息崩掉。
          writeLine(output, { jsonrpc: '2.0', id: null, error: { code: -32603, message: (error as Error).message } })
        })
    })
    lines.on('close', () => resolveP())
    lines.on('error', (error) => rejectP(error))
  })
}

function writeLine(output: NodeJS.WritableStream, payload: JsonRpcResponse): void {
  output.write(`${JSON.stringify(payload)}\n`)
}
