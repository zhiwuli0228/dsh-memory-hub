/**
 * HTTP router 唯一实现 + `memory-hub serve`（ADR-0010 S1/S3）。
 *
 * 保护六件事：
 * 1. **分层**：router/server 不 import DSH 宿主包、不触碰客户端模块注册面（静态断言）；
 * 2. 端点行为与抽取前等价（overview/knowledge/sessions/hubs/config/pending + 404/405/403）；
 * 3. **Host 白名单**（421）只在 fixed-port 模式生效，内嵌挂载不受影响；
 * 4. **写令牌**（401）只在 fixed-port 模式生效——内嵌 client.js 无需改一行；
 * 5. pending 审批守卫链不变（x-dmh-review + 本机 Origin + policy.panel.review + 批量上限）；
 * 6. serve 真服务器：server.json、token 文件、EADDRINUSE 报错不改口、Host 伪造 421。
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { get } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryRouter, type MemoryRouterDeps, type RouterPack } from '../src/http/router.js'
import { renderPanelHtml } from '../src/http/panel.js'
import { startServeServer, stopServeServer, type ServeServerHandle } from '../src/http/server.js'
import { openMemoryHubForTransport } from '../src/transport/hub-handle.js'
import { Hub } from '../src/hub.js'
import { Ledger } from '../src/ledger.js'
import { KnowledgeStore } from '../src/store.js'
import type { Hub as HubType } from '../src/hub.js'
import type { MemoryService } from '../src/service.js'
import type { HttpRequestLike, HttpResponseLike } from '../src/host.js'

let cleanupRoots: string[] = []
let serveHandle: ServeServerHandle | null = null

afterEach(async () => {
  if (serveHandle !== null) {
    await serveHandle.close()
    serveHandle = null
  }
  for (const dir of cleanupRoots) await rm(dir, { recursive: true, force: true })
  cleanupRoots = []
})

async function makeRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-router-test-'))
  cleanupRoots.push(dir)
  return dir
}

/* ---------------- stub 装置 ---------------- */

interface StubServiceOverrides {
  overview?: () => Record<string, unknown>
  knowledgeDetail?: (id: string, core?: string) => unknown
  updateConfig?: (body: unknown) => Promise<Record<string, unknown>>
  approveProposal?: (id: string) => Promise<{ knowledgeId: string; version: number }>
  rejectProposal?: (id: string, reason?: string) => Promise<{ status: string }>
}

function stubService(overrides: StubServiceOverrides = {}): MemoryService {
  return {
    overview: () => overrides.overview?.() ?? { version: 'stub', initialized: true },
    knowledgeDetail: (id: string, core?: string) => (overrides.knowledgeDetail ? overrides.knowledgeDetail(id, core) : ({ id, core: core ?? null })),
    config: () => ({ version: 'stub' }),
    updateConfig: async (body: unknown) => (overrides.updateConfig ? overrides.updateConfig(body) : ({ ok: true, body })),
    approveProposal: async (id: string) => (overrides.approveProposal ? overrides.approveProposal(id) : ({ knowledgeId: `KNO-${id}`, version: 1 })),
    rejectProposal: async (id: string, reason?: string) => (overrides.rejectProposal ? overrides.rejectProposal(id, reason) : ({ status: 'rejected', reason: reason ?? null })),
  } as unknown as MemoryService
}

function stubHub(reviewEnabled = true): HubType {
  return { config: { policy: { panel: { review: reviewEnabled } } } } as unknown as HubType
}

function stubPack(service: MemoryService, hub: Hub = stubHub()): RouterPack {
  return { service, hub }
}

function baseDeps(pack: RouterPack, overrides: Partial<MemoryRouterDeps> = {}): MemoryRouterDeps {
  return {
    resolvePack: () => pack,
    clientExtras: () => ({ advertised: true, url: '/dsh-memory-hub/client.js' }),
    distillReport: () => ({ configured: 0 }),
    reflectReport: () => null,
    hubs: () => [{ id: '', root: '/tmp/hub' }, { id: 'core-x', root: '/tmp/core-x' }],
    hostMode: { kind: 'embedded' },
    writeToken: () => null,
    ...overrides,
  }
}

interface StubResponseState {
  status?: number
  headers?: Record<string, unknown>
  body?: Buffer
}

