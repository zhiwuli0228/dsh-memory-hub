import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { clearOutbox, TencentSync, type TencentAuditEvent, type TencentSyncHost } from '../src/tencent-sync.js'
import type { TencentAtomicItem, TencentClient, TencentScenarioEntry } from '../src/tencent-client.js'
import type { KnowledgeRecord } from '../src/types.js'

let root = ''

afterEach(async () => {
  if (root !== '') {
    await rm(root, { recursive: true, force: true })
    root = ''
  }
})

function recordsDir(): string {
  return join(root, 'records')
}

interface FakeClient {
  listAtomics: (limit: number) => Promise<TencentAtomicItem[]>
  listScenarios: () => Promise<TencentScenarioEntry[]>
  readScenario: (path: string) => Promise<string>
  addConversation: (sessionId: string, role: 'user' | 'assistant', content: string) => Promise<unknown>
  baseUrl: string
}

function client(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    listAtomics: async () => [],
    listScenarios: async () => [],
    readScenario: async () => '',
    addConversation: async () => ({}),
    baseUrl: 'http://127.0.0.1:8420',
    ...overrides,
  }
}

interface FakeHost {
  proposals: Array<{ title: string; scope: string }>
  accepted: KnowledgeRecord[]
  audits: TencentAuditEvent[]
  failPropose: boolean
}

function host(overrides: Partial<FakeHost> = {}): { host: TencentSyncHost; state: FakeHost } {
  const state: FakeHost = {
    proposals: [],
    accepted: [],
    audits: [],
    failPropose: false,
    ...overrides,
  }
  return {
    state,
    host: {
      proposeCandidate: async (input) => {
        if (state.failPropose) throw new Error('limit reached')
        state.proposals.push({ title: input.title, scope: input.scope })
        return { proposalId: `PRO-${state.proposals.length}` }
      },
      listAcceptedKnowledge: async () => state.accepted,
      audit: async (event) => {
        state.audits.push(event)
      },
    },
  }
}

async function makeSync(overrides: {
  client?: FakeClient
  host?: TencentSyncHost
  pullLimit?: number
} = {}) {
  root = await mkdtemp(join(tmpdir(), 'dsh-tencent-sync-test-'))
  return new TencentSync({
    recordsDir: recordsDir(),
    pullLimit: overrides.pullLimit ?? 50,
    pullScope: 'global',
    pullType: 'knowledge',
    pushSessionPrefix: 'dsh-memory-hub',
    host: overrides.host ?? host().host,
    client: (overrides.client ?? client()) as unknown as TencentClient,
  })
}

function atomic(id: string, type: string, content: string): TencentAtomicItem {
  return { id, type, content }
}

function knowledge(id: string, title: string): KnowledgeRecord {
  return {
    id,
    type: 'knowledge',
    scope: { level: 'project', workspaceId: 'ws-test' },
    status: 'accepted',
    version: 1,
    title,
    summary: `summary ${title}`,
    tags: [],
    sourceRefs: [],
    related: [],
    supersedes: [],
    promotedFrom: null,
    appliesTo: { branches: [], versions: [] },
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
    validFrom: null,
    expiresAt: null,
    lastVerified: null,
    supersededBy: null,
    format: 1,
    body: `## 结论\n${title}\n`,
    path: '',
    extra: {},
  } as KnowledgeRecord
}

