/**
 * MCP stdio transport（ADR-0010 S2 / tool-surface §7 初版 8 工具）。
 *
 * 保护五件事：
 * 1. **分层**：transport 不得 import `@deepseek-ai/*`，不得出现 `webServer` / `clientModules`（静态断言）；
 * 2. 握手与工具面：initialize / tools/list 恰好 8 个，名字与 tool-surface §7 一致；
 * 3. **审批不变量**：`memory_commit` 恒定失败关闭（APPROVAL_UNAVAILABLE），pending 不被动；
 * 4. headless 任务语义：cite / close_task 无轮前钩子时自动开任务；
 * 5. stdio 帧协议：换行分隔 JSON-RPC，坏 JSON 回 -32700 不崩进程。
 */

import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { Hub } from '../src/hub.js'
import { Ledger } from '../src/ledger.js'
import { KnowledgeStore } from '../src/store.js'
import {
  createMemoryToolCatalog,
  createMcpRpcHandler,
  openMemoryHubForTransport,
  runMcpStdio,
  type TransportHandle,
} from '../src/transport/mcp.js'

let handle: TransportHandle | null = null
let root: string | null = null

afterEach(async () => {
  if (handle !== null) {
    await handle.dispose()
    handle = null
  }
  if (root !== null) {
    await rm(root, { recursive: true, force: true })
    root = null
  }
})

/** 开 transport 之前先以 store 直连方式塞一条 accepted 知识（绕开审批面，构造数据）。 */
async function seedAccepted(target: string, title: string, tags: string[] = []): Promise<string> {
  const hub = await Hub.open({ root: target, lock: false })
  const ledger = new Ledger(hub.ledgerPath())
  await ledger.load()
  const store = new KnowledgeStore(hub, ledger)
  await store.load()
  try {
    const proposal = await store.propose(
      {
        operation: 'create',
        type: 'decision',
        scope: 'global',
        title,
        summary: `${title} 的结论。`,
        content: `## 结论\n${title}。\n`,
        sourceRefs: ['note:mcp test fixture'],
        ...(tags.length > 0 ? { tags } : {}),
      },
      { taskId: 'TSK-mcp-seed' },
    )
    const { record } = await store.commit(proposal.id)
    return record.id
  } finally {
    store.closeIndex()
    await hub.close()
    await ledger.close()
  }
}

async function openHandle(): Promise<TransportHandle> {
  root = await mkdtemp(join(tmpdir(), 'dsh-mcp-test-'))
  handle = await openMemoryHubForTransport({ root, cwd: root })
  return handle
}

async function seedAndOpen(title: string): Promise<{ handle: TransportHandle; knowledgeId: string }> {
  const target = await mkdtemp(join(tmpdir(), 'dsh-mcp-test-'))
  root = target
  const knowledgeId = await seedAccepted(target, title)
  handle = await openMemoryHubForTransport({ root: target, cwd: target })
  return { handle, knowledgeId }
}

function rpc(id: number, method: string, params?: unknown): unknown {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }
}

function toolResultText(result: unknown): string {
  const payload = result as { content?: Array<{ type: string; text?: string }> }
  return payload.content?.map((part) => part.text ?? '').join('') ?? ''
}

const SERVER_INFO = { name: 'memory-hub', version: '0.0.0-test' }

describe('MCP layering (ADR-0010 hard rule)', () => {
  it('transport sources never reference DSH host modules', async () => {
    for (const file of ['src/transport/mcp.ts', 'src/cli.ts', 'src/version.ts']) {
      const source = await readFile(join(process.cwd(), file), 'utf8')
      expect(source, `${file} must not import @deepseek-ai/*`).not.toContain('@deepseek-ai/')
      expect(source, `${file} must not touch webServer`).not.toContain('webServer')
      expect(source, `${file} must not touch clientModules`).not.toContain('clientModules')
    }
  })
})

