import { describe, expect, it } from 'vitest'
import { TencentClient, TencentError } from '../src/tencent-client.js'

function config(overrides: Partial<Parameters<typeof makeConfig>[0]> = {}) {
  return makeConfig(overrides)
}

function makeConfig(overrides: { url?: string; timeoutMs?: number } = {}) {
  return {
    url: overrides.url ?? 'http://127.0.0.1:8420',
    apiKey: 'sk-test',
    serviceId: 'default',
    teamId: 'team-1',
    agentId: 'agt-1',
    userId: 'usr-1',
    taskId: 'task-1',
    timeoutMs: overrides.timeoutMs ?? 5000,
  }
}

function envelope(data: unknown, code = 0): Response {
  return new Response(JSON.stringify({ code, message: code === 0 ? 'ok' : 'err', request_id: 'req-1', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('tencent client', () => {
  it('sends bearer token, service id and isolation fields in the body', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return envelope({ total: 3 })
    }) as unknown as typeof fetch
    const client = new TencentClient({ config: config(), fetchImpl })
    const result = await client.ping()
    expect(result.total).toBe(3)
    expect(calls).toHaveLength(1)
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
    expect(headers['x-tdai-service-id']).toBe('default')
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>
    expect(body.team_id).toBe('team-1')
    expect(body.agent_id).toBe('agt-1')
    expect(body.user_id).toBe('usr-1')
    expect(body.task_id).toBe('task-1')
  })

  it('maps non-zero envelope code to TencentError', async () => {
    const fetchImpl = (async () => envelope({}, 403)) as unknown as typeof fetch
    const client = new TencentClient({ config: config(), fetchImpl })
    await expect(client.ping()).rejects.toBeInstanceOf(TencentError)
  })

  it('maps HTTP errors to TencentError with status', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 502 })) as unknown as typeof fetch
    const client = new TencentClient({ config: config(), fetchImpl })
    await expect(client.ping()).rejects.toMatchObject({ status: 502 })
  })

  it('returns [] when search data has no items', async () => {
    const fetchImpl = (async () => envelope({ total: 0 })) as unknown as typeof fetch
    const client = new TencentClient({ config: config(), fetchImpl })
    await expect(client.searchAtomics('query')).resolves.toEqual([])
  })

  it('reads scenario content', async () => {
    const fetchImpl = (async () => envelope({ content: '# 场景' })) as unknown as typeof fetch
    const client = new TencentClient({ config: config(), fetchImpl })
    await expect(client.readScenario('a.md')).resolves.toBe('# 场景')
  })

  it('adds conversation messages with session id', async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return envelope({ accepted_ids: ['m1'] })
    }) as unknown as typeof fetch
    const client = new TencentClient({ config: config(), fetchImpl })
    await client.addConversation('session-x', 'user', 'hello')
    expect(body.session_id).toBe('session-x')
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('times out as TencentError', async () => {
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
    const client = new TencentClient({ config: config({ timeoutMs: 20 }), fetchImpl })
    await expect(client.ping()).rejects.toMatchObject({ code: 'TIMEOUT' })
  })
})
