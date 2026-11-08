import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  NullSessionDigestSource,
  buildDigest,
  ownerWorkspaceOf,
  reflectRoots,
  type ReflectSessionSnapshot,
  type SessionDigestSource,
} from '../src/reflect.js'
import { createHarness, type Harness } from './helpers.js'

function snapshot(
  id: string,
  cwd: string,
  events: ReflectSessionSnapshot['events'],
  createdAt = Date.now(),
): ReflectSessionSnapshot {
  return { session: { id, cwd, createdAt }, events }
}

function user(text: string, seq: number): ReflectSessionSnapshot['events'][number] {
  return { type: 'user/message', seq, data: { role: 'user', blocks: [{ type: 'text', text }] } }
}

function assistant(text: string, seq: number): ReflectSessionSnapshot['events'][number] {
  return { type: 'assistant/message', seq, data: { message: { role: 'assistant', blocks: [{ type: 'text', text }] } } }
}

function turnEnd(seq: number): ReflectSessionSnapshot['events'][number] {
  return { type: 'turn/end', seq, data: {} }
}

class FakeSource implements SessionDigestSource {
  readonly available = true
  readonly sessions = new Map<string, ReflectSessionSnapshot>()

  constructor(private readonly records: ReflectSessionSnapshot[]) {
    for (const record of records) this.sessions.set(record.session.id, record)
  }

  async listSessions() {
    return this.records.map((record) => ({ header: record.session, live: false, persisted: true }))
  }

  async readSession(sessionId: string) {
    const record = this.sessions.get(sessionId)
    if (record === undefined) throw new Error('session not found')
    return record
  }

  async searchEvents(request: { sessionId: string; query: string; limit?: number }) {
    const record = this.sessions.get(request.sessionId)
    if (record === undefined) throw new Error('session not found')
    const needle = request.query.toLowerCase()
    const items = record.events
      .filter((event) => JSON.stringify(event.data ?? '').toLowerCase().includes(needle))
      .slice(0, request.limit ?? 20)
      .map((event) => ({
        sessionId: request.sessionId,
        seq: event.seq ?? 0,
        type: event.type,
        time: event.time,
        snippet: needle,
      }))
    return { session: record.session, items }
  }
}

function longConversation(id: string, cwd: string, marker: string): ReflectSessionSnapshot {
  return snapshot(id, cwd, [
    user(`${marker} 第一个诉求`, 1),
    assistant(`${marker} 先试方案 A`, 2),
    turnEnd(3),
    user(`${marker} 方案 A 不可行，换 B`, 4),
    assistant(`${marker} 最终采用方案 B，因为 A 在 Windows 上路径不兼容`, 5),
    turnEnd(6),
  ])
}

describe('session digest', () => {
  it('keeps user asks, assistant conclusions and failed tools only', () => {
    const result = buildDigest(
      snapshot('s-1', 'E:/repo', [
        user('请把上传超时的问题修掉', 1),
        { type: 'tool/call', seq: 2, data: { callId: 'call-1', name: 'bash' } },
        {
          type: 'tool/result',
          seq: 3,
          data: {
            message: { toolCallId: 'call-1' },
            error: { name: 'TimeoutError', code: 'ETIMEDOUT', reason: 'curl timed out' },
          },
        },
        { type: 'tool/result', seq: 4, data: { message: { toolCallId: 'call-2' }, output: 'SECRET_TOKEN=abc123' } },
        assistant('最终把超时从 30s 调到 90s，并在重试时复用连接', 5),
        turnEnd(6),
      ]),
      { workspaceId: 'backend', maxChars: 8000, minMessages: 2 },
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const text = JSON.stringify(result.digest)
    expect(text).toContain('请把上传超时的问题修掉')
    expect(text).toContain('最终把超时从 30s 调到 90s')
    expect(text).toContain('TimeoutError')
    expect(text).toContain('curl timed out')
    expect(text).not.toContain('SECRET_TOKEN')
    expect(result.digest.failures).toHaveLength(1)
  })

  it('skips short sessions and truncates oversized digests', () => {
    const short = buildDigest(
      snapshot('s-2', 'E:/repo', [user('只有一句', 1), assistant('回答', 2), turnEnd(3)]),
      { workspaceId: 'backend', maxChars: 8000, minMessages: 4 },
    )
    expect(short.status).toBe('too-short')

    const huge = buildDigest(
      snapshot('s-3', 'E:/repo', [
        user('x'.repeat(4000), 1),
        assistant('y'.repeat(4000), 2),
        turnEnd(3),
        user('z'.repeat(4000), 4),
        assistant('w'.repeat(4000), 5),
        turnEnd(6),
      ]),
      { workspaceId: 'backend', maxChars: 900, minMessages: 4 },
    )
    expect(huge.status).toBe('ok')
    if (huge.status !== 'ok') return
    expect(huge.digest.truncated).toBe(true)
    expect(huge.digest.chars).toBeLessThanOrEqual(900)
  })

  it('attributes a session to the deepest matching root', () => {
    const roots = reflectRoots({
      core_workspaces: [{ id: 'product', root: 'D:/projects' }],
      workspaces: [{ id: 'backend', root: 'D:/projects/backend', domains: [], admin: false, enabled: true }],
    } as never)
    expect(ownerWorkspaceOf('D:/projects/other', roots)?.workspaceId).toBe('product')
    expect(ownerWorkspaceOf('D:/projects/backend/sub', roots)?.workspaceId).toBe('backend')
    expect(ownerWorkspaceOf('D:/elsewhere', roots)).toBeNull()
    expect(ownerWorkspaceOf(undefined, roots)).toBeNull()
  })
})

async function reflectHarness(source: SessionDigestSource): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'dmh-reflect-'))
  const harness = await createHarness(
    [
      { id: 'product', root, domains: [], admin: false, enabled: true },
      { id: 'child', core_id: 'product', root: join(root, 'child'), domains: [], admin: false, enabled: true },
    ],
    { root, reflectSource: source },
  )
  harness.hub.config.core_workspaces = [{ id: 'product', root } as never]
  return harness
}

