import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHarness, type Harness } from './helpers.js'

const cleanups: Array<() => Promise<void>> = []

async function harnessWithCore(): Promise<Harness> {
  const coreRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-core-'))
  const subRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-sub-'))
  const harness = await createHarness([
    { id: 'core', root: coreRoot, domains: [], admin: false, enabled: true },
    { id: 'sub', root: subRoot, core_id: 'core', domains: [], admin: true, enabled: true },
  ])
  harness.setDirectory(subRoot)
  cleanups.push(async () => {
    await harness.cleanup()
    await rm(coreRoot, { recursive: true, force: true })
    await rm(subRoot, { recursive: true, force: true })
  })
  return harness
}

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.()
  }
})

describe('memory maintenance', () => {
  it('creates a deprecate proposal for an exact duplicate without committing', async () => {
    const harness = await harnessWithCore()
    const first = await harness.seed({
      scope: 'project:sub',
      title: '重复决策',
      summary: '完全相同的摘要。',
      body: '## 结论\n完全相同的正文。\n',
    })
    const second = await harness.seed({
      scope: 'project:sub',
      title: '重复决策',
      summary: '完全相同的摘要。',
      body: '## 结论\n完全相同的正文。\n',
    })

    const result = await harness.service.maintenance({
      admin: true,
      coreId: 'core',
      apply: 'propose',
    })

    expect(result.errors).toEqual([])
    expect(result.created).toHaveLength(1)
    expect(result.created[0]?.operation).toBe('deprecate')
    expect([first, second]).toContain(result.created[0]?.target)
    expect(harness.store.docs.get(first)?.status).toBe('accepted')
    expect(harness.store.docs.get(second)?.status).toBe('accepted')
    expect([...harness.store.proposals.values()].filter((proposal) => proposal.status === 'pending')).toHaveLength(1)
    expect(result.reportPath).not.toBeNull()
    const report = await readFile(result.reportPath!, 'utf8')
    expect(report).toContain('duplicate-exact')
    expect(report).toContain('nothing was committed')
  })

  it('does not duplicate the same maintenance proposal on a second run', async () => {
    const harness = await harnessWithCore()
    await harness.seed({
      scope: 'project:sub',
      title: '重复决策',
      summary: '完全相同的摘要。',
      body: '## 结论\n完全相同的正文。\n',
    })
    await harness.seed({
      scope: 'project:sub',
      title: '重复决策',
      summary: '完全相同的摘要。',
      body: '## 结论\n完全相同的正文。\n',
    })

    const first = await harness.service.maintenance({ admin: true, coreId: 'core', apply: 'propose' })
    const second = await harness.service.maintenance({ admin: true, coreId: 'core', apply: 'propose' })

    expect(first.created).toHaveLength(1)
    expect(second.created).toHaveLength(0)
    expect(second.skipped).toBe(1)
    expect([...harness.store.proposals.values()].filter((proposal) => proposal.status === 'pending')).toHaveLength(1)
  })

  it('promotes only explicitly reusable project knowledge', async () => {
    const harness = await harnessWithCore()
    await harness.seed({
      scope: 'project:sub',
      title: '可复用的发布检查',
      summary: '适用于同核心仓其他插件。',
      body: '## 步骤\n先跑 npm run check。\n',
      tags: ['reusable'],
    })

    const result = await harness.service.maintenance({
      admin: true,
      coreId: 'core',
      apply: 'propose',
    })

    expect(result.created).toHaveLength(1)
    expect(result.created[0]).toMatchObject({
      operation: 'create',
      scope: 'project:core',
    })
    const proposal = [...harness.store.proposals.values()].find((entry) => entry.id === result.created[0]!.id)
    expect(proposal?.promotedFrom).toBe('project:sub/DEC-000001@1')
  })

  it('report mode writes a report without creating proposals', async () => {
    const harness = await harnessWithCore()
    await harness.seed({
      scope: 'project:sub',
      title: '重复决策',
      summary: '完全相同的摘要。',
      body: '## 结论\n完全相同的正文。\n',
    })
    await harness.seed({
      scope: 'project:sub',
      title: '重复决策',
      summary: '完全相同的摘要。',
      body: '## 结论\n完全相同的正文。\n',
    })

    const result = await harness.service.maintenance({
      admin: true,
      coreId: 'core',
      apply: 'report',
    })

    expect(result.created).toHaveLength(0)
    expect([...harness.store.proposals.values()].filter((proposal) => proposal.status === 'pending')).toHaveLength(0)
    expect(result.issues.some((issue) => issue.code === 'duplicate-exact')).toBe(true)
    expect(result.reportPath).not.toBeNull()
  })

  it('uses the most recent citation as freshness for aging and uncited checks', async () => {
    const harness = await harnessWithCore()
    const old = await harness.store.propose(
      {
        operation: 'create',
        type: 'decision',
        scope: 'project:sub',
        title: '旧决策',
        summary: '很久没有确认。',
        content: '## 结论\n仍然有效，但需要复核。\n',
        sourceRefs: ['note:test fixture'],
        lastVerified: '2020-01-01T00:00:00.000Z',
      },
      { taskId: 'TSK-bitrot' },
    )
    const { record } = await harness.store.commit(old.id)
    const never = await harness.seed({ scope: 'project:sub', title: '从未引用', summary: '无人使用。' })

    const before = await harness.service.maintenance({ admin: true, coreId: 'core', apply: 'report' })
    expect(before.issues.some((issue) => issue.code === 'aging' && issue.ids.includes(record.id))).toBe(true)
    expect(before.totals.cited).toBe(0)

    await harness.service.preflightForTurn(harness.agent, 1, '旧决策')
    await harness.service.cite(harness.agent, { knowledge_id: record.id, purpose: '复用了旧决策' })

    const after = await harness.service.maintenance({ admin: true, coreId: 'core', apply: 'report' })
    expect(after.totals.cited).toBe(1)
    expect(after.issues.some((issue) => issue.code === 'aging' && issue.ids.includes(record.id))).toBe(false)

    // 把「现在」推后 200 天：两条都会进入未引用报告，但依据不同。
    const later = await harness.service.maintenance({
      admin: true,
      coreId: 'core',
      apply: 'report',
      staleCitationDays: 30,
      now: new Date(Date.now() + 200 * 86_400_000),
    })
    const uncited = later.issues.filter((issue) => issue.code === 'uncited').map((issue) => issue.message)
    expect(uncited.some((message) => message.includes(record.id) && message.includes('最近引用'))).toBe(true)
    expect(uncited.some((message) => message.includes(never) && message.includes('从未被引用'))).toBe(true)
  })

  it('rejects non-admin maintenance', async () => {
    const harness = await harnessWithCore()
    await expect(
      harness.service.maintenance({ admin: false, coreId: 'core', apply: 'report' }),
    ).rejects.toMatchObject({ code: 'SCOPE_FORBIDDEN' })
  })
})