function stubResponse(): StubResponseState & HttpResponseLike {
  const bag: Record<string, unknown> = {}
  bag.writableEnded = false
  bag.writeHead = (status: number, headers: Record<string, unknown>) => {
    bag.status = status
    bag.headers = headers
    return bag
  }
  bag.end = (body?: unknown) => {
    bag.writableEnded = true
    if (typeof body === 'string') bag.body = Buffer.from(body)
    else if (Buffer.isBuffer(body)) bag.body = body
  }
  return bag as unknown as StubResponseState & HttpResponseLike
}

function stubRequest(options: { method?: string; url?: string; headers?: Record<string, unknown>; remoteAddress?: string; body?: unknown } = {}): HttpRequestLike {
  const bodyText = options.body === undefined ? '' : JSON.stringify(options.body)
  const bodyBuffer = Buffer.from(bodyText)
  return {
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    headers: options.headers ?? {},
    socket: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
    on(event: string, listener: (...args: unknown[]) => void) {
      if (event === 'data' && bodyBuffer.length > 0) listener(bodyBuffer)
      if (event === 'end') listener()
      return stubRequest(options)
    },
  } as unknown as HttpRequestLike
}

async function route(deps: MemoryRouterDeps, request: HttpRequestLike): Promise<StubResponseState> {
  const state = stubResponse()
  await createMemoryRouter(deps)(request, state)
  return state
}

/* ---------------- 静态分层断言 ---------------- */

describe('router layering (ADR-0010 hard rule)', () => {
  it('http transport sources never reference DSH host modules', async () => {
    for (const file of ['src/http/router.ts', 'src/http/server.ts']) {
      const source = await readFile(join(process.cwd(), file), 'utf8')
      expect(source, `${file} must not import @deepseek-ai/*`).not.toContain('@deepseek-ai/')
      expect(source, `${file} must not touch web server registration`).not.toContain('webServer')
      expect(source, `${file} must not touch client module registration`).not.toContain('clientModules')
    }
  })
})

/* ---------------- 端点等价性 ---------------- */

describe('router endpoints (S1 extraction stays equivalent)', () => {
  it('serves overview with client extras and distill report', async () => {
    const pack = stubPack(stubService({ overview: () => ({ version: 'stub', initialized: true, entries: 7 }) }))
    const state = await route(baseDeps(pack), stubRequest({ url: '/dsh-memory-hub/api/overview' }))
    expect(state.status).toBe(200)
    const payload = JSON.parse(state.body!.toString('utf8'))
    expect(payload.entries).toBe(7)
    expect(payload.client).toEqual({ advertised: true, url: '/dsh-memory-hub/client.js' })
    expect(payload.distill).toEqual({ configured: 0 })
  })

  it('keeps 400/404/405/403 guard responses', async () => {
    const pack = stubPack(stubService())
    const deps = baseDeps(pack)
    expect((await route(deps, stubRequest({ url: '/dsh-memory-hub/api/knowledge' }))).status).toBe(400)
    expect((await route(deps, stubRequest({ method: 'PUT', url: '/dsh-memory-hub/api/overview' }))).status).toBe(405)
    expect((await route(deps, stubRequest({ url: '/dsh-memory-hub/nope' }))).status).toBe(404)
    expect((await route(deps, stubRequest({ remoteAddress: '203.0.113.9', url: '/dsh-memory-hub/api/overview' }))).status).toBe(403)
  })

  it('knowledge detail returns 404 for missing ids and passes core through', async () => {
    const pack = stubPack(stubService({
      knowledgeDetail: (id, core) => (id === 'DEC-1' ? { id, core: core ?? null, title: '决策' } : null),
    }))
    const deps = baseDeps(pack)
    const ok = await route(deps, stubRequest({ url: '/dsh-memory-hub/api/knowledge?id=DEC-1&core=core-x' }))
    expect(ok.status).toBe(200)
    expect(JSON.parse(ok.body!.toString('utf8')).core).toBe('core-x')
    const missing = await route(deps, stubRequest({ url: '/dsh-memory-hub/api/knowledge?id=NOPE' }))
    expect(missing.status).toBe(404)
  })

  it('sessions endpoint falls back to unavailable when the host cannot list sessions', async () => {
    const pack = stubPack(stubService())
    const withoutHost = await route(baseDeps(pack), stubRequest({ url: '/dsh-memory-hub/api/sessions' }))
    expect(JSON.parse(withoutHost.body!.toString('utf8')).unavailable).toBe(true)
    const withHost = await route(baseDeps(pack, { listSessions: async () => ({ unavailable: false, items: [{ sessionId: 's1', cwd: null, title: 't', updatedAt: 1, blank: false }] }) }), stubRequest({ url: '/dsh-memory-hub/api/sessions' }))
    expect(JSON.parse(withHost.body!.toString('utf8')).items).toHaveLength(1)
  })

  it('hubs endpoint lists the registry via deps', async () => {
    const state = await route(baseDeps(stubPack(stubService())), stubRequest({ url: '/dsh-memory-hub/api/hubs' }))
    const payload = JSON.parse(state.body!.toString('utf8')) as { cores: Array<{ id: string }> }
    expect(payload.cores.map((core) => core.id)).toEqual(['', 'core-x'])
  })

  it('config POST works in embedded mode without any token', async () => {
    let received: unknown = null
    const pack = stubPack(stubService({ updateConfig: async (body) => { received = body; return { ok: true } } }))
    const state = await route(baseDeps(pack), stubRequest({ method: 'POST', url: '/dsh-memory-hub/api/config', body: { remote: { enabled: false } } }))
    expect(state.status).toBe(200)
    expect(received).toEqual({ remote: { enabled: false } })
  })
})

