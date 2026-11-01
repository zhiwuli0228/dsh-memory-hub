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

  it('rejects non-admin maintenance', async () => {
    const harness = await harnessWithCore()
    await expect(
      harness.service.maintenance({ admin: false, coreId: 'core', apply: 'report' }),
    ).rejects.toMatchObject({ code: 'SCOPE_FORBIDDEN' })
  })
})
