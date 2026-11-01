import { describe, expect, it } from 'vitest'
import { KnowledgeIndex, tokenize } from '../src/search.js'
import type { KnowledgeRecord } from '../src/types.js'

function record(overrides: Partial<KnowledgeRecord>): KnowledgeRecord {
  return {
    id: 'DEC-000001',
    type: 'decision',
    scope: { level: 'global' },
    status: 'accepted',
    version: 1,
    title: 'Title',
    summary: 'Summary',
    tags: [],
    sourceRefs: ['note:test'],
    related: [],
    supersedes: [],
    promotedFrom: null,
    appliesTo: { branches: [], versions: [] },
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    format: 1,
    body: 'Body',
    path: '/hub/knowledge/decision/DEC-000001.md',
    extra: {},
    ...overrides,
  }
}

describe('tokenizer', () => {
  it('splits CJK into unigrams and bigrams', () => {
    const tokens = tokenize('缓存广播')
    expect(tokens).toContain('缓存')
    expect(tokens).toContain('存广')
    expect(tokens).toContain('广播')
    expect(tokens).toContain('缓')
  })

  it('normalizes latin words and drops common stopwords', () => {
    const tokens = tokenize('The CACHE_Broadcast is ready')
    expect(tokens).toContain('cache_broadcast')
    expect(tokens).toContain('ready')
    expect(tokens).not.toContain('the')
    expect(tokens).not.toContain('is')
  })
})

describe('knowledge index', () => {
  it('ranks a title match above an unrelated entry', () => {
    const index = new KnowledgeIndex()
    index.add(record({
      id: 'DEC-000001',
      title: '缓存广播使用版本号',
      summary: '广播消息携带单调版本号。',
      body: '## 结论\n\n使用版本号，不使用时间戳。',
    }))
    index.add(record({
      id: 'CON-000001',
      type: 'constraint',
      title: '渲染进程不得直接访问磁盘',
      summary: '所有文件操作经主进程 IPC。',
      body: '## 结论\n\n渲染进程禁止 fs。',
    }))

    const hits = index.search('缓存 广播 版本号', {
      visibility: { global: true, domains: new Set(), projects: new Set() },
    })
    expect(hits[0]?.id).toBe('DEC-000001')
    expect(hits[0]?.summary).toContain('版本号')
  })

  it('honors status, type, and scope filters', () => {
    const index = new KnowledgeIndex()
    index.add(record({ id: 'DEC-000001', title: '缓存广播', summary: '全局', scope: { level: 'global' } }))
    index.add(record({
      id: 'DEC-000002',
      title: '缓存广播项目版',
      summary: '项目',
      scope: { level: 'project', workspaceId: 'backend' },
    }))
    index.add(record({ id: 'DEC-000003', title: '缓存广播旧版', summary: '已废弃', status: 'deprecated' }))
    index.add(record({ id: 'CON-000001', type: 'constraint', title: '缓存广播约束', summary: '约束' }))

    const globalOnly = index.search('缓存广播', {
      visibility: { global: true, domains: new Set(), projects: new Set() },
    })
    expect(globalOnly.map((hit) => hit.id).sort()).toEqual(['CON-000001', 'DEC-000001'])

    const project = index.search('缓存广播', {
      visibility: { global: true, domains: new Set(), projects: new Set(['backend']) },
    })
    expect(project.some((hit) => hit.id === 'DEC-000002')).toBe(true)

    const constraints = index.search('缓存广播', {
      visibility: { global: true, domains: new Set(), projects: new Set() },
      types: new Set(['constraint']),
    })
    expect(constraints.map((hit) => hit.id)).toEqual(['CON-000001'])

    const deprecated = index.search('缓存广播', {
      visibility: { global: true, domains: new Set(), projects: new Set() },
      statuses: new Set(['deprecated']),
    })
    expect(deprecated.map((hit) => hit.id)).toEqual(['DEC-000003'])
  })

  it('drops hits below minScore and boosts the preferred project', () => {
    const index = new KnowledgeIndex()
    index.add(record({ id: 'KNO-000001', title: '缓存广播', summary: '全局版本' }))
    index.add(record({
      id: 'KNO-000002',
      title: '缓存广播',
      summary: '项目版本',
      scope: { level: 'project', workspaceId: 'backend' },
    }))
    const visibility = { global: true, domains: new Set<string>(), projects: new Set(['backend']) }

    expect(index.search('缓存广播', { visibility, minScore: 1_000_000 })).toEqual([])
    expect(index.search('缓存广播', { visibility, minScore: 0 }).length).toBe(2)

    const boosted = index.search('缓存广播', {
      visibility,
      preferProject: 'backend',
      localBoost: 2,
    })
    expect(boosted[0]?.id).toBe('KNO-000002')
  })

  it('returns no hits for an empty or unmatchable query', () => {
    const index = new KnowledgeIndex()
    index.add(record({ id: 'DEC-000001', title: '缓存广播' }))
    expect(index.search('', { visibility: { global: true, domains: new Set(), projects: new Set() } })).toEqual([])
    expect(index.search('zzzzzz', { visibility: { global: true, domains: new Set(), projects: new Set() } })).toEqual([])
  })
})
