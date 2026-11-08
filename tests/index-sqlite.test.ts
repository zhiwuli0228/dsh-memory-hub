import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteIndex } from '../src/index-sqlite.js'
import { KnowledgeIndex } from '../src/search.js'
import type { SearchFilters } from '../src/search.js'
import type { KnowledgeRecord } from '../src/types.js'
import { createHarness } from './helpers.js'

function record(id: string, overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id,
    type: 'decision',
    scope: { level: 'global' },
    status: 'accepted',
    version: 1,
    title: '缓存广播使用版本号',
    summary: '广播消息携带单调版本号，避免乱序覆盖。',
    tags: ['cache'],
    sourceRefs: ['note:test'],
    related: [],
    supersedes: [],
    promotedFrom: null,
    appliesTo: { branches: [], versions: [] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    validFrom: null,
    expiresAt: null,
    lastVerified: null,
    supersededBy: null,
    format: 1,
    body: '## 结论\n\n使用版本号广播，旧消息直接丢弃。\n',
    path: `memory://${id}`,
    extra: {},
    ...overrides,
  }
}

function corpus(): KnowledgeRecord[] {
  return [
    record('DEC-000001'),
    record('DEC-000002', { type: 'constraint', title: '广播必须带版本号', tags: ['cache', 'protocol'] }),
    record('DEC-000003', {
      type: 'knowledge',
      scope: { level: 'project', workspaceId: 'backend' },
      title: '广播重试策略',
      summary: '重试指数退避，超过三次放弃。',
      body: '## 结论\n\n指数退避重试。\n',
      updatedAt: '2026-11-01T00:00:00.000Z',
    }),
    record('DEC-000004', {
      status: 'candidate',
      title: '待定的广播方案',
      summary: '候选方案，尚未批准。',
      body: '## 结论\n\n候选。\n',
    }),
    record('DEC-000005', {
      type: 'process',
      title: '发布流程',
      summary: '先灰度再全量。',
      body: '## 结论\n\n灰度发布。\n',
      tags: ['release'],
    }),
    record('DEC-000006', {
      title: '过期结论',
      summary: '这条已经过期。',
      body: '## 结论\n\n过期。\n',
      validFrom: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-06-01T00:00:00.000Z',
      supersededBy: 'DEC-000001',
    }),
  ]
}

function visibility(): SearchFilters['visibility'] {
  return { global: true, domains: new Set<string>(), projects: new Set<string>(['backend']) }
}

/** 打开的索引统一在 afterEach 关闭：SQLite 文件不关闭会锁住临时目录（Windows）。 */
const opened: SqliteIndex[] = []
const dirs: string[] = []

