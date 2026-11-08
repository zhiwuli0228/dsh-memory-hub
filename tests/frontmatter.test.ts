import { describe, expect, it } from 'vitest'
import { parseKnowledgeFile, parseProposalFile, serializeKnowledgeFile, serializeProposalFile } from '../src/frontmatter.js'
import type { KnowledgeRecord, ProposalRecord } from '../src/types.js'

function record(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: 'DEC-000001',
    type: 'decision',
    scope: { level: 'project', workspaceId: 'backend' },
    status: 'accepted',
    version: 3,
    title: '缓存广播使用版本号',
    summary: '广播消息携带单调版本号，接收端丢弃过期消息。',
    tags: ['cache', 'broadcast'],
    sourceRefs: ['session:abc#1-4'],
    related: ['CON-000002'],
    supersedes: ['DEC-000000'],
    promotedFrom: null,
    appliesTo: { branches: ['main'], versions: [] },
    createdAt: '2026-11-01T09:00:00+08:00',
    updatedAt: '2026-11-01T10:00:00+08:00',
    validFrom: null,
    expiresAt: null,
    lastVerified: null,
    supersededBy: null,
    format: 1,
    body: '## 结论\n\n使用版本号。\n\n## 依据\n\n时间戳会漂移。\n',
    path: 'C:/hub/knowledge/decision/DEC-000001.md',
    extra: {},
    ...overrides,
  }
}

describe('knowledge frontmatter', () => {
  it('round-trips a record and quotes timestamps', () => {
    const raw = serializeKnowledgeFile(record())
    expect(raw).toContain("created_at: '2026-11-01T09:00:00+08:00'")
    const parsed = parseKnowledgeFile(raw, 'DEC-000001.md')
    expect(parsed.id).toBe('DEC-000001')
    expect(parsed.type).toBe('decision')
    expect(parsed.scope).toEqual({ level: 'project', workspaceId: 'backend' })
    expect(parsed.status).toBe('accepted')
    expect(parsed.version).toBe(3)
    expect(parsed.body).toContain('使用版本号')
    expect(parsed.sourceRefs).toEqual(['session:abc#1-4'])
    expect(parsed.supersedes).toEqual(['DEC-000000'])
  })

  it('preserves unknown frontmatter keys', () => {
    const raw = serializeKnowledgeFile(record({ extra: { owner: 'team-a' } }))
    const parsed = parseKnowledgeFile(raw, 'DEC-000001.md')
    expect(parsed.extra.owner).toBe('team-a')
  })

  it('rejects a missing summary', () => {
    const raw = serializeKnowledgeFile(record()).replace(/^summary: .*$/m, '')
    expect(() => parseKnowledgeFile(raw, 'DEC-000001.md')).toThrow(/invalid knowledge frontmatter/)
  })

  it('rejects an id/type mismatch', () => {
    const raw = serializeKnowledgeFile(record()).replace('DEC-000001', 'CON-000001')
    expect(() => parseKnowledgeFile(raw, 'CON-000001.md')).toThrow(/does not match type/)
  })

  it('rejects an empty body', () => {
    const raw = serializeKnowledgeFile(record({ body: '' }))
    expect(() => parseKnowledgeFile(raw, 'DEC-000001.md')).toThrow(/body must not be empty/)
  })
})

function proposal(overrides: Partial<ProposalRecord> = {}): ProposalRecord {
  return {
    id: 'PRO-000003',
    status: 'pending',
    operation: 'create',
    type: 'decision',
    scope: { level: 'global' },
    title: '提案标题',
    summary: '提案摘要',
    tags: [],
    sourceRefs: ['note:test'],
    related: [],
    supersedes: [],
    appliesTo: { branches: [], versions: [] },
    promotedFrom: null,
    target: null,
    expectedVersion: null,
    reason: null,
    validFrom: null,
    expiresAt: null,
    lastVerified: null,
    mergedIds: [],
    taskId: 'TSK-20261101-abc123',
    createdAt: '2026-11-01T09:00:00+08:00',
    updatedAt: '2026-11-01T09:00:00+08:00',
    committedTo: null,
    body: '## 结论\n\n内容\n',
    path: 'C:/hub/pending/PRO-000003.md',
    extra: {},
    ...overrides,
  }
}

describe('proposal frontmatter', () => {
  it('round-trips a proposal', () => {
    const raw = serializeProposalFile(proposal())
    expect(raw).toContain('id: PRO-000003')
    const parsed = parseProposalFile(raw, 'PRO-000003.md')
    expect(parsed.operation).toBe('create')
    expect(parsed.taskId).toBe('TSK-20261101-abc123')
    expect(parsed.body).toContain('内容')
  })

  it('round-trips an update target and expected version', () => {
    const raw = serializeProposalFile(
      proposal({ operation: 'update', target: 'DEC-000001', expectedVersion: 2 }),
    )
    const parsed = parseProposalFile(raw, 'PRO-000003.md')
    expect(parsed.target).toBe('DEC-000001')
    expect(parsed.expectedVersion).toBe(2)
  })
})
