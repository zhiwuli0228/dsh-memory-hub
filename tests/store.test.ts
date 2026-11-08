import { readFile, stat, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { MemoryError } from '../src/errors.js'
import { createHarness } from './helpers.js'

describe('knowledge store', () => {
  it('creates a pending proposal and commits it as accepted knowledge', async () => {
    const harness = await createHarness()
    try {
      const proposal = await harness.store.propose(
        {
          operation: 'create',
          type: 'decision',
          scope: 'global',
          title: '使用版本号广播',
          summary: '广播消息使用单调版本号。',
          content: '## 结论\n\n使用版本号。\n',
          sourceRefs: ['note:test'],
        },
        { taskId: 'TSK-1' },
      )
      expect(proposal.id).toMatch(/^PRO-\d{6}$/)
      expect(await stat(harness.hub.pendingPath(proposal.id))).toBeTruthy()

      const { record } = await harness.store.commit(proposal.id)
      expect(record.id).toMatch(/^DEC-\d{6}$/)
      expect(record.status).toBe('accepted')
      expect(record.version).toBe(1)
      expect(await stat(harness.hub.knowledgePath('decision', record.id))).toBeTruthy()
      expect(harness.store.getProposal(proposal.id)?.status).toBe('committed')
      expect(await stat(harness.hub.pendingArchivePath(proposal.id))).toBeTruthy()

      const ledger = await readFile(harness.hub.ledgerPath(), 'utf8')
      expect(ledger).toContain('"type":"proposal.committed"')
    } finally {
      await harness.cleanup()
    }
  })

  it('ignores directory paths during refresh', async () => {
    const harness = await createHarness()
    try {
      await harness.store.refreshPath(harness.hub.knowledgeDir('api-catalog'))
      await harness.store.refreshPath(harness.hub.pendingArchiveDir())
      expect(harness.store.diagnostics).toHaveLength(0)
    } finally {
      await harness.cleanup()
    }
  })

  it('increments versions, archives the old file, and rejects stale expected versions', async () => {
    const harness = await createHarness()
    try {
      const id = await harness.seed({ title: '初始决策', summary: '第一版。', body: '## 结论\n\n第一版。\n' })
      const update = await harness.store.propose(
        {
          operation: 'update',
          type: 'decision',
          scope: 'global',
          title: '更新后的决策',
          summary: '第二版。',
          content: '## 结论\n\n第二版。\n',
          sourceRefs: ['note:update'],
          target: id,
          expectedVersion: 1,
        },
        { taskId: 'TSK-1' },
      )
      const { record } = await harness.store.commit(update.id)
      expect(record.version).toBe(2)
      expect(await stat(harness.hub.historyPath('decision', id, 1))).toBeTruthy()

      const historical = await harness.store.get(id, 1)
      expect(historical?.version).toBe(1)
      expect(historical?.body).toContain('第一版')

      await expect(
        harness.store.propose(
          {
            operation: 'update',
            type: 'decision',
            scope: 'global',
            title: '过期更新',
            summary: '基于旧版本。',
            content: '## 结论\n\n过期。\n',
            sourceRefs: ['note:stale'],
            target: id,
            expectedVersion: 1,
          },
          { taskId: 'TSK-1' },
        ),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    } finally {
      await harness.cleanup()
    }
  })

  it('supersedes an accepted entry in the same commit', async () => {
    const harness = await createHarness()
    try {
      const oldId = await harness.seed({ title: '旧决策', summary: '旧。', body: '## 结论\n\n旧。\n' })
      const proposal = await harness.store.propose(
        {
          operation: 'create',
          type: 'decision',
          scope: 'global',
          title: '新决策',
          summary: '新。',
          content: '## 结论\n\n新。\n',
          sourceRefs: ['note:new'],
          supersedes: [oldId],
        },
        { taskId: 'TSK-1' },
      )
      const { record, superseded } = await harness.store.commit(proposal.id)
      expect(superseded).toEqual([oldId])
      const old = harness.store.docs.get(oldId)
      expect(old?.status).toBe('superseded')
      expect(old?.version).toBe(2)
      expect(record.supersedes).toEqual([oldId])
    } finally {
      await harness.cleanup()
    }
  })

  it('deprecates an entry without deleting its body', async () => {
    const harness = await createHarness()
    try {
      const id = await harness.seed({ title: '将废弃', summary: '废弃。', body: '## 结论\n\n保留正文。\n' })
      const proposal = await harness.store.propose(
        {
          operation: 'deprecate',
          type: 'decision',
          scope: 'global',
          title: '将废弃',
          summary: '废弃。',
          target: id,
          expectedVersion: 1,
          reason: '被新的方案取代',
        },
        { taskId: 'TSK-1' },
      )
      await harness.store.commit(proposal.id)
      const record = harness.store.docs.get(id)
      expect(record?.status).toBe('deprecated')
      expect(record?.body).toContain('保留正文')
      expect(record?.deprecatedReason).toBe('被新的方案取代')
    } finally {
      await harness.cleanup()
    }
  })

  it('requires evidence for configured types at commit time', async () => {
    const harness = await createHarness()
    try {
      const proposal = await harness.store.propose(
        {
          operation: 'create',
          type: 'decision',
          scope: 'global',
          title: '没有证据',
          summary: '不应提交。',
          content: '## 结论\n\n没有证据。\n',
          sourceRefs: [],
        },
        { taskId: 'TSK-1' },
      )
      await expect(harness.store.commit(proposal.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    } finally {
      await harness.cleanup()
    }
  })

  it('consolidates project knowledge idempotently', async () => {
    const harness = await createHarness()
    try {
      harness.hub.config.workspaces.push({
        id: 'backend',
        root: harness.root,
        domains: [],
        admin: true,
        enabled: true,
      })
      await harness.seed({
        type: 'decision',
        scope: 'project:backend',
        title: '项目决策',
        summary: '只属于 backend。',
        body: '## 结论\n\n项目决策。\n',
      })
      const dry = await harness.store.consolidate({
        targetScope: 'global',
        workspaceIds: ['backend'],
        dryRun: true,
      })
      expect(dry.created).toHaveLength(1)
      expect(harness.store.pendingForTask('TSK-consolidation')).toHaveLength(0)

      const first = await harness.store.consolidate({
        targetScope: 'global',
        workspaceIds: ['backend'],
        dryRun: false,
      })
      expect(first.created).toHaveLength(1)
      expect(first.created[0]?.promotedFrom).toMatch(/^project:backend\/DEC-\d{6}@1$/)

      const second = await harness.store.consolidate({
        targetScope: 'global',
        workspaceIds: ['backend'],
        dryRun: false,
      })
      expect(second.created).toHaveLength(0)
      expect(second.skipped).toBeGreaterThanOrEqual(1)
    } finally {
      await harness.cleanup()
    }
  })

  it('persists temporal fields and fills last_verified on commit', async () => {
    const harness = await createHarness()
    try {
      const proposal = await harness.store.propose(
        {
          operation: 'create',
          type: 'knowledge',
          scope: 'global',
          title: '发布窗口',
          summary: '1.4 计划在 2026-12-01 发布。',
          content: '## 结论\n\n发布日期为 2026-12-01。\n',
          validFrom: '2026-11-20T00:00:00Z',
          expiresAt: '2026-12-31T00:00:00Z',
        },
        { taskId: 'TSK-1' },
      )
      const beforeCommit = harness.store.getProposal(proposal.id)
      expect(beforeCommit?.validFrom).toBe('2026-11-20T00:00:00Z')
      expect(beforeCommit?.expiresAt).toBe('2026-12-31T00:00:00Z')
      expect(beforeCommit?.lastVerified).toBeNull()

      const { record } = await harness.store.commit(proposal.id)
      expect(record.validFrom).toBe('2026-11-20T00:00:00Z')
      expect(record.expiresAt).toBe('2026-12-31T00:00:00Z')
      expect(record.lastVerified).not.toBeNull()

      const reloaded = await harness.store.get(record.id)
      expect(reloaded?.validFrom).toBe('2026-11-20T00:00:00Z')
      expect(reloaded?.expiresAt).toBe('2026-12-31T00:00:00Z')
    } finally {
      await harness.cleanup()
    }
  })

  it('keeps expires_at across an update that does not restate it', async () => {
    const harness = await createHarness()
    try {
      const id = await harness.seed({ title: '临时绕行', summary: '绕行方案。', body: '## 结论\n\n绕行。\n' })
      const seeded = harness.store.docs.get(id)
      expect(seeded).toBeDefined()
      const update = await harness.store.propose(
        {
          operation: 'update',
          type: 'decision',
          scope: 'global',
          title: '临时绕行（已修订）',
          summary: '绕行方案修订。',
          content: '## 结论\n\n绕行修订。\n',
          sourceRefs: ['note:update'],
          target: id,
          expectedVersion: 1,
          expiresAt: '2027-01-01T00:00:00Z',
        },
        { taskId: 'TSK-1' },
      )
      const { record } = await harness.store.commit(update.id)
      expect(record.expiresAt).toBe('2027-01-01T00:00:00Z')
      expect(record.lastVerified).not.toBeNull()
    } finally {
      await harness.cleanup()
    }
  })

  it('rejects invalid temporal combinations before writing a proposal', async () => {
    const harness = await createHarness()
    try {
      const base = {
        operation: 'create' as const,
        type: 'knowledge' as const,
        scope: 'global',
        title: '时间非法',
        summary: '时间字段非法。',
        content: '## 结论\n\n非法。\n',
      }
      await expect(
        harness.store.propose({ ...base, validFrom: '2026-12-01T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z' }, { taskId: 'TSK-1' }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(
        harness.store.propose({ ...base, expiresAt: '2026-11-01' }, { taskId: 'TSK-1' }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(
        harness.store.propose({ ...base, lastVerified: '2099-01-01T00:00:00Z' }, { taskId: 'TSK-1' }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      expect(harness.store.proposals.size).toBe(0)
    } finally {
      await harness.cleanup()
    }
  })

  it('rejects writes in read-only mode', async () => {
    const harness = await createHarness()
    try {
      harness.hub.readOnly = true
      await expect(
        harness.store.propose(
          {
            operation: 'create',
            type: 'knowledge',
            scope: 'global',
            title: '只读',
            summary: '只读。',
            content: '正文',
          },
          { taskId: 'TSK-1' },
        ),
      ).rejects.toBeInstanceOf(MemoryError)
    } finally {
      await harness.cleanup()
    }
  })

  it('skips knowledge written by a newer format version and explains why', async () => {
    const harness = await createHarness()
    try {
      const proposal = await harness.store.propose(
        {
          operation: 'create',
          type: 'knowledge',
          scope: 'global',
          title: '未来格式',
          summary: '由更新版本写入。',
          content: '## 结论\n\n旧版本不应猜着读。\n',
        },
        { taskId: 'TSK-1' },
      )
      const { record } = await harness.store.commit(proposal.id)
      const path = harness.hub.knowledgePath('knowledge', record.id)
      const raw = await readFile(path, 'utf8')
      await writeFile(path, raw.replace(/^format: 1$/m, 'format: 2'))

      await harness.store.load()
      expect(harness.store.docs.has(record.id)).toBe(false)
      expect(
        harness.store.diagnostics.some((item) => item.message.includes('newer than this version supports')),
      ).toBe(true)
    } finally {
      await harness.cleanup()
    }
  })
})