afterEach(async () => {
  for (const index of opened.splice(0)) {
    try {
      index.close()
    } catch {
      // 测试里已经显式关闭过。
    }
  }
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

async function openIndex(path: string, records: KnowledgeRecord[], fingerprint = 'test:0'): Promise<SqliteIndex> {
  const outcome = await SqliteIndex.open({
    path,
    fingerprint,
    recordOf: (id) => records.find((item) => item.id === id),
  })
  if (!('index' in outcome)) throw new Error(outcome.reason)
  opened.push(outcome.index)
  await outcome.index.rebuild(
    (async function* iterate() {
      yield* records
    })(),
  )
  return outcome.index
}

describe('sqlite derived index', () => {
  it('returns the same ranking and scores as the memory index', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dmh-sqlite-'))
    try {
      const records = corpus()
      const memory = new KnowledgeIndex()
      for (const item of records) memory.add(item)
      const sqlite = await openIndex(join(dir, 'index.sqlite'), records)
      expect(sqlite.size).toBe(records.length)

      const filters: SearchFilters[] = [
        { visibility: visibility(), limit: 5, nowMs: Date.parse('2026-11-08T00:00:00Z') },
        { visibility: visibility(), limit: 3, minScore: 0.5, nowMs: Date.parse('2026-11-08T00:00:00Z') },
        {
          visibility: visibility(),
          statuses: new Set(['accepted', 'candidate']),
          types: new Set(['decision', 'constraint']),
          localBoost: 1.2,
          preferProject: 'backend',
          limit: 4,
          nowMs: Date.parse('2026-11-08T00:00:00Z'),
        },
        {
          visibility: visibility(),
          excludeTemporal: new Set(['stale', 'scheduled']),
          limit: 6,
          nowMs: Date.parse('2026-11-08T00:00:00Z'),
        },
      ]

      for (const query of ['版本号', '广播 消息', 'cache', '灰度 发布', '不存在的词']) {
        for (const filter of filters) {
          const expected = memory.search(query, filter)
          const actual = sqlite.search(query, filter)
          expect(actual.map((hit) => hit.id)).toEqual(expected.map((hit) => hit.id))
          for (const [index, hit] of actual.entries()) {
            expect(hit.score).toBeCloseTo(expected[index]!.score, 9)
          }
        }
      }
    } finally {
      dirs.push(dir)
    }
  })

  it('reuses a matching index and rebuilds when the fingerprint changes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dmh-sqlite-'))
    try {
      const records = corpus()
      const path = join(dir, 'index.sqlite')
      const first = await openIndex(path, records)
      first.setFingerprint('6:100')
      first.close()

      const reused = await SqliteIndex.open({
        path,
        fingerprint: '6:100',
        recordOf: (id) => records.find((item) => item.id === id),
      })
      expect('index' in reused && reused.rebuilt === false).toBe(true)
      if (!('index' in reused)) return
      opened.push(reused.index)
      expect(reused.index.size).toBe(6)
      reused.index.close()

      const stale = await SqliteIndex.open({
        path,
        fingerprint: '7:200',
        recordOf: (id) => records.find((item) => item.id === id),
      })
      expect('index' in stale && stale.rebuilt === true).toBe(true)
      if (!('index' in stale)) return
      opened.push(stale.index)
      expect(stale.index.size).toBe(0)
      stale.index.close()
    } finally {
      dirs.push(dir)
    }
  })

  it('keeps add/remove/clear consistent with the memory index', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dmh-sqlite-'))
    try {
      const memory = new KnowledgeIndex()
      // recordOf 走同一个可变数组：后加进来的记录也能被 SQL 索引找到元数据。
      const records: KnowledgeRecord[] = []
      const sqlite = await openIndex(join(dir, 'index.sqlite'), records)
      for (const item of corpus()) {
        records.push(item)
        memory.add(item)
        sqlite.add(item)
      }
      sqlite.remove('DEC-000002')
      memory.remove('DEC-000002')
      const filter: SearchFilters = { visibility: visibility(), limit: 10, nowMs: Date.parse('2026-11-08T00:00:00Z') }
      expect(sqlite.search('广播', filter).map((hit) => hit.id)).toEqual(memory.search('广播', filter).map((hit) => hit.id))

      const added = record('DEC-000007', { title: '新增广播约束', tags: ['cache'] })
      records.push(added)
      memory.add(added)
      sqlite.add(added)
      expect(sqlite.search('新增', filter).map((hit) => hit.id)).toEqual(memory.search('新增', filter).map((hit) => hit.id))

      sqlite.clear()
      expect(sqlite.size).toBe(0)
      expect(sqlite.search('广播', filter)).toEqual([])
      sqlite.close()
    } finally {
      dirs.push(dir)
    }
  })

  it('falls back to a reason instead of throwing on an unreadable file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dmh-sqlite-'))
    try {
      const path = join(dir, 'index.sqlite')
      await writeFile(path, 'this is not a sqlite database')
      const outcome = await SqliteIndex.open({
        path,
        fingerprint: '0:0',
        recordOf: () => undefined,
      })
      expect('reason' in outcome).toBe(true)
    } finally {
      dirs.push(dir)
    }
  })
})

describe('store with the sqlite index', () => {
  it('switches backends by config, persists commits and reuses the index on restart', async () => {
    const harness = await createHarness()
    try {
      expect(harness.store.indexBackend).toBe('memory')
      harness.hub.config.storage.index = 'sqlite'
      await harness.store.load()
      expect(harness.store.indexBackend).toBe('sqlite')
      expect(harness.store.indexRebuilt).toBe(true)
      expect(existsSync(harness.hub.indexPath())).toBe(true)

      const id = await harness.seed({
        type: 'decision',
        title: '广播使用单调版本号',
        summary: '广播消息带版本号，乱序丢弃。',
      })
      const hits = harness.store.search('版本号', { visibility: visibility(), limit: 5 })
      expect(hits.map((hit) => hit.id)).toContain(id)

      await harness.store.load()
      expect(harness.store.indexBackend).toBe('sqlite')
      expect(harness.store.indexRebuilt).toBe(false)
      expect(harness.store.search('版本号', { visibility: visibility(), limit: 5 }).map((hit) => hit.id)).toContain(id)
    } finally {
      await harness.cleanup()
    }
  })

  it('does not create an index file when the config says memory', async () => {
    const harness = await createHarness()
    try {
      harness.hub.config.storage.index = 'memory'
      await harness.store.load()
      expect(harness.store.indexBackend).toBe('memory')
      expect(existsSync(harness.hub.indexPath())).toBe(false)
    } finally {
      await harness.cleanup()
    }
  })
})