/* ---------------- ADR-0010 §6：Host 白名单 + 写令牌 ---------------- */

describe('fixed-port guards (host whitelist + write token)', () => {
  const fixedPort = { hostMode: { kind: 'fixed-port' as const, port: 7331 } }

  it('rejects forged host headers with 421 but accepts loopback variants', async () => {
    const deps = baseDeps(stubPack(stubService()), fixedPort)
    const forged = await route(deps, stubRequest({ url: '/dsh-memory-hub/api/overview', headers: { host: 'evil.example' } }))
    expect(forged.status).toBe(421)
    const missing = await route(deps, stubRequest({ url: '/dsh-memory-hub/api/overview', headers: {} }))
    expect(missing.status).toBe(421)
    for (const host of ['127.0.0.1:7331', 'localhost:7331', '[::1]:7331']) {
      const ok = await route(deps, stubRequest({ url: '/dsh-memory-hub/api/overview', headers: { host } }))
      expect(ok.status).toBe(200)
    }
    // 内嵌挂载不受 Host 闸影响
    const embedded = await route(baseDeps(stubPack(stubService())), stubRequest({ url: '/dsh-memory-hub/api/overview', headers: { host: 'evil.example' } }))
    expect(embedded.status).toBe(200)
  })

  it('requires x-dmh-token on POST in fixed-port mode; embedded stays token-free', async () => {
    const deps = baseDeps(stubPack(stubService({ updateConfig: async () => ({ ok: true }) })), { ...fixedPort, writeToken: () => 'tok-123' })
    const none = await route(deps, stubRequest({ method: 'POST', url: '/dsh-memory-hub/api/config', headers: { host: '127.0.0.1:7331' }, body: {} }))
    expect(none.status).toBe(401)
    const wrong = await route(deps, stubRequest({ method: 'POST', url: '/dsh-memory-hub/api/config', headers: { host: '127.0.0.1:7331', 'x-dmh-token': 'tok-wrong' }, body: {} }))
    expect(wrong.status).toBe(401)
    const right = await route(deps, stubRequest({ method: 'POST', url: '/dsh-memory-hub/api/config', headers: { host: '127.0.0.1:7331', 'x-dmh-token': 'tok-123' }, body: {} }))
    expect(right.status).toBe(200)
    // GET 不需要令牌
    const read = await route(deps, stubRequest({ url: '/dsh-memory-hub/api/overview', headers: { host: '127.0.0.1:7331' } }))
    expect(read.status).toBe(200)
  })
})

/* ---------------- 审批守卫链 ---------------- */

