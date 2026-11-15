/**
 * `http-json` 声明式适配器：配置解析、模板插值、路径映射、HTTP 错误归类，
 * 以及一个**真实本地 HTTP 服务**的端到端（push 镜像 + pull 候选）。
 *
 * M2 的验收标准是"一个真实第三方服务接通（只读 + 追加）"——这里用 node:http
 * 起一个本地假想服务扮演第三方，走的是与生产完全相同的 fetch / 映射 / 引擎路径。
 */

import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HttpJsonAdapter,
  httpJsonAdapterFactory,
  interpolate,
  lookup,
  parseHttpJsonSettings,
  type HttpJsonSettings,
} from '../src/remote/http-json-adapter.js'
import { RemoteRegistry, type AdapterBuildContext } from '../src/remote/registry.js'
import { RemoteError, requireMethod } from '../src/remote/types.js'
import { createHarness, type Harness } from './helpers.js'

let harness: Harness | null = null
let server: Server | null = null

afterEach(async () => {
  if (harness !== null) {
    await harness.cleanup()
    harness = null
  }
  if (server !== null) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
  }
  vi.unstubAllEnvs()
})

/* ------------------------------------------------------------------ */
/* 配置解析                                                             */
/* ------------------------------------------------------------------ */

describe('parseHttpJsonSettings', () => {
  const validConfig = {
    base_url: 'https://memory.example.com',
    endpoints: {
      list: { method: 'POST', path: '/v1/memories/list', body: { limit: '{{limit}}' } },
    },
    mapping: { items: '$.data.items', id: '$.id' },
    capabilities: ['read.list'],
  }

  it('parses a minimal valid config with defaults', () => {
    const result = parseHttpJsonSettings(validConfig)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.settings.timeout_ms).toBe(10_000)
    expect(result.settings.auth).toBeNull()
    expect(result.settings.capabilities).toEqual(['read.list'])
  })

  it('rejects non-http base urls and invalid urls', () => {
    for (const base_url of ['ftp://memory.example.com', 'not a url']) {
      const result = parseHttpJsonSettings({ ...validConfig, base_url })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.some((error) => error.includes('base_url'))).toBe(true)
    }
  })

  it('requires explicit non-empty capabilities (never guess)', () => {
    const result = parseHttpJsonSettings({ ...validConfig, capabilities: [] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join(' ')).toContain('capabilities')
  })

  it('rejects unknown capability names', () => {
    const result = parseHttpJsonSettings({ ...validConfig, capabilities: ['read.everything'] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join(' ')).toContain('read.everything')
  })

  it('requires at least one endpoint and mapping for read endpoints', () => {
    const withoutEndpoints = parseHttpJsonSettings({ ...validConfig, endpoints: {} })
    expect(withoutEndpoints.ok).toBe(false)

    const withoutMapping = parseHttpJsonSettings({ ...validConfig, mapping: undefined })
    expect(withoutMapping.ok).toBe(false)
    if (withoutMapping.ok) return
    expect(withoutMapping.errors.join(' ')).toContain('mapping')
  })

  it('requires token_env when auth is declared (token never in config)', () => {
    const result = parseHttpJsonSettings({
      ...validConfig,
      auth: { type: 'bearer', token_env: '' },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join(' ')).toContain('token_env')
  })
})

/* ------------------------------------------------------------------ */
/* 模板插值与路径取值                                                    */
/* ------------------------------------------------------------------ */

describe('interpolate and lookup', () => {
  it('preserves types when the whole string is one variable', () => {
    expect(interpolate('{{limit}}', { limit: 50 })).toBe(50)
    expect(interpolate('{{tags}}', { tags: ['a', 'b'] })).toEqual(['a', 'b'])
    // 缺失变量的精确形式 → null（JSON 友好），不是字符串 "undefined"。
    expect(interpolate('{{cursor}}', {})).toBeNull()
  })

  it('string-concatenates mixed templates and joins arrays with commas', () => {
    expect(interpolate('page-{{cursor}}', { cursor: 7 })).toBe('page-7')
    expect(interpolate('{{tags}}!', { tags: ['a', 'b'] })).toBe('a,b!')
    expect(interpolate('{{missing}}x', {})).toBe('x')
  })

  it('interpolates recursively through nested bodies', () => {
    const body = interpolate(
      { query: { text: '{{text}}' }, limit: '{{limit}}', note: 'for {{id}}' },
      { text: 'hello', limit: 10, id: 'X-1' },
    )
    expect(body).toEqual({ query: { text: 'hello' }, limit: 10, note: 'for X-1' })
  })

  it('lookup walks dot paths and refuses non-$ paths', () => {
    const doc = { data: { items: [1, 2], next: 'c2' } }
    expect(lookup(doc, '$.data.next')).toBe('c2')
    expect(lookup(doc, '$')).toBe(doc)
    expect(lookup(doc, '$.data.missing')).toBeUndefined()
    expect(lookup(doc, 'data.next')).toBeUndefined()
    expect(lookup([1], '$')).toEqual([1])
  })
})

/* ------------------------------------------------------------------ */
/* adapter 契约（mock fetch）                                           */
/* ------------------------------------------------------------------ */

function settingsWith(overrides: Partial<HttpJsonSettings>): HttpJsonSettings {
  return {
    base_url: 'https://memory.example.com',
    auth: null,
    headers: {},
    timeout_ms: 10_000,
    endpoints: {
      list: { method: 'POST', path: '/v1/memories/list', body: { limit: '{{limit}}', cursor: '{{cursor}}' } },
      search: { method: 'POST', path: '/v1/memories/search', body: { query: '{{text}}', limit: '{{limit}}' } },
      append: { method: 'POST', path: '/v1/memories', body: { title: '{{title}}', content: '{{body}}', tags: '{{tags}}' } },
    },
    mapping: {
      items: '$.data.items',
      id: '$.id',
      title: '$.title',
      summary: '$.summary',
      body: '$.content',
      tags: '$.tags',
      scope: '$.metadata.scope',
      updated_at: '$.updated_at',
      next_cursor: '$.data.next',
      total: '$.data.total',
    },
    capabilities: ['read.list', 'read.search', 'write.append'],
    ...overrides,
  }
}

function adapter(
  settings: HttpJsonSettings,
  handler: (url: string | URL | Request, init?: RequestInit) => Promise<Response>,
  resolveToken: () => string = () => '',
): HttpJsonAdapter {
  return new HttpJsonAdapter({
    id: 'test-http',
    settings,
    resolveToken,
    fetchImpl: handler,
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('HttpJsonAdapter', () => {
  it('maps list responses through the declared mapping', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const remote = adapter(settingsWith({}), async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) })
      return jsonResponse(200, {
        data: {
          items: [
            { id: 'srv-1', title: '标题一', summary: '摘要', content: '正文', tags: ['x', 'y'], metadata: { scope: 'global' }, updated_at: '2026-11-14T00:00:00Z' },
            { id: '', broken: true }, // 缺 id → 丢弃，不阻塞
          ],
          next: 'cursor-2',
          total: 12,
        },
      })
    })
    const page = await remote.list({ limit: 10, cursor: 'cursor-1' })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://memory.example.com/v1/memories/list')
    expect(calls[0]!.body).toEqual({ limit: 10, cursor: 'cursor-1' }) // 数字保持数字
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      externalId: 'srv-1',
      title: '标题一',
      body: '正文',
      tags: ['x', 'y'],
      scope: 'global',
      updatedAt: '2026-11-14T00:00:00Z',
    })
    expect(page.cursor).toBe('cursor-2')
    expect(page.total).toBe(12)
  })

  it('sends bearer auth and static headers when configured', async () => {
    const settings = settingsWith({
      auth: { type: 'bearer', token_env: 'MY_TOKEN' },
      headers: { 'x-tenant': 'acme' },
    })
    const headers: Array<Record<string, string>> = []
    const remote = adapter(settings, async (_url, init) => {
      headers.push((init?.headers ?? {}) as Record<string, string>)
      return jsonResponse(200, { data: { items: [] } })
    }, () => 'tok-1')
    await remote.list({ limit: 1 })
    expect(headers[0]).toMatchObject({ authorization: 'Bearer tok-1', 'x-tenant': 'acme' })
  })

  it('throws unsupported when a declared capability has no endpoint configured', async () => {
    const remote = adapter(settingsWith({ endpoints: { list: settingsWith({}).endpoints.list! } }), async () => jsonResponse(200, { data: { items: [] } }))
    await expect(remote.search({ text: 'q', limit: 5 })).rejects.toMatchObject({ kind: 'unsupported' })
  })

  it('refuses undeclared capabilities through the requireMethod contract', async () => {
    // 引擎走 requireMethod：先查能力声明再取方法。声明里没有 write.append → 同步抛 unsupported，
    // 即使适配器碰巧实现了 append。
    const remote = adapter(settingsWith({ capabilities: ['read.list'] }), async () => jsonResponse(200, { id: 'x' }))
    expect(() => requireMethod(remote, 'append')).toThrow(RemoteError)
    try {
      requireMethod(remote, 'append')
      throw new Error('unreachable')
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteError)
      expect((error as RemoteError).kind).toBe('unsupported')
      expect((error as RemoteError).message).toContain('write.append')
    }
    // 声明过的能力正常取到方法。
    expect(typeof requireMethod(remote, 'list')).toBe('function')
  })

  it('requires a non-empty search text', async () => {
    const remote = adapter(settingsWith({}), async () => jsonResponse(200, { data: { items: [] } }))
    await expect(remote.search({ limit: 5 })).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('classifies http status errors into the five-kind vocabulary', async () => {
    const cases: Array<[number, string]> = [
      [401, 'unauthorized'],
      [403, 'unauthorized'],
      [409, 'conflict'],
      [412, 'conflict'],
      [500, 'unreachable'],
      [400, 'invalid'],
      [404, 'invalid'],
    ]
    for (const [status, kind] of cases) {
      const remote = adapter(settingsWith({}), async () => jsonResponse(status, { error: 'boom' }))
      await expect(remote.list({ limit: 1 })).rejects.toSatisfy((error: unknown) => error instanceof RemoteError && error.kind === kind)
    }
  })

  it('treats network failures as retryable and non-JSON 200 as invalid', async () => {
    const unreachable = adapter(settingsWith({}), async () => {
      throw new TypeError('fetch failed')
    })
    await expect(unreachable.list({ limit: 1 })).rejects.toMatchObject({ kind: 'unreachable', retryable: true })

    const garbage = adapter(settingsWith({}), async () => new Response('not json', { status: 200 }))
    await expect(garbage.list({ limit: 1 })).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('falls back to the idempotency key when the append response has no id', async () => {
    const bodies: unknown[] = []
    const remote = adapter(settingsWith({}), async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')))
      return jsonResponse(200, { ok: true })
    })
    const result = await remote.append(
      { externalId: 'DEC-1@1', title: '标题', summary: '摘要', body: '正文', tags: ['a'], scope: 'global', raw: {} },
      { idempotencyKey: 'test-http:push:DEC-1:1' },
    )
    expect(result.externalId).toBe('test-http:push:DEC-1:1')
    // 模板里只声明了 title/content/tags——幂等键只有在模板里引用才会出现在请求体（E2E 有该用例）。
    expect(bodies[0]).toMatchObject({ title: '标题', content: '正文', tags: ['a'] })
  })

  it('probe never throws and reports diagnostics', async () => {
    const ok = adapter(settingsWith({}), async () => jsonResponse(200, { data: { items: [{ id: 'x' }] } }))
    expect(await ok.probe()).toMatchObject({ ok: true })

    const down = adapter(settingsWith({}), async () => {
      throw new TypeError('fetch failed')
    })
    const result = await down.probe()
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('fetch failed')
  })
})

/* ------------------------------------------------------------------ */
/* 注册表接入                                                           */
/* ------------------------------------------------------------------ */

describe('http-json in the registry', () => {
  function buildCtx(config: Record<string, unknown>, env: Record<string, string>): AdapterBuildContext {
    return {
      providerId: 'my-memory',
      config,
      resolveSecret: (name: string) => env[name] ?? '',
    }
  }

  it('constructs through the default factory when the config is valid', () => {
    const ctx = buildCtx(
      {
        base_url: 'https://memory.example.com',
        auth: { type: 'bearer', token_env: 'MY_MEMORY_TOKEN' },
        endpoints: { list: { method: 'POST', path: '/v1/list', body: { limit: '{{limit}}' } } },
        mapping: { items: '$.items', id: '$.id' },
        capabilities: ['read.list'],
      },
      { MY_MEMORY_TOKEN: 'tok' },
    )
    const registry = new RemoteRegistry(
      { enabled: true, mode: 'local-first', providers: [{ id: 'my-memory', kind: 'http-json', enabled: true, roles: ['index'], projection: { scopes: [], types: [], exclude_tags: [] }, feed: { scope: 'global', type: 'knowledge', limit: 50, tags: [], scope_from_tags: false }, mirror: { trigger: 'manual', include_body: true, max_body_chars: 4000, coordinate_tags: true, require_citations: 0 }, forget: { on_deprecate: true, on_merge: false, max_per_run: 100 }, inject_max_tokens: 300, config: ctx.config }] },
      { resolveSecret: ctx.resolveSecret, factories: { 'http-json': httpJsonAdapterFactory } },
    )
    const handle = registry.get('my-memory')
    expect(handle?.error).toBeNull()
    expect(handle?.adapter?.capabilities().has('read.list')).toBe(true)
  })

  it('surfaces invalid config and missing tokens as diagnostics, never throws', () => {
    const invalid = new RemoteRegistry(
      { enabled: true, mode: 'local-first', providers: [{ id: 'bad', kind: 'http-json', enabled: true, roles: ['index'], projection: { scopes: [], types: [], exclude_tags: [] }, feed: { scope: 'global', type: 'knowledge', limit: 50, tags: [], scope_from_tags: false }, mirror: { trigger: 'manual', include_body: true, max_body_chars: 4000, coordinate_tags: true, require_citations: 0 }, forget: { on_deprecate: true, on_merge: false, max_per_run: 100 }, inject_max_tokens: 300, config: {} }] },
      { resolveSecret: () => '', factories: { 'http-json': httpJsonAdapterFactory } },
    )
    expect(invalid.get('bad')?.error).toContain('invalid http-json config')

    const missingToken = new RemoteRegistry(
      { enabled: true, mode: 'local-first', providers: [{ id: 'locked', kind: 'http-json', enabled: true, roles: ['index'], projection: { scopes: [], types: [], exclude_tags: [] }, feed: { scope: 'global', type: 'knowledge', limit: 50, tags: [], scope_from_tags: false }, mirror: { trigger: 'manual', include_body: true, max_body_chars: 4000, coordinate_tags: true, require_citations: 0 }, forget: { on_deprecate: true, on_merge: false, max_per_run: 100 }, inject_max_tokens: 300, config: { base_url: 'https://x.example.com', auth: { type: 'bearer', token_env: 'MISSING_TOKEN' }, endpoints: { list: { method: 'GET', path: '/x' } }, mapping: { items: '$', id: '$.id' }, capabilities: ['read.list'] } }] },
      { resolveSecret: () => '', factories: { 'http-json': httpJsonAdapterFactory } },
    )
    expect(missingToken.get('locked')?.error).toContain('MISSING_TOKEN')
  })
})

/* ------------------------------------------------------------------ */
/* 端到端：真实本地 HTTP 服务 + 完整引擎                                 */
/* ------------------------------------------------------------------ */

describe('http-json end to end through the sync engine', () => {
  it('pushes accepted knowledge to a real local http service and pulls candidates back', async () => {
    harness = await createHarness()
    const seen: Array<{ path: string; body: Record<string, unknown> }> = []
    const appendBodies: Array<Record<string, unknown>> = []

    // 第三方服务的最小实现：两个端点，纯 JSON。
    server = createServer((request, response) => {
      let raw = ''
      request.on('data', (chunk) => {
        raw += String(chunk)
      })
      request.on('end', () => {
        let body: Record<string, unknown> = {}
        try {
          body = raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>)
        } catch {
          body = {}
        }
        seen.push({ path: request.url ?? '', body })
        const reply = (payload: unknown) => {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(JSON.stringify(payload))
        }
        if (request.url === '/v1/memories/list') {
          reply({
            data: {
              items: [
                { id: 'srv-A', title: '远端结论', summary: '来自假想第三方', content: '## 远端\n这是远端来的内容', tags: ['remote'] },
              ],
              next: null,
            },
          })
        } else if (request.url === '/v1/memories') {
          appendBodies.push(body)
          reply({ id: `srv-${appendBodies.length}` })
        } else {
          response.writeHead(404)
          response.end('{}')
        }
      })
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const baseUrl = `http://127.0.0.1:${address.port}`

    harness.hub.config.remote = {
      enabled: true,
      mode: 'local-first',
      hybrid: { deadline_ms: 2000 },
      providers: [
        {
          id: 'third-party',
          kind: 'http-json',
          enabled: true,
          roles: ['feed', 'mirror'],
          projection: { scopes: ['*'], types: [], exclude_tags: [] },
          feed: { scope: 'global', type: 'knowledge', limit: 50, tags: [], scope_from_tags: false },
          mirror: { trigger: 'manual', include_body: true, max_body_chars: 4000, coordinate_tags: true, require_citations: 0 },
          forget: { on_deprecate: false, on_merge: false, max_per_run: 100 },
          inject_max_tokens: 300,
          config: {
            base_url: baseUrl,
            endpoints: {
              list: { method: 'POST', path: '/v1/memories/list', body: { limit: '{{limit}}', cursor: '{{cursor}}' } },
              append: { method: 'POST', path: '/v1/memories', body: { title: '{{title}}', content: '{{body}}', tags: '{{tags}}', key: '{{idempotency_key}}' } },
            },
            mapping: {
              items: '$.data.items',
              id: '$.id',
              title: '$.title',
              summary: '$.summary',
              body: '$.content',
              tags: '$.tags',
              next_cursor: '$.data.next',
            },
            capabilities: ['read.list', 'write.append'],
          },
        },
      ],
    }

    // push：本地 accepted → 第三方 append。
    await harness.seed({ title: '本地结论', summary: '要镜像出去' })
    const pushOutcome = await harness.service.remoteSync(harness.agent, { direction: 'push' })
    const pushEntry = pushOutcome.results[0]!
    expect(pushEntry.ok).toBe(true)
    expect(pushEntry.push).toMatchObject({ pushed: 1 })
    expect(appendBodies[0]).toMatchObject({ title: '本地结论' })
    expect(String(appendBodies[0]!.key)).toMatch(/^third-party:push:DEC-\d+:1$/)
    expect(seen.some((call) => call.path === '/v1/memories')).toBe(true)

    // pull：第三方 list → 本地 pending 候选（绝不自动 commit）。
    const pullOutcome = await harness.service.remoteSync(harness.agent, { direction: 'pull' })
    const pullEntry = pullOutcome.results[0]!
    expect(pullEntry.ok).toBe(true)
    expect(pullEntry.pull).toMatchObject({ proposed: 1 })
    expect(seen.some((call) => call.path === '/v1/memories/list')).toBe(true)
    const pending = [...harness.store.proposals.values()]
    expect(pending.length).toBeGreaterThanOrEqual(1)
    expect(pending.some((proposal) => proposal.title.includes('远端结论'))).toBe(true)
    // 来源标注格式 note:remote:<providerId>:<externalId>（M1 起的实际实现；带 remote: 命名空间便于 grep）。
    expect(pending.some((proposal) => proposal.sourceRefs.some((ref) => ref.startsWith('note:remote:third-party:srv-A')))).toBe(true)

    // 幂等：第二次 pull 不重复提出同一条（externalId 去重）。
    const second = await harness.service.remoteSync(harness.agent, { direction: 'pull' })
    expect(second.results[0]!.pull).toMatchObject({ proposed: 0 })
  })
})
