import { describe, expect, it } from 'vitest'
import { TencentClient } from '../src/tencent-client.js'
import {
  RemoteRegistry,
  legacyTencentToProvider,
  normalizeProvider,
  normalizeRemoteSettings,
  validateRemoteSettings,
  type LegacyTencentConfig,
} from '../src/remote/registry.js'
import { TencentAdapter } from '../src/remote/tencent-adapter.js'
import {
  RemoteError,
  hasCapability,
  isReadOnly,
  requireCapability,
  requireMethod,
  type RemoteAdapter,
  type RemoteRecord,
} from '../src/remote/types.js'

/* ------------------------------------------------------------------ */
/* 测试脚手架                                                          */
/* ------------------------------------------------------------------ */

function envelope(data: unknown, code = 0): Response {
  return new Response(JSON.stringify({ code, message: code === 0 ? 'ok' : 'err', request_id: 'req-1', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function legacyTencent(overrides: Partial<LegacyTencentConfig> = {}): LegacyTencentConfig {
  return {
    enabled: true,
    url: 'http://127.0.0.1:8420',
    api_key_env: 'PROXY_USER_KEY',
    service_id: 'default',
    team_id: 'team-1',
    agent_id: 'agt-1',
    user_id: 'usr-1',
    task_id: 'task-1',
    timeout_ms: 5000,
    pull_scope: 'global',
    pull_type: 'knowledge',
    pull_limit: 50,
    ...overrides,
  }
}

function tencentAdapter(fetchImpl: typeof fetch): TencentAdapter {
  const client = new TencentClient({
    config: {
      url: 'http://127.0.0.1:8420',
      apiKey: 'sk-test',
      serviceId: 'default',
      teamId: 'team-1',
      agentId: '',
      userId: '',
      taskId: '',
      timeoutMs: 5000,
    },
    fetchImpl,
  })
  return new TencentAdapter({ id: 'tencent', client })
}

function record(overrides: Partial<RemoteRecord> = {}): RemoteRecord {
  return {
    externalId: 'ext-1',
    title: '标题',
    summary: '摘要',
    body: '正文',
    tags: [],
    raw: null,
    ...overrides,
  }
}

/* ------------------------------------------------------------------ */
/* 配置 desugar 与归一化                                                */
/* ------------------------------------------------------------------ */

describe('remote settings normalization', () => {
  it('desugars a legacy tencent section into one feed+mirror provider', () => {
    const settings = normalizeRemoteSettings({ tencent: legacyTencent() })
    expect(settings.enabled).toBe(true)
    expect(settings.mode).toBe('local-first')
    expect(settings.providers).toHaveLength(1)
    const provider = settings.providers[0]!
    expect(provider.id).toBe('tencent')
    expect(provider.kind).toBe('tencent')
    expect(provider.roles).toEqual(['feed', 'mirror'])
    // 旧行为：pull 的 scope/type/limit 原样搬进 feed。
    expect(provider.feed).toMatchObject({ scope: 'global', type: 'knowledge', limit: 50 })
    // 删除传播默认：作废开、合并关。
    expect(provider.forget).toMatchObject({ on_deprecate: true, on_merge: false, max_per_run: 100 })
    expect(provider.config).toMatchObject({ url: 'http://127.0.0.1:8420', api_key_env: 'PROXY_USER_KEY' })
  })

  it('keeps the legacy bridge disabled when tencent.enabled is false', () => {
    const settings = normalizeRemoteSettings({ tencent: legacyTencent({ enabled: false }) })
    expect(settings.enabled).toBe(false)
    expect(settings.providers).toHaveLength(1)
    expect(settings.providers[0]!.enabled).toBe(false)
  })

  it('ignores the legacy section once remote.providers is present', () => {
    const settings = normalizeRemoteSettings({
      tencent: legacyTencent(),
      remote: {
        enabled: true,
        mode: 'hybrid',
        providers: [{ id: 'team-remote', kind: 'tencent', roles: ['feed'] }],
      },
    })
    expect(settings.providers).toHaveLength(1)
    expect(settings.providers[0]!.id).toBe('team-remote')
    expect(settings.providers[0]!.roles).toEqual(['feed'])
    expect(settings.mode).toBe('hybrid')
  })

  it('falls back to disabled when neither section exists', () => {
    const settings = normalizeRemoteSettings({})
    expect(settings).toEqual({ enabled: false, mode: 'local-first', providers: [] })
  })

  it('treats an empty providers array as absent so legacy config still desugars', () => {
    // configSchema 给 providers 的默认值就是 []；若把它当显式配置，
    // 所有旧 tencent: 配置都会被静默忽略（会打断现存用户的回归）。
    const settings = normalizeRemoteSettings({
      tencent: legacyTencent(),
      remote: { enabled: false, mode: 'local-first', providers: [] },
    })
    expect(settings.providers).toHaveLength(1)
    expect(settings.providers[0]!.id).toBe('tencent')
    expect(settings.enabled).toBe(true)
  })

  it('drops unknown roles and unknown modes instead of failing open', () => {
    const provider = normalizeProvider({ id: 'x', roles: ['feed', 'bogus'] }, 0)
    expect(provider.roles).toEqual(['feed'])
    const settings = normalizeRemoteSettings({ remote: { mode: 'yolo', providers: [{ id: 'x', roles: ['feed'] }] } })
    expect(settings.mode).toBe('local-first')
  })

  it('clamps out-of-range numbers back to defaults', () => {
    const provider = normalizeProvider({ id: 'x', feed: { limit: -5 }, forget: { max_per_run: 1e9 } }, 0)
    expect(provider.feed.limit).toBe(50)
    expect(provider.forget.max_per_run).toBe(100)
  })

  it('derives a stable fallback id when the config omits one', () => {
    expect(normalizeProvider({}, 2).id).toBe('provider-3')
  })
})

/* ------------------------------------------------------------------ */
/* 角色校验                                                            */
/* ------------------------------------------------------------------ */

describe('remote settings validation', () => {
  function withProviders(providers: unknown[], mode = 'local-first', enabled = true) {
    return normalizeRemoteSettings({ remote: { enabled, mode, providers } })
  }

  it('accepts a plain feed+mirror provider', () => {
    const result = validateRemoteSettings(withProviders([{ id: 'a', roles: ['feed', 'mirror'] }]))
    expect(result).toEqual({ ok: true, errors: [] })
  })

  it('rejects duplicate provider ids', () => {
    const result = validateRemoteSettings(withProviders([{ id: 'a', roles: ['feed'] }, { id: 'a', roles: ['feed'] }]))
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('duplicate provider id "a"')
  })

  it('rejects a provider that is both mirror and authority', () => {
    const result = validateRemoteSettings(withProviders([{ id: 'a', roles: ['mirror', 'authority'] }], 'hybrid'))
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('mutually exclusive')
  })

  it('rejects authority under local-first because authority must be opted in', () => {
    const result = validateRemoteSettings(withProviders([{ id: 'a', roles: ['authority'] }], 'local-first'))
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('opt in')
  })

  it('allows authority once mode is switched to hybrid', () => {
    const result = validateRemoteSettings(withProviders([{ id: 'a', roles: ['authority'] }], 'hybrid'))
    expect(result.ok).toBe(true)
  })

  it('refuses project-scoped authority', () => {
    const result = validateRemoteSettings(
      withProviders(
        [{ id: 'a', roles: ['authority'], projection: { scopes: ['global', 'project:ws-1'] } }],
        'hybrid',
      ),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('project:ws-1')
  })

  it('rejects an enabled provider without any role', () => {
    const result = validateRemoteSettings(withProviders([{ id: 'a', roles: [] }]))
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('declares no role')
  })

  it('allows a disabled provider to declare no role', () => {
    const result = validateRemoteSettings(withProviders([{ id: 'a', roles: [], enabled: false }]))
    expect(result.ok).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/* 腾讯 adapter 契约                                                   */
/* ------------------------------------------------------------------ */

describe('tencent adapter', () => {
  it('declares read+append capabilities but explicitly not write.delete', () => {
    const adapter = tencentAdapter((async () => envelope({})) as unknown as typeof fetch)
    const caps = adapter.capabilities()
    expect(caps.has('read.list')).toBe(true)
    expect(caps.has('read.search')).toBe(true)
    expect(caps.has('write.append')).toBe(true)
    expect(caps.has('extract')).toBe(true)
    // 治理缺口：腾讯 v3 没有删除端点，所以必须不声明。
    expect(caps.has('write.delete')).toBe(false)
    expect(caps.has('scope')).toBe(false)
    expect(isReadOnly(adapter)).toBe(false)
  })

  it('reports forget as unsupported instead of silently succeeding', () => {
    const adapter = tencentAdapter((async () => envelope({})) as unknown as typeof fetch)
    expect(() => requireCapability(adapter, 'write.delete')).toThrowError(RemoteError)
    try {
      requireCapability(adapter, 'write.delete')
      expect.unreachable('requireCapability should have thrown')
    } catch (error) {
      expect((error as RemoteError).kind).toBe('unsupported')
      // 不可重试：重试一个没有端点的方法只会拖长故障。
      expect((error as RemoteError).retryable).toBe(false)
    }
  })

  it('rejects a declared capability that has no implementation', () => {
    const lying: RemoteAdapter = {
      id: 'liar',
      kind: 'fake',
      capabilities: () => new Set(['write.delete']),
      probe: async () => ({ ok: true }),
    }
    expect(() => requireMethod(lying, 'delete')).toThrowError(/does not implement "delete\(\)"/)
  })

  it('maps list results into remote records', async () => {
    const fetchImpl = (async () =>
      envelope({
        items: [
          { id: 'a1', type: 'episodic', content: '一二三四五', updated_at: '2026-11-01T00:00:00Z' },
        ],
      })) as unknown as typeof fetch
    const adapter = tencentAdapter(fetchImpl)
    const page = await adapter.list({ limit: 10 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({ externalId: 'a1', body: '一二三四五', tags: ['episodic'] })
    expect(page.items[0]!.updatedAt).toBe('2026-11-01T00:00:00Z')
  })

  it('requires text for search instead of issuing a broad query', async () => {
    const adapter = tencentAdapter((async () => envelope({ items: [] })) as unknown as typeof fetch)
    await expect(adapter.search({ limit: 5 })).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('appends through the conversation channel with an idempotency-derived session id', async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return envelope({ accepted_ids: ['m1'] })
    }) as unknown as typeof fetch
    const adapter = tencentAdapter(fetchImpl)
    const result = await adapter.append(record(), { idempotencyKey: 'tencent:append:DEC-1:2' })
    expect(result.externalId).toBe('dsh-memory-hub:tencent:append:DEC-1:2')
    expect(body.session_id).toBe('dsh-memory-hub:tencent:append:DEC-1:2')
    const messages = body.messages as Array<{ role: string; content: string }>
    expect(messages[0]!.content).toContain('标题')
    expect(messages[0]!.content).toContain('正文')
  })

  it('probe never throws; it returns ok:false with a diagnostic', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 502 })) as unknown as typeof fetch
    const adapter = tencentAdapter(fetchImpl)
    const result = await adapter.probe()
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('502')
  })

  it('maps HTTP 401 to unauthorized and marks it non-retryable', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
    const adapter = tencentAdapter(fetchImpl)
    try {
      await adapter.list({ limit: 1 })
      expect.unreachable('list should have thrown')
    } catch (error) {
      expect((error as RemoteError).kind).toBe('unauthorized')
      expect((error as RemoteError).retryable).toBe(false)
    }
  })

  it('maps a non-zero business code to invalid rather than retrying forever', async () => {
    const fetchImpl = (async () => envelope({}, 40001)) as unknown as typeof fetch
    const adapter = tencentAdapter(fetchImpl)
    try {
      await adapter.list({ limit: 1 })
      expect.unreachable('list should have thrown')
    } catch (error) {
      expect((error as RemoteError).kind).toBe('invalid')
      expect((error as RemoteError).retryable).toBe(false)
    }
  })

  it('maps timeouts to retryable unreachable', async () => {
    const fetchImpl = ((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal
        signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    }) as unknown as typeof fetch
    const client = new TencentClient({
      config: {
        url: 'http://127.0.0.1:8420',
        apiKey: 'sk-test',
        serviceId: 'default',
        teamId: 't',
        agentId: '',
        userId: '',
        taskId: '',
        timeoutMs: 20,
      },
      fetchImpl,
    })
    const adapter = new TencentAdapter({ id: 'tencent', client })
    try {
      await adapter.list({ limit: 1 })
      expect.unreachable('list should have thrown')
    } catch (error) {
      expect((error as RemoteError).kind).toBe('unreachable')
      expect((error as RemoteError).retryable).toBe(true)
    }
  })
})

/* ------------------------------------------------------------------ */
/* 注册表                                                              */
/* ------------------------------------------------------------------ */

describe('remote registry', () => {
  const okFetch = (async () => envelope({ total: 0 })) as unknown as typeof fetch

  it('builds adapters for configured providers and exposes roles', () => {
    const settings = normalizeRemoteSettings({ tencent: legacyTencent() })
    const registry = new RemoteRegistry(settings, {
      resolveSecret: () => 'sk-test',
      fetchImpl: okFetch,
    })
    expect(registry.list()).toHaveLength(1)
    expect(registry.byRole('feed').map((handle) => handle.settings.id)).toEqual(['tencent'])
    expect(registry.byRole('mirror').map((handle) => handle.settings.id)).toEqual(['tencent'])
    expect(registry.byRole('authority')).toEqual([])
    expect(registry.roleSummary()).toEqual({
      feed: ['tencent'],
      mirror: ['tencent'],
      authority: [],
      index: [],
    })
  })

  it('keeps a missing credential as a diagnostic instead of throwing', () => {
    const settings = normalizeRemoteSettings({ tencent: legacyTencent() })
    const registry = new RemoteRegistry(settings, {
      resolveSecret: () => '',
      fetchImpl: okFetch,
    })
    const handle = registry.get('tencent')!
    expect(handle.adapter).toBeNull()
    expect(handle.error).toContain('api key env PROXY_USER_KEY is empty')
    // 构造失败 → 不算作任何角色的可用 provider。
    expect(registry.byRole('feed')).toEqual([])
  })

  it('reports an unknown provider kind with the registered kinds', () => {
    const settings = normalizeRemoteSettings({
      remote: { enabled: true, providers: [{ id: 'x', kind: 'mystery', roles: ['index'] }] },
    })
    const registry = new RemoteRegistry(settings, { resolveSecret: () => 'k', fetchImpl: okFetch })
    const handle = registry.get('x')!
    expect(handle.adapter).toBeNull()
    expect(handle.error).toContain('unknown provider kind "mystery"')
    expect(handle.error).toContain('tencent')
  })

  it('excludes disabled providers from role queries but keeps them listed', () => {
    const settings = normalizeRemoteSettings({
      remote: {
        enabled: true,
        providers: [
          { id: 'on', roles: ['feed'] },
          { id: 'off', roles: ['feed'], enabled: false },
        ],
      },
    })
    const registry = new RemoteRegistry(settings, { resolveSecret: () => 'k', fetchImpl: okFetch })
    expect(registry.list()).toHaveLength(2)
    expect(registry.byRole('feed').map((handle) => handle.settings.id)).toEqual(['on'])
    expect(registry.get('off')!.error).toBe('provider is disabled')
  })

  it('uses custom factories so new vendors need no core change', () => {
    const fake: RemoteAdapter = {
      id: 'custom-1',
      kind: 'fake',
      capabilities: () => new Set(['read.list']),
      probe: async () => ({ ok: true }),
      list: async () => ({ items: [] }),
    }
    const settings = normalizeRemoteSettings({
      remote: { enabled: true, providers: [{ id: 'custom-1', kind: 'fake', roles: ['index'] }] },
    })
    const registry = new RemoteRegistry(settings, {
      resolveSecret: () => '',
      factories: { fake: () => fake },
    })
    expect(registry.byRole('index').map((handle) => handle.adapter?.id)).toEqual(['custom-1'])
    expect(hasCapability(fake, 'read.list')).toBe(true)
  })
})