describe('memory_reflect', () => {
  it('reads only sessions owned by the current workspace and records a watermark', async () => {
    const source = new FakeSource([
      longConversation('s-core', 'E:/placeholders/core', '核心'),
      longConversation('s-child', 'E:/placeholders/child', '子区'),
      longConversation('s-outside', 'E:/somewhere/else', '外部'),
    ])
    const harness = await reflectHarness(source)
    try {
      // 重新放置：root 只有在 harness 创建后才知道。
      source.sessions.get('s-core')!.session.cwd = harness.root
      source.sessions.get('s-child')!.session.cwd = join(harness.root, 'child')

      const result = await harness.service.reflect(harness.agent, {})
      expect(result.available).toBe(true)
      expect(result.sessions.map((entry) => entry.sessionId)).toEqual(['s-core'])
      expect(result.sessions[0]!.digest).toContain('核心 最终采用方案 B')
      expect(result.sessions[0]!.seqRange).toEqual({ from: 1, to: 6 })

      const state = JSON.parse(await readFile(join(harness.root, 'records', 'reflect-state.json'), 'utf8')) as {
        sessions: Array<{ sessionId: string; digestHash: string }>
      }
      expect(state.sessions.map((entry) => entry.sessionId)).toEqual(['s-core'])

      const ledger = await readFile(harness.hub.ledgerPath(), 'utf8')
      expect(ledger).toContain('"type":"reflect.read"')

      // digest → memory_propose 的闭环：source_refs 用 digest 给出的序号区间。
      const proposal = await harness.store.propose(
        {
          operation: 'create',
          type: 'decision',
          scope: 'project:product',
          title: '上传超时改为 90s',
          summary: '最终把超时从 30s 调到 90s，重试时复用连接。',
          content: '## 结论\n上传超时改为 90s，原因是 Windows 上方案 A 的路径不兼容。\n',
          sourceRefs: ['session:s-core#1-6'],
          tags: ['reflection'],
        },
        { taskId: 'TSK-reflect' },
      )
      expect(proposal.id).toMatch(/^PRO-/)

      const again = await harness.service.reflect(harness.agent, {})
      expect(again.sessions).toHaveLength(0)
      expect(again.skipped).toEqual([{ sessionId: 's-core', reason: 'already-reflected' }])
    } finally {
      await harness.cleanup()
    }
  })

  it('rejects sessions from another workspace and supports dry runs', async () => {
    const source = new FakeSource([
      longConversation('s-core', 'E:/placeholders/core', '核心'),
      longConversation('s-child', 'E:/placeholders/child', '子区'),
    ])
    const harness = await reflectHarness(source)
    try {
      source.sessions.get('s-core')!.session.cwd = harness.root
      source.sessions.get('s-child')!.session.cwd = join(harness.root, 'child')

      await expect(
        harness.service.reflect(harness.agent, { session_id: 's-child' }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })

      const dry = await harness.service.reflect(harness.agent, { dry_run: true })
      expect(dry.dryRun).toBe(true)
      expect(dry.sessions.map((entry) => entry.sessionId)).toEqual(['s-core'])
      await expect(stat(join(harness.root, 'records', 'reflect-state.json'))).rejects.toThrow()
    } finally {
      await harness.cleanup()
    }
  })

  it('searches original events without writing a watermark', async () => {
    const source = new FakeSource([longConversation('s-core', 'E:/placeholders/core', '核心')])
    const harness = await reflectHarness(source)
    try {
      source.sessions.get('s-core')!.session.cwd = harness.root

      const result = await harness.service.reflect(harness.agent, { mode: 'search', query: '方案 B' })
      expect(result.mode).toBe('search')
      expect(result.available).toBe(true)
      expect(result.hits?.map((hit) => hit.seq)).toEqual([5])
      expect(result.hits?.[0]?.snippet).toBe('方案 b')
      expect(result.hits?.[0]?.cwd).toBe(harness.root)
      expect(result.hitsTruncated).toBe(false)
      // 只读：search 模式不写水位、不写账本。
      await expect(stat(join(harness.root, 'records', 'reflect-state.json'))).rejects.toThrow()

      await expect(
        harness.service.reflect(harness.agent, { mode: 'search', query: '方案 B', session_id: 's-other' }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(
        harness.service.reflect(harness.agent, { mode: 'search' }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    } finally {
      await harness.cleanup()
    }
  })

  it('reports unavailable when the host has no sessionQuery service', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dmh-reflect-'))
    const harness = await createHarness(
      [{ id: 'solo', root, domains: [], admin: false, enabled: true }],
      { root, reflectSource: new NullSessionDigestSource() },
    )
    try {
      const result = await harness.service.reflect(harness.agent, {})
      expect(result.available).toBe(false)
      expect(result.sessions).toEqual([])
    } finally {
      await harness.cleanup()
    }
  })
})