describe('pending review guard chain (unchanged)', () => {
  const reviewRequest = (overrides: Record<string, unknown> = {}): HttpRequestLike =>
    stubRequest({
      method: 'POST',
      url: '/dsh-memory-hub/api/pending',
      headers: { 'x-dmh-review': '1', ...(overrides.headers as Record<string, unknown> | undefined) ?? {} },
      body: overrides.body ?? { action: 'approve', ids: ['PRO-1'] },
    })

  it('keeps x-dmh-review + local-origin + policy guards', async () => {
    const pack = stubPack(stubService())
    const deps = baseDeps(pack)
    expect((await route(deps, stubRequest({ method: 'POST', url: '/dsh-memory-hub/api/pending', body: {} }))).status).toBe(403)
    expect((await route(deps, reviewRequest({ headers: { origin: 'http://evil.example' } }))).status).toBe(403)
    const disabled = stubPack(stubService(), stubHub(false))
    expect((await route(baseDeps(disabled), reviewRequest())).status).toBe(403)
  })

  it('approves through the service and reports per-id results', async () => {
    const pack = stubPack(stubService())
    const state = await route(baseDeps(pack), reviewRequest({ body: { action: 'approve', ids: ['PRO-1', 'PRO-2'] } }))
    expect(state.status).toBe(200)
    const payload = JSON.parse(state.body!.toString('utf8'))
    expect(payload.ok).toBe(true)
    expect(payload.approved).toBe(2)
  })

  it('rejects with a reason and caps batch size', async () => {
    const pack = stubPack(stubService())
    const rejected = await route(baseDeps(pack), reviewRequest({ body: { action: 'reject', id: 'PRO-3', reason: '重复' } }))
    expect(rejected.status).toBe(200)
    expect(JSON.parse(rejected.body!.toString('utf8')).results[0].status).toBe('rejected')
    const tooBig = await route(baseDeps(pack), reviewRequest({ body: { action: 'approve', ids: Array.from({ length: 51 }, (_, index) => `PRO-${index}`) } }))
    expect(tooBig.status).toBe(400)
    expect(JSON.parse(tooBig.body!.toString('utf8')).error).toBe('batch-too-large')
  })
})

/* ---------------- serve 真服务器 ---------------- */