describe('tencent sync', () => {
  it('pull proposes candidates and never commits', async () => {
    const fakeClient = client({
      listAtomics: async () => [
        atomic('m1', 'episodic', '用户决定使用腾讯做对照实验'),
        atomic('m2', 'instruction', '不要使用 pkill -f'),
      ],
      listScenarios: async () => [{ path: '运维规范.md', summary: '运维操作规范' }],
      readScenario: async () => '# 运维规范\n\n- 停服务用 docker stop\n',
    })
    const { host: fakeHost, state } = host()
    const sync = await makeSync({ client: fakeClient, host: fakeHost })
    const result = await sync.pull()
    expect(result.pulled).toBe(3)
    expect(result.proposed).toBe(3)
    expect(state.proposals.map((p) => p.scope)).toEqual(['global', 'global', 'global'])
    expect(state.audits.map((a) => a.type)).toContain('tencent.pull')
    // 状态已落盘：游标 + 增量来源记录
    const stateFile = JSON.parse(await readFile(join(recordsDir(), 'tencent-state.json'), 'utf8')) as {
      lastPullAt: string
      pulledIds: string[]
    }
    expect(stateFile.lastPullAt).toBeTruthy()
    expect(stateFile.pulledIds.sort()).toEqual(['m1', 'm2', 'scenario:运维规范.md'].sort())
  })

  it('pull is incremental: already-processed sources are skipped on the next run', async () => {
    const fakeClient = client({
      listAtomics: async () => [atomic('m1', 'episodic', '旧条目'), atomic('m2', 'episodic', '新条目')],
      listScenarios: async () => [],
    })
    const { host: fakeHost, state } = host()
    const sync = await makeSync({ client: fakeClient, host: fakeHost })
    const first = await sync.pull()
    expect(first.proposed).toBe(2)
    expect(state.proposals).toHaveLength(2)
    const second = await sync.pull()
    expect(second.proposed).toBe(0)
    expect(second.skipped).toBe(2) // 两条都已在 pulledIds 里
    expect(state.proposals).toHaveLength(2) // 没有重复生成
  })

  it('pull keeps per-item diagnostics in state.lastError', async () => {
    const fakeClient = client({
      listAtomics: async () => [atomic('m1', 'episodic', 'a'), atomic('m2', 'episodic', 'b')],
      listScenarios: async () => [],
    })
    const { host: fakeHost, state } = host()
    state.failPropose = true
    const sync = await makeSync({ client: fakeClient, host: fakeHost })
    const result = await sync.pull()
    expect(result.proposed).toBe(0)
    expect(result.skipped).toBe(2)
    const status = await sync.status()
    expect(status.state.lastError).toContain('pull 2 item(s) failed')
  })

  it('pull degrades on network failure instead of throwing', async () => {
    const fakeClient = client({
      listAtomics: async () => {
        throw new Error('ECONNREFUSED')
      },
    })
    const sync = await makeSync({ client: fakeClient })
    const result = await sync.pull()
    expect(result.proposed).toBe(0)
    const state = await sync.status()
    expect(state.state.lastError).toContain('pull failed')
  })

  it('push sends accepted knowledge and writes outbox on failure', async () => {
    const sent: Array<{ sessionId: string; content: string }> = []
    const fakeClient = client({
      addConversation: async (sessionId: string, _role, content) => {
        sent.push({ sessionId, content })
        return {}
      },
    })
    const { host: fakeHost, state } = host()
    state.accepted = [knowledge('KNO-000001', 'credentials ref 正则')]
    const sync = await makeSync({ client: fakeClient, host: fakeHost })
    const result = await sync.push()
    expect(result.pushed).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.content).toContain('credentials ref 正则')
    expect(state.audits.map((a) => a.type)).toContain('tencent.push')
  })

  it('push queues failed entries into outbox and replays them next time', async () => {
    let failFirst = true
    const sent: Array<{ sessionId: string }> = []
    const fakeClient = client({
      addConversation: async (sessionId: string) => {
        sent.push({ sessionId })
        if (failFirst) {
          failFirst = false
          throw new Error('offline')
        }
        return {}
      },
    })
    const { host: fakeHost, state } = host()
    state.accepted = [knowledge('KNO-000001', 'credentials ref 正则')]
    const sync = await makeSync({ client: fakeClient, host: fakeHost })

    const first = await sync.push()
    expect(first.outboxed).toBe(1)
    expect(sent).toHaveLength(1) // 第一次失败
    const status = await sync.status()
    expect(status.state.outboxPending).toBe(1)

    const second = await sync.push()
    expect(second.pushed).toBe(1) // 重放成功
    expect(sent).toHaveLength(2)
    const after = await sync.status()
    expect(after.state.outboxPending).toBe(0)
  })

  it('clearOutbox empties the queue', async () => {
    const fakeClient = client({
      addConversation: async () => {
        throw new Error('offline')
      },
    })
    const { host: fakeHost, state } = host()
    state.accepted = [knowledge('KNO-000001', 'x')]
    const sync = await makeSync({ client: fakeClient, host: fakeHost })
    await sync.push()
    expect((await sync.status()).state.outboxPending).toBe(1)
    await clearOutbox(recordsDir())
    expect((await sync.status()).state.outboxPending).toBe(0)
  })
})
