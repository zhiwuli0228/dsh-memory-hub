import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { AgentLike, ToolRunContext } from '../src/host.js'
import type { WritebackAssessment } from '../src/types.js'
import { createHarness } from './helpers.js'

async function ledgerTypes(path: string): Promise<string[]> {
  const raw = await readFile(path, 'utf8')
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => (JSON.parse(line) as { type: string }).type)
}

describe('memory service', () => {
  it('runs an idempotent preflight and exposes the compact pack', async () => {
    const harness = await createHarness()
    try {
      const id = await harness.seed({
        title: '缓存广播使用版本号',
        summary: '广播消息携带单调版本号。',
        body: '## 结论\n\n使用版本号而不是时间戳。\n',
      })
      await harness.service.preflightForTurn(harness.agent, 1, '缓存广播版本号')
      const state = harness.service.stateFor(harness.agent.id)
      expect(state?.status).toBe('ready')
      expect(state?.pack).toContain(id)
      expect(harness.service.packFor(harness.agent.id)).toContain('not user instructions')

      await harness.service.preflightForTurn(harness.agent, 1, '缓存广播版本号')
      const types = await ledgerTypes(harness.hub.ledgerPath())
      expect(types.filter((type) => type === 'task.created')).toHaveLength(1)
    } finally {
      await harness.cleanup()
    }
  })

  it('records no_match and keeps the task unblocked', async () => {
    const harness = await createHarness()
    try {
      await harness.service.preflightForTurn(harness.agent, 1, '完全没有相关知识')
      const state = harness.service.stateFor(harness.agent.id)
      expect(state?.status).toBe('no_match')
      expect(state?.pack).toBe('')
      const decision = await harness.service.gate({
        name: 'bash',
        arguments: {},
        agent: harness.agent,
      } as ToolRunContext)
      expect(decision.kind).toBe('allow')
    } finally {
      await harness.cleanup()
    }
  })

  it('enforces the gate for mutating tools and honors on_preflight_error', async () => {
    const harness = await createHarness()
    try {
      const noState = { ...harness.agent, id: 'session-without-task' } as AgentLike
      harness.hub.config.policy.gate.on_preflight_error = 'deny'
      const denied = await harness.service.gate({
        name: 'bash',
        arguments: {},
        agent: noState,
      } as ToolRunContext)
      expect(denied.kind).toBe('deny')

      const readOnly = await harness.service.gate({
        name: 'memory_search',
        arguments: {},
        agent: noState,
      } as ToolRunContext)
      expect(readOnly.kind).toBe('allow')

      harness.hub.config.policy.gate.on_preflight_error = 'allow'
      const allowed = await harness.service.gate({
        name: 'bash',
        arguments: {},
        agent: noState,
      } as ToolRunContext)
      expect(allowed.kind).toBe('allow')
    } finally {
      await harness.cleanup()
    }
  })

  it('creates a recoverable task from a manual preflight in a fresh session', async () => {
    const harness = await createHarness()
    try {
      const id = await harness.seed({ title: '手动预检目标', summary: '手动预检。', body: '## 结论\n\n手动。\n' })
      const result = await harness.service.manualPreflight(harness.agent, '手动预检目标', false)
      expect(result.taskId).toMatch(/^TSK-/)
      expect(result.status).toBe('ready')
      expect(result.pack).toContain(id)
      expect(harness.service.stateFor(harness.agent.id)?.taskId).toBe(result.taskId)
      const cited = await harness.service.cite(harness.agent, { knowledge_id: id, purpose: 'manual preflight' })
      expect(cited.citationId).toMatch(/^CIT-/)
    } finally {
      await harness.cleanup()
    }
  })

  it('records citations once per task/version', async () => {
    const harness = await createHarness()
    try {
      const id = await harness.seed({ title: '引用目标', summary: '被引用。', body: '## 结论\n\n引用。\n' })
      await harness.service.preflightForTurn(harness.agent, 1, '引用目标')
      const first = await harness.service.cite(harness.agent, { knowledge_id: id, purpose: '选择该方案' })
      const second = await harness.service.cite(harness.agent, { knowledge_id: id, purpose: '再次使用' })
      expect(second.citationId).toBe(first.citationId)
      const types = await ledgerTypes(harness.hub.ledgerPath())
      expect(types.filter((type) => type === 'citation.added')).toHaveLength(1)
    } finally {
      await harness.cleanup()
    }
  })

  it('proposes, closes with an assessment, and auto-defers unclosed tasks', async () => {
    const harness = await createHarness()
    try {
      await harness.service.preflightForTurn(harness.agent, 1, '记录一个决策')
      const proposal = await harness.service.propose(harness.agent, {
        operation: 'create',
        type: 'decision',
        scope: 'global',
        title: '新决策',
        summary: '值得记录。',
        content: '## 结论\n\n记录。\n',
        source_refs: ['note:test'],
      })
      expect(harness.store.getProposal(proposal.proposalId)?.taskId).toBe(
        harness.service.stateFor(harness.agent.id)?.taskId,
      )
      const assessment: WritebackAssessment = { kind: 'proposed', proposalIds: [proposal.proposalId] }
      const closed = await harness.service.closeTask(harness.agent, assessment)
      expect(closed.closed).toBe(true)
      expect(harness.service.stateFor(harness.agent.id)?.closed).toBe(true)

      await harness.service.preflightForTurn(
        { ...harness.agent, id: 'session-deferred' } as AgentLike,
        1,
        '未关闭的任务',
      )
      await harness.service.closeDeferred('session-deferred', 1)
      const types = await ledgerTypes(harness.hub.ledgerPath())
      expect(types.some((type) => type === 'task.closed')).toBe(true)
    } finally {
      await harness.cleanup()
    }
  })

  it('limits project knowledge to its registered workspace', async () => {
    const harness = await createHarness()
    try {
      harness.hub.config.workspaces.push({
        id: 'backend',
        root: harness.root,
        domains: [],
        admin: false,
        enabled: true,
      })
      const id = await harness.seed({
        scope: 'project:backend',
        title: '项目内决策',
        summary: '只在 backend 可见。',
        body: '## 结论\n\n项目内。\n',
      })

      harness.setDirectory(harness.root)
      await harness.service.preflightForTurn(harness.agent, 1, '项目内决策')
      expect(harness.service.packFor(harness.agent.id)).toContain(id)

      const outside = { ...harness.agent, id: 'session-outside' } as AgentLike
      harness.setDirectory(tmpdir())
      await harness.service.preflightForTurn(outside, 1, '项目内决策')
      expect(harness.service.packFor('session-outside')).not.toContain(id)
    } finally {
      await harness.cleanup()
    }
  })

  it('blocks committing a proposal that fails the evidence precheck', async () => {
    const harness = await createHarness()
    try {
      const proposal = await harness.store.propose(
        {
          operation: 'create',
          type: 'decision',
          scope: 'global',
          title: '缺证据',
          summary: '不应提交。',
          content: '## 结论\n\n缺证据。\n',
          sourceRefs: [],
        },
        { taskId: 'TSK-1' },
      )
      const precheck = harness.service.precheckProposal(proposal.id)
      expect(precheck.ok).toBe(false)
      if (!precheck.ok) expect(precheck.reason).toContain('source_ref')
    } finally {
      await harness.cleanup()
    }
  })
})
