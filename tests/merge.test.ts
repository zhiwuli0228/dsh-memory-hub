import { readFile, stat } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createHarness, type Harness } from './helpers.js'

async function proposeMerge(
  harness: Harness,
  target: string,
  merged: string[],
  overrides: Partial<{ scope: string; type: 'decision' | 'knowledge'; content: string; expectedVersion: number }> = {},
): Promise<string> {
  const targetRecord = harness.store.docs.get(target)!
  const proposal = await harness.store.propose(
    {
      operation: 'merge',
      type: overrides.type ?? targetRecord.type,
      scope: overrides.scope ?? 'global',
      title: targetRecord.title,
      summary: targetRecord.summary,
      content: overrides.content ?? '## 结论\n\n合并后的结论。\n',
      sourceRefs: ['note:merge'],
      target,
      expectedVersion: overrides.expectedVersion ?? targetRecord.version,
      mergedIds: merged,
    },
    { taskId: 'TSK-merge' },
  )
  return proposal.id
}

describe('merge proposals', () => {
  it('folds entries into the target and leaves superseded pointers, history and a ledger event', async () => {
    const harness = await createHarness()
    try {
      const first = await harness.seed({
        title: '广播使用版本号',
        summary: '广播消息带版本号。',
        sourceRefs: ['note:first'],
        body: '## 结论\n\n广播带版本号。\n',
      })
      const second = await harness.seed({
        title: '广播版本号续篇',
        summary: '接收方丢弃旧消息。',
        sourceRefs: ['note:second'],
        body: '## 结论\n\n接收方丢弃旧消息。\n',
      })
      const third = await harness.seed({ title: '面板配色', summary: '深色主题。', body: '## 结论\n\n深色。\n' })

      const proposalId = await proposeMerge(harness, first, [second], {
        content: '## 结论\n\n广播消息带单调版本号，接收方丢弃旧消息。\n',
      })
      const { record, superseded } = await harness.store.commit(proposalId)

      expect(record.id).toBe(first)
      expect(record.version).toBe(2)
      expect(record.body).toContain('接收方丢弃旧消息')
      expect(record.related).toContain(second)
      expect(record.sourceRefs).toEqual(expect.arrayContaining(['note:first', 'note:second', 'note:merge']))
      expect(superseded).toEqual([second])

      const merged = harness.store.docs.get(second)!
      expect(merged.status).toBe('superseded')
      expect(merged.supersededBy).toBe(first)
      expect(merged.version).toBe(2)
      expect(harness.store.docs.get(third)?.status).toBe('accepted')

      expect(await stat(harness.hub.historyPath('decision', first, 1))).toBeTruthy()
      expect(await stat(harness.hub.historyPath('decision', second, 1))).toBeTruthy()

      const ledger = await readFile(harness.hub.ledgerPath(), 'utf8')
      expect(ledger).toContain('"type":"knowledge.merged"')
      expect(ledger).toContain(`"target":"${first}"`)
      expect(ledger).toContain(`"merged":["${second}"]`)

      const file = await readFile(harness.hub.knowledgePath('decision', second), 'utf8')
      expect(file).toContain(`superseded_by: ${first}`)
    } finally {
      await harness.cleanup()
    }
  })

  it('hides merged entries from default search but keeps them reachable by status', async () => {
    const harness = await createHarness()
    try {
      const first = await harness.seed({ title: '版本号广播规范', summary: '广播带版本号。', body: '## 结论\n\n广播带版本号。\n' })
      const second = await harness.seed({
        title: '版本号广播规范续',
        summary: '广播带版本号，接收方丢弃旧消息。',
        body: '## 结论\n\n广播带版本号，接收方丢弃旧消息。\n',
      })
      const proposalId = await proposeMerge(harness, first, [second])
      await harness.store.commit(proposalId)

      const hits = await harness.service.search(harness.agent, { query: '版本号广播规范' })
      expect(hits.hits.some((hit) => hit.id === second)).toBe(false)
      const withSuperseded = await harness.service.search(harness.agent, {
        query: '版本号广播规范续',
        statuses: ['superseded'],
      })
      expect(withSuperseded.hits.some((hit) => hit.id === second)).toBe(true)
    } finally {
      await harness.cleanup()
    }
  })

  it('exposes merged ids and a line diff in the pending panel view', async () => {
    const harness = await createHarness()
    try {
      const first = await harness.seed({ title: '版本号广播规范', summary: '广播带版本号。', body: '## 结论\n\n旧正文。\n' })
      const second = await harness.seed({ title: '版本号广播规范续', summary: '接收方丢弃旧消息。', body: '## 结论\n\n续篇。\n' })
      await proposeMerge(harness, first, [second], {
        content: '## 结论\n\n新正文。\n\n## 依据\n\n来源。\n',
      })
      const overview = harness.service.overview() as {
        pending: Array<{
          operation: string
          merged?: Array<{ id: string; title: string }>
          diff?: Array<{ kind: 'context' | 'add' | 'del'; text: string }>
          diffTruncated?: boolean
        }>
      }
      const pending = overview.pending.find((item) => item.operation === 'merge')!
      expect(pending.merged).toHaveLength(1)
      expect(pending.merged![0]!.id).toBe(second)
      expect(pending.diff?.some((line) => line.kind === 'del' && line.text === '旧正文。')).toBe(true)
      expect(pending.diff?.some((line) => line.kind === 'add' && line.text === '新正文。')).toBe(true)
      expect(pending.diffTruncated).toBe(false)
    } finally {
      await harness.cleanup()
    }
  })

  it('rejects invalid merge targets and merged ids', async () => {
    const harness = await createHarness()
    try {
      const first = await harness.seed({ title: '版本号广播规范', summary: '广播带版本号。', body: '## 结论\n\n正文。\n' })
      const second = await harness.seed({ title: '版本号广播规范续', summary: '续篇。', body: '## 结论\n\n续篇。\n' })
      const otherType = await harness.seed({ type: 'knowledge', title: '知识条目', summary: '知识。', body: '## 结论\n\n知识。\n' })

      await expect(proposeMerge(harness, first, [first])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(proposeMerge(harness, first, [second, second])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(proposeMerge(harness, first, ['DEC-999999'])).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(proposeMerge(harness, first, [otherType])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(proposeMerge(harness, first, [second], { scope: 'domain:other' })).rejects.toMatchObject({
        code: 'SCOPE_FORBIDDEN',
      })
      await expect(proposeMerge(harness, first, [second], { expectedVersion: 99 })).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
      })

      // merged_ids 只允许出现在 merge 操作里。
      await expect(
        harness.store.propose(
          {
            operation: 'create',
            type: 'decision',
            scope: 'global',
            title: '错误用法',
            summary: '带 merged_ids 的 create。',
            content: '## 结论\n\n错误。\n',
            sourceRefs: ['note:bad'],
            mergedIds: [second],
          },
          { taskId: 'TSK-merge' },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })

      // 已被合并过的条目不能再次合并。
      const proposalId = await proposeMerge(harness, first, [second])
      await harness.store.commit(proposalId)
      const third = await harness.seed({ title: '版本号广播规范三', summary: '三。', body: '## 结论\n\n三。\n' })
      await expect(proposeMerge(harness, third, [second])).rejects.toMatchObject({ code: 'INVALID_STATE' })
    } finally {
      await harness.cleanup()
    }
  })

  it('requires evidence for merge proposals of evidence-required types', async () => {
    const harness = await createHarness()
    try {
      const first = await harness.seed({ title: '版本号广播规范', summary: '广播带版本号。', body: '## 结论\n\n正文。\n' })
      const second = await harness.seed({ title: '版本号广播规范续', summary: '续篇。', body: '## 结论\n\n续篇。\n' })
      const proposal = await harness.store.propose(
        {
          operation: 'merge',
          type: 'decision',
          scope: 'global',
          title: '合并稿',
          summary: '合并。',
          content: '## 结论\n\n合并。\n',
          sourceRefs: [],
          target: first,
          expectedVersion: 1,
          mergedIds: [second],
        },
        { taskId: 'TSK-merge' },
      )
      await expect(harness.store.commit(proposal.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    } finally {
      await harness.cleanup()
    }
  })
})