describe('MCP RPC surface', () => {
  it('answers initialize with serverInfo and capabilities', async () => {
    const { handle: opened } = await seedAndOpen('握手测试')
    const handler = createMcpRpcHandler({ serverInfo: SERVER_INFO, tools: createMemoryToolCatalog(opened) })
    const response = await handler(rpc(1, 'initialize', { protocolVersion: '2025-06-18' }))
    const result = (response as { result?: Record<string, unknown> }).result ?? {}
    expect(result.protocolVersion).toBe('2025-06-18')
    expect(result.serverInfo).toEqual(SERVER_INFO)
    expect((result.capabilities as Record<string, unknown>).tools).toBeDefined()
  })

  it('lists exactly the 8 tool-surface tools', async () => {
    const { handle: opened } = await seedAndOpen('工具面测试')
    const handler = createMcpRpcHandler({ serverInfo: SERVER_INFO, tools: createMemoryToolCatalog(opened) })
    const response = await handler(rpc(2, 'tools/list'))
    const tools = (response as { result?: { tools?: Array<{ name: string }> } }).result?.tools ?? []
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'memory_close_task',
      'memory_commit',
      'memory_cite',
      'memory_get',
      'memory_preflight',
      'memory_propose',
      'memory_search',
      'memory_status',
    ].sort())
    // 每个工具都带 inputSchema 与描述（宿主要靠它渲染给模型）。
    for (const tool of tools) {
      expect((tool as unknown as { inputSchema: unknown }).inputSchema).toBeDefined()
      expect((tool as unknown as { description: string }).description.length).toBeGreaterThan(20)
    }
  })

  it('searches seeded knowledge and returns structured hits', async () => {
    const { handle: opened } = await seedAndOpen('写锁租约决策')
    const handler = createMcpRpcHandler({ serverInfo: SERVER_INFO, tools: createMemoryToolCatalog(opened) })
    const response = await handler(rpc(3, 'tools/call', { name: 'memory_search', arguments: { query: '写锁租约' } }))
    const result = JSON.parse(toolResultText(response!.result)) as { total: number; hits: Array<{ id: string; title: string; scope: { level: string } }> }
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.hits[0]!.scope.level).toBe('global')
  })

  it('returns [NOT_FOUND] for unknown ids instead of crashing', async () => {
    const { handle: opened } = await seedAndOpen('错误语义')
    const handler = createMcpRpcHandler({ serverInfo: SERVER_INFO, tools: createMemoryToolCatalog(opened) })
    const response = await handler(rpc(4, 'tools/call', { name: 'memory_get', arguments: { id: 'DEC-999999' } }))
    expect((response!.result as { isError: boolean }).isError).toBe(true)
    expect(toolResultText(response!.result)).toContain('[NOT_FOUND]')
  })

  it('status reports an initialized hub', async () => {
    const { handle: opened } = await seedAndOpen('状态测试')
    const handler = createMcpRpcHandler({ serverInfo: SERVER_INFO, tools: createMemoryToolCatalog(opened) })
    const response = await handler(rpc(5, 'tools/call', { name: 'memory_status', arguments: {} }))
    const result = JSON.parse(toolResultText(response!.result)) as { initialized: boolean; version: string }
    expect(result.initialized).toBe(true)
  })
})

describe('MCP approval invariant (fail closed)', () => {
  it('memory_commit always refuses and leaves the proposal pending', async () => {
    const { handle: opened } = await seedAndOpen('审批测试')
    const tools = createMemoryToolCatalog(opened)
    const handler = createMcpRpcHandler({ serverInfo: SERVER_INFO, tools })

    // 模型先 propose 一个候选 → pending/ 落盘。
    const proposeResponse = await handler(rpc(10, 'tools/call', {
      name: 'memory_propose',
      arguments: {
        operation: 'create',
        type: 'knowledge',
        scope: 'global',
        title: 'MCP 候选',
        summary: '由 MCP 面提出的候选，等人批准。',
        content: '## 结论\n等人批准。\n',
        source_refs: ['note:mcp propose test'],
      },
    }))
    const proposal = JSON.parse(toolResultText(proposeResponse!.result)) as { proposalId: string; pendingPath: string }
    expect(proposal.proposalId).toMatch(/^PRO-/)
    const pendingBefore = await readdir(join(root!, 'pending'))
    expect(pendingBefore.some((file) => file.startsWith('PRO-'))).toBe(true)

    // commit 恒定失败关闭：无论 config 里 approval.mode 是什么。
    const commitResponse = await handler(rpc(11, 'tools/call', { name: 'memory_commit', arguments: { proposal_id: proposal.proposalId } }))
    const commitResult = commitResponse!.result as { isError: boolean }
    expect(commitResult.isError).toBe(true)
    expect(toolResultText(commitResponse!.result)).toContain('[APPROVAL_UNAVAILABLE]')
    expect(toolResultText(commitResponse!.result)).toContain('memory-hub inbox --approve')

    // pending 原封不动：候选没有被偷渡进 knowledge/。
    const pendingAfter = await readdir(join(root!, 'pending'))
    expect(pendingAfter.some((file) => file.startsWith('PRO-'))).toBe(true)
    const knowledgeFiles = await readdir(join(root!, 'knowledge')).catch(() => [] as string[])
    expect(knowledgeFiles.some((file) => file.startsWith('PRO-'))).toBe(false)
  })
})