describe('memory-hub serve (S3)', () => {
  it('serves the router over loopback with token-guarded writes', async () => {
    const root = await makeRoot()
    serveHandle = await startServeServer({ root, port: 0 })

    const overview = await fetchJson(`${serveHandle.url}/api/overview`)
    expect(overview.status).toBe(200)
    expect((overview.payload as Record<string, unknown>).client).toEqual({ advertised: false, reason: 'standalone server (no client modules)' })
    // 前缀中性化：serve 独立端口不带发行包名前缀，旧路径 404
    const legacy = await fetchJson(`${serveHandle.url}/dsh-memory-hub/api/overview`)
    expect(legacy.status).toBe(404)

    // token 文件落盘（0600 语义）且与 server.json 一致
    const token = (await readFile(join(root, 'records', 'server-token'), 'utf8')).trim()
    expect(token.length).toBeGreaterThan(32)
    const serverInfo = JSON.parse(await readFile(join(root, 'records', 'server.json'), 'utf8')) as { pid: number; tokenFile: string }
    expect(serverInfo.pid).toBe(process.pid)
    expect(serverInfo.tokenFile.endsWith('server-token')).toBe(true)

    // 写令牌：无 token 401，正确 token 200
    const denied = await fetchJson(`${serveHandle.url}/api/config`, { method: 'POST', body: '{}' })
    expect(denied.status).toBe(401)
    const allowed = await fetchJson(`${serveHandle.url}/api/config`, { method: 'POST', body: '{}', token })
    expect(allowed.status).toBe(200)
  }, 20000)

  it('rejects forged Host headers with 421 over the wire', async () => {
    const root = await makeRoot()
    serveHandle = await startServeServer({ root, port: 0 })
    const status = await rawGetWithHost(serveHandle.port, 'evil.example')
    expect(status).toBe(421)
  }, 20000)

  it('fails loudly when the port is taken (never silently changes the port)', async () => {
    const rootA = await makeRoot()
    serveHandle = await startServeServer({ root: rootA, port: 0 })
    const rootB = await makeRoot()
    await expect(startServeServer({ root: rootB, port: serveHandle.port })).rejects.toThrow(/already in use/)
  }, 20000)

  it('serve --stop cleans stale pids and refuses to kill the current process', async () => {
    const root = await makeRoot()
    const serverFile = join(root, 'records', 'server.json')
    await mkdir(join(root, 'records'), { recursive: true })
    await writeFile(serverFile, JSON.stringify({ url: 'http://127.0.0.1:1', pid: process.pid, startedAt: 'now' }, null, 2))
    const selfGuard = await stopServeServer(root)
    expect(selfGuard.stopped).toBe(false)
    expect(selfGuard.message).toContain('refusing')
    await writeFile(serverFile, JSON.stringify({ url: 'http://127.0.0.1:1', pid: 999999, startedAt: 'now' }, null, 2))
    const stale = await stopServeServer(root)
    expect(stale.stopped).toBe(false)
    expect(stale.message).toContain('not running')
    const gone = await stopServeServer(root)
    expect(gone.message).toContain('no server.json')
  })

  it('panel page renders with the injected token (S4)', async () => {
    const root = await makeRoot()
    serveHandle = await startServeServer({ root, port: 0 })
    const response = await fetch(`${serveHandle.url}/panel`)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('memory-hub panel')
    expect(html).not.toContain('__DMH_WRITE_TOKEN__')
    // API 前缀注入：占位符被替换为 serve 的 /api，页面内不再有未渲染的标记
    expect(html).not.toContain('__DMH_API_BASE__')
    expect(html).toContain("var API_BASE = '/api'")
    expect(html).toContain("api(API_BASE + '/overview')")
    // token 注入页面后与 records/server-token 一致
    const token = (await readFile(join(root, 'records', 'server-token'), 'utf8')).trim()
    expect(html).toContain(`window.__DMH_TOKEN__ = '${token}'`)    // 内嵌挂载没有 panelHtml → 根路径仍 404（client.js 的 API 契约不受影响）
    const pack = stubPack(stubService())
    const embedded = await route(baseDeps(pack), stubRequest({ url: '/' }))
    expect(embedded.status).toBe(404)
  })

  it('S4 acceptance: approve a real proposal through the panel path, ledger records panel:human', async () => {
    const root = await makeRoot()
    // 先种一条 pending 候选（绕开审批面构造数据）
    const seedHub = await Hub.open({ root, lock: false })
    const seedLedger = new Ledger(seedHub.ledgerPath())
    await seedLedger.load()
    const seedStore = new KnowledgeStore(seedHub, seedLedger)
    await seedStore.load()
    const proposal = await seedStore.propose(
      {
        operation: 'create',
        type: 'knowledge',
        scope: 'global',
        title: 'S4 面板批准路径',
        summary: '从 standalone 面板走人工批准。',
        content: '## 结论\n从面板批准。\n',
        sourceRefs: ['note:s4 panel acceptance'],
      },
      { taskId: 'TSK-s4-seed' },
    )
    await seedStore.closeIndex()
    await seedHub.close()
    await seedLedger.close()

    serveHandle = await startServeServer({ root, port: 0 })
    const token = (await readFile(join(root, 'records', 'server-token'), 'utf8')).trim()

    // 模拟浏览器：GET / 拿到面板 → 同源 fetch POST 审批（Origin 由浏览器自动带，测试显式给同源值）
    const page = await fetch(`${serveHandle.url}/`)
    expect(page.status).toBe(200)
    const review = await fetch(`${serveHandle.url}/api/pending`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dmh-review': '1',
        'x-dmh-token': token,
        origin: `${serveHandle.url}`,
      },
      body: JSON.stringify({ action: 'approve', ids: [proposal.id] }),
    })
    expect(review.status).toBe(200)
    const payload = (await review.json()) as { ok: boolean; approved: number; results: Array<{ knowledgeId?: string; ok?: boolean; message?: string }> }
    expect(payload.results[0]).toMatchObject({ ok: true })
    expect(payload.ok).toBe(true)
    expect(payload.approved).toBe(1)
    const knowledgeId = payload.results[0]!.knowledgeId!

    // knowledge/<type>/<id>.md 出现 + 账本 approvalRef = panel:human（S4 验收点）
    const knowledgeFiles = await readdir(join(root, 'knowledge', 'knowledge'))
    expect(knowledgeFiles.some((file) => file.includes(knowledgeId))).toBe(true)
    const ledgerPath = join(root, 'records', 'ledger.jsonl')
    const ledgerText = await readFile(ledgerPath, 'utf8')
    expect(ledgerText).toContain('panel:human')
  }, 20000)
})

/* ---------------- fetch/raw 工具 ---------------- */

async function fetchJson(url: string, options: { method?: string; body?: string; token?: string } = {}): Promise<{ status: number; payload: unknown }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token !== undefined) headers['x-dmh-token'] = options.token
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    ...(options.body === undefined ? {} : { body: options.body, headers }),
  })
  const text = await response.text()
  let payload: unknown = null
  try {
    payload = JSON.parse(text)
  } catch {
    payload = text
  }
  return { status: response.status, payload }
}

/** Node fetch 禁改 Host 头；用原生 http 模块伪造 Host 测 421。 */
function rawGetWithHost(port: number, host: string): Promise<number> {
  return new Promise((resolveP, rejectP) => {
    const request = get({ host: '127.0.0.1', port, path: '/api/overview', headers: { host } }, (response) => {
      response.resume()
      resolveP(response.statusCode ?? 0)
    })
    request.on('error', rejectP)
  })
}
