import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ScenarioBuilder } from '../src/scenario.js'
import type { KnowledgeRecord } from '../src/types.js'

let root = ''

afterEach(async () => {
  if (root !== '') {
    await rm(root, { recursive: true, force: true })
    root = ''
  }
})

function record(overrides: Partial<KnowledgeRecord> & { id: string; title: string }): KnowledgeRecord {
  return {
    type: 'knowledge',
    scope: { level: 'global' },
    status: 'accepted',
    version: 1,
    summary: `summary ${overrides.title}`,
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
    body: '',
    path: '',
    extra: {},
    ...overrides,
  } as KnowledgeRecord
}

describe('scenario builder', () => {
  it('groups by explicit topic tag and writes scenario files', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-scenario-test-'))
    const builder = new ScenarioBuilder({ scenarioDir: 'scenario', minEntries: 2 })
    const result = await builder.rebuild(root, [
      record({ id: 'KNO-1', title: '运维 a', tags: ['topic:ops'] }),
      record({ id: 'KNO-2', title: '运维 b', tags: ['topic:ops'] }),
      record({ id: 'KNO-3', title: '孤立条目', tags: ['topic:solo'] }),
    ])
    expect(result.scenarios).toHaveLength(1)
    expect(result.scenarios[0]!.topic).toBe('ops')
    expect(result.skipped).toBe(1) // solo 只有 1 条
    const content = await readFile(join(root, 'scenario', 'ops.md'), 'utf8')
    expect(content).toContain('KNO-1')
    expect(content).toContain('KNO-2')
    expect(content).toContain('派生视图')
  })

  it('falls back to knowledge type when no topic tag', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-scenario-test-'))
    const builder = new ScenarioBuilder({ scenarioDir: 'scenario', minEntries: 2 })
    const result = await builder.rebuild(root, [
      record({ id: 'DEC-1', title: '决策 a', type: 'decision' }),
      record({ id: 'DEC-2', title: '决策 b', type: 'decision' }),
    ])
    expect(result.scenarios.map((s) => s.topic)).toEqual(['decision'])
  })

  it('ignores non-accepted records', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-scenario-test-'))
    const builder = new ScenarioBuilder({ scenarioDir: 'scenario', minEntries: 1 })
    const result = await builder.rebuild(root, [
      record({ id: 'KNO-1', title: 'a', tags: ['topic:x'], status: 'candidate' }),
      record({ id: 'KNO-2', title: 'b', tags: ['topic:x'] }),
    ])
    expect(result.scenarios).toHaveLength(1)
    expect(result.scenarios[0]!.entries).toBe(1)
  })

  it('removes stale scenario files on rebuild', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-scenario-test-'))
    const builder = new ScenarioBuilder({ scenarioDir: 'scenario', minEntries: 1 })
    await builder.rebuild(root, [
      record({ id: 'KNO-1', title: 'a', tags: ['topic:old'] }),
      record({ id: 'KNO-2', title: 'b', tags: ['topic:old'] }),
    ])
    expect((await readdir(join(root, 'scenario'))).filter((n) => n.endsWith('.md'))).toHaveLength(1)
    // 重建时 old 主题消失
    await builder.rebuild(root, [record({ id: 'KNO-3', title: 'c', tags: ['topic:new'] })])
    const files = (await readdir(join(root, 'scenario'))).filter((n) => n.endsWith('.md'))
    expect(files).toEqual(['new.md'])
  })

  it('returns disabled when scenarioDir is empty', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-scenario-test-'))
    const builder = new ScenarioBuilder({ scenarioDir: '' })
    expect(builder.enabled).toBe(false)
    const result = await builder.rebuild(root, [record({ id: 'KNO-1', title: 'a' })])
    expect(result.scenarios).toEqual([])
  })

  it('does not touch knowledge directory', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-scenario-test-'))
    const builder = new ScenarioBuilder({ scenarioDir: 'scenario', minEntries: 1 })
    await builder.rebuild(root, [
      record({ id: 'KNO-1', title: 'a', tags: ['topic:x'] }),
      record({ id: 'KNO-2', title: 'b', tags: ['topic:x'] }),
    ])
    // knowledge/ 从未被创建或写入
    const entries = await readdir(root)
    expect(entries).toContain('scenario')
    expect(entries).not.toContain('knowledge')
  })
})