describe('MCP headless task semantics', () => {
  it('cite auto-opens a task and close_task finishes it without any preflight hook', async () => {
    const { handle: opened, knowledgeId } = await seedAndOpen('无宿主引用')
    const tools = createMemoryToolCatalog(opened)
    const handler = createMcpRpcHandler({ serverInfo: SERVER_INFO, tools })

    const citeResponse = await handler(rpc(20, 'tools/call', {
      name: 'memory_cite',
      arguments: { knowledge_id: knowledgeId, purpose: 'MCP 会话里真的用到了这条' },
    }))
    const citation = JSON.parse(toolResultText(citeResponse!.result)) as { citationId: string }
    expect(citation.citationId).toMatch(/^CIT-/)

    const closeResponse = await handler(rpc(21, 'tools/call', {
      name: 'memory_close_task',
      arguments: { assessment: { kind: 'no_new_knowledge', reason: '只读任务' } },
    }))
    const closed = JSON.parse(toolResultText(closeResponse!.result)) as { closed: boolean }
    expect(closed.closed).toBe(true)
  })

  it('preflight opens a task and returns the context pack', async () => {
    const { handle: opened } = await seedAndOpen('无宿主预检')
    const tools = createMemoryToolCatalog(opened)
    const handler = createMcpRpcHandler({ serverInfo: SERVER_INFO, tools })
    const response = await handler(rpc(22, 'tools/call', { name: 'memory_preflight', arguments: { intent: '无宿主预检' } }))
    const result = JSON.parse(toolResultText(response!.result)) as { hits: Array<{ id: string }> }
    expect(result.hits.length).toBeGreaterThanOrEqual(1)
  })
})

describe('MCP stdio framing', () => {
  it('answers newline-delimited JSON-RPC and survives malformed lines', async () => {
    const { handle: opened } = await seedAndOpen('帧协议')
    const input = new PassThrough()
    const output = new PassThrough()
    const run = runMcpStdio(opened, { serverInfo: SERVER_INFO, tools: createMemoryToolCatalog(opened), input, output })

    const readLine = (): Promise<string> => new Promise((resolveP, rejectP) => {
      output.once('data', (chunk: Buffer) => resolveP(chunk.toString('utf8')))
      output.once('error', rejectP)
    })

    input.write('not-json-at-all\n')
    const parseErrorResponse = JSON.parse(await readLine()) as { error?: { code: number } }
    expect(parseErrorResponse.error?.code).toBe(-32700)

    input.write(`${JSON.stringify(rpc(30, 'initialize', {}))}\n`)
    const init = JSON.parse(await readLine()) as { id: number; result: { serverInfo: { name: string } } }
    expect(init.id).toBe(30)
    expect(init.result.serverInfo.name).toBe('memory-hub')

    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
    input.write(`${JSON.stringify(rpc(31, 'no/such/method'))}\n`)
    const unknown = JSON.parse(await readLine()) as { id: number; error?: { code: number } }
    expect(unknown.id).toBe(31)
    expect(unknown.error?.code).toBe(-32601)

    input.write(`${JSON.stringify(rpc(32, 'tools/call', { name: 'no_such_tool', arguments: {} }))}\n`)
    const badTool = JSON.parse(await readLine()) as { error?: { code: number } }
    expect(badTool.error?.code).toBe(-32602)

    input.end()
    await run
  })
})
