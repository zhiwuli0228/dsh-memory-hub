import { describe, expect, it } from 'vitest'
import { findNearDuplicates, keeperOf } from '../src/duplicates.js'
import { MemoryError } from '../src/errors.js'
import type { KnowledgeRecord } from '../src/types.js'
import { createHarness } from './helpers.js'

function record(overrides: Partial<KnowledgeRecord> & { id: string }): KnowledgeRecord {
  return {
    type: 'decision',
    scope: { level: 'global' },
    status: 'accepted',
    version: 1,
    title: '版本号广播规范',
    summary: '广播消息使用单调递增版本号。',
    tags: [],
    sourceRefs: ['note:test'],
    related: [],
    supersedes: [],
    promotedFrom: null,
    appliesTo: { branches: [], versions: [] },
    validFrom: null,
    expiresAt: null,
    lastVerified: null,
    supersededBy: null,
    createdAt: '2026-11-01T09:00:00+08:00',
    updatedAt: '2026-11-01T09:00:00+08:00',
    body: '## 结论\n\n广播消息使用单调递增的版本号，接收方据此丢弃旧消息。\n',
    path: `/tmp/${overrides.id}.md`,
    format: 1,
    extra: {},
    ...overrides,
  }
}

describe('near-duplicate detection', () => {
  it('reports a lightly edited copy at the default threshold and a different conclusion below it', () => {
    const original = record({ id: 'DEC-000001' })
    const paraphrase = record({
      id: 'DEC-000002',
      summary: '广播消息使用单调递增的版本号。',
      body: '## 结论\n\n广播消息使用单调递增的版本号，接收方据此丢弃旧消息，重连后从快照恢复。\n',
    })
    const different = record({
      id: 'DEC-000003',
      title: '广播消息使用时间戳',
      summary: '广播消息改用时间戳排序。',
      body: '## 结论\n\n广播排序改用时间戳，不再依赖版本号；时钟偏差由序列号兜底。\n',
    })
    const pairs = findNearDuplicates({ records: [original, paraphrase, different] })
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.similarity).toBeGreaterThanOrEqual(0.72)
    expect(pairs[0]!.highConfidence).toBe(true)
    expect([pairs[0]!.keeperId, pairs[0]!.otherId].sort()).toEqual(['DEC-000001', 'DEC-000002'])

    const strict = findNearDuplicates({ records: [original, paraphrase], threshold: 0.95 })
    expect(strict).toHaveLength(0)
  })

  it('never compares across scope or type and skips non-accepted or already merged entries', () => {
    const base = record({ id: 'DEC-000001' })
    const crossScope = record({ id: 'DEC-000002', scope: { level: 'project', workspaceId: 'ws-a' } })
    const crossType = record({ id: 'DEC-000003', type: 'knowledge' })
    const superseded = record({ id: 'DEC-000004', status: 'superseded' })
    const merged = record({ id: 'DEC-000005', supersededBy: 'DEC-000001' })
    expect(findNearDuplicates({ records: [base, crossScope, crossType, superseded, merged], threshold: 0.2 })).toEqual([])

    const sameScope = record({ id: 'DEC-000006', title: '版本号广播规范 v2' })
    const pairs = findNearDuplicates({ records: [base, sameScope], threshold: 0.2 })
    expect(pairs).toHaveLength(1)
    expect([pairs[0]!.keeperId, pairs[0]!.otherId].sort()).toEqual(['DEC-000001', 'DEC-000006'])
  })

  it('picks the keeper by version, updatedAt, sourceRefs, then id', () => {
    const newerVersion = record({ id: 'DEC-000002', version: 3 })
    const olderVersion = record({ id: 'DEC-000001', version: 2 })
    expect(keeperOf(olderVersion, newerVersion).id).toBe('DEC-000002')

    const fresher = record({ id: 'DEC-000003', updatedAt: '2026-11-02T09:00:00+08:00' })
    const staler = record({ id: 'DEC-000004', updatedAt: '2026-11-01T09:00:00+08:00' })
    expect(keeperOf(staler, fresher).id).toBe('DEC-000003')

    const moreRefs = record({ id: 'DEC-000005', sourceRefs: ['a', 'b'] })
    const fewerRefs = record({ id: 'DEC-000006', sourceRefs: ['a'] })
    expect(keeperOf(fewerRefs, moreRefs).id).toBe('DEC-000005')

    const left = record({ id: 'DEC-000007' })
    const right = record({ id: 'DEC-000008' })
    expect(keeperOf(right, left).id).toBe('DEC-000007')
  })

  it('is deterministic and respects maxPairs', () => {
    const records = Array.from({ length: 6 }, (_, index) =>
      record({ id: `DEC-00001${index}`, title: `版本号广播规范 ${index}` }))
    const first = findNearDuplicates({ records, threshold: 0.2, maxPairs: 5 })
    const second = findNearDuplicates({ records, threshold: 0.2, maxPairs: 5 })
    expect(first).toEqual(second)
    expect(first.length).toBe(5)
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index - 1]!.similarity).toBeGreaterThanOrEqual(first[index]!.similarity)
    }
  })

  it('exposes the detection through memory_duplicates without writing files', async () => {
    const harness = await createHarness()
    try {
      const first = await harness.seed({
        title: '版本号广播规范',
        summary: '广播消息使用单调递增版本号。',
        body: '## 结论\n\n广播消息使用单调递增的版本号，接收方据此丢弃旧消息。\n',
      })
      const second = await harness.seed({
        title: '版本号广播规范',
        summary: '广播消息使用单调递增的版本号。',
        body: '## 结论\n\n广播消息使用单调递增的版本号，接收方据此丢弃旧消息，重连后从快照恢复。\n',
      })
      await harness.seed({ title: '面板配色', summary: '面板使用深色主题。', body: '## 结论\n\n深色主题。\n' })

      const result = await harness.service.duplicates(harness.agent, {})
      expect(result.total).toBe(1)
      expect([result.pairs[0]!.keeper.id, result.pairs[0]!.other.id].sort()).toEqual([first, second].sort())

      const limited = await harness.service.duplicates(harness.agent, { limit: 0 })
      expect(limited.total).toBe(1)

      await expect(harness.service.duplicates(harness.agent, { threshold: 2 })).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
      await expect(harness.service.duplicates(harness.agent, { scope: 'project:unknown' })).rejects.toBeInstanceOf(MemoryError)
    } finally {
      await harness.cleanup()
    }
  })
})
