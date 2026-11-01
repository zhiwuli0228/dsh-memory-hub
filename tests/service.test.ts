import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  it('honors the preflight min_score and directive footer', async () => {
    const harness = await createHarness()
    try {
      await harness.seed({
        title: '缓存广播使用版本号',
        summary: '广播消息携带单调版本号。',
        body: '## 结论\n\n使用版本号而不是时间戳。\n',
      })
      harness.hub.config.policy.preflight.min_score = 1_000_000
      await harness.service.preflightForTurn(harness.agent, 1, '缓存广播版本号')
      expect(harness.service.stateFor(harness.agent.id)?.status).toBe('no_match')
      expect(harness.service.packFor(harness.agent.id)).toBe('')

      harness.hub.config.policy.preflight.min_score = 0
      await harness.service.preflightForTurn(harness.agent, 2, '缓存广播版本号')
      const pack = harness.service.packFor(harness.agent.id)
      expect(pack).toContain('memory_get')
      expect(pack).toContain('memory_close_task')
      expect(pack).toContain('memory-management skill')
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

      const other = await harness.seed({ title: '独有目标', summary: '另一个主题。', body: '## 结论\n\n另一个。\n' })
      const forced = await harness.service.manualPreflight(harness.agent, '独有目标', true)
      expect(forced.hits.map((hit) => hit.id)).toContain(other)
      const overview = harness.service.overview() as {
        tasks: Array<{ taskId: string; preflight: { hits: Array<{ id: string; version: number }> } | null }>
      }
      const task = overview.tasks.find((entry) => entry.taskId === result.taskId)
      expect(task?.preflight?.hits).toEqual(forced.hits)

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

  it('exposes and updates core workspace configuration', async () => {
    const harness = await createHarness()
    try {
      const before = harness.service.config()
      expect(before.core_workspaces).toEqual([])
      expect(before.workspaces).toEqual([])

      const after = await harness.service.updateConfig({
        core_workspaces: [{ id: 'core1', name: 'Core One' }],
        workspaces: [
          { id: 'sub1', core_id: 'core1', root: '/tmp/sub1', domains: ['a'], admin: true, enabled: true },
        ],
      }) as { core_workspaces: { id: string }[]; workspaces: { core_id: string }[] }
      expect(after.core_workspaces).toHaveLength(1)
      expect(after.core_workspaces[0]!.id).toBe('core1')
      expect(after.workspaces).toHaveLength(1)
      expect(after.workspaces[0]!.core_id).toBe('core1')

      expect(harness.hub.config.core_workspaces[0]!.id).toBe('core1')
      expect(harness.hub.config.workspaces[0]!.id).toBe('sub1')
    } finally {
      await harness.cleanup()
    }
  })

  it('preserves untouched config sections when updating only one', async () => {
    const harness = await createHarness()
    try {
      await harness.service.updateConfig({ core_workspaces: [{ id: 'core1', name: 'Core One' }] })
      await harness.service.updateConfig({
        workspaces: [{ id: 'sub1', core_id: 'core1', root: '/tmp/sub1', domains: [], admin: false, enabled: true }],
      })
      const after = (await harness.service.updateConfig({
        core_workspaces: [{ id: 'core1', name: 'Core One' }, { id: 'core2', name: 'Core Two' }],
      })) as { core_workspaces: { id: string }[]; workspaces: { id: string }[] }
      expect(after.core_workspaces.map((core) => core.id)).toEqual(['core1', 'core2'])
      expect(after.workspaces.map((workspace) => workspace.id)).toEqual(['sub1'])
    } finally {
      await harness.cleanup()
    }
  })

  it('commits with test:auto when approval mode is auto', async () => {
    const harness = await createHarness()
    try {
      harness.hub.config.policy.approval.mode = 'auto'
      expect(harness.service.approvalMode()).toBe('auto')
      await harness.service.preflightForTurn(harness.agent, 1, '测试自动提交')
      const proposal = await harness.service.propose(harness.agent, {
        operation: 'create',
        type: 'decision',
        scope: 'global',
        title: '测试模式决策',
        summary: '测试期间自动提交。',
        content: '## 结论\n\n测试。\n',
        source_refs: ['note:test'],
      })
      await harness.service.commit(harness.agent, proposal.proposalId)
      const raw = await readFile(harness.hub.ledgerPath(), 'utf8')
      const committed = raw
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as { type: string; approvalRef?: string })
        .find((event) => event.type === 'proposal.committed')
      expect(committed?.approvalRef).toBe('test:auto')
      expect(harness.store.counts().knowledge).toBe(1)
    } finally {
      await harness.cleanup()
    }
  })

  it('promotes sub-workspace knowledge to the core scope with scope=core', async () => {
    const coreRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-core-'))
    const subRoot = join(coreRoot, 'plugin-a')
    const harness = await createHarness([
      { id: 'plugin-dev', root: coreRoot, domains: [], admin: false, enabled: true },
      { id: 'plugin-a', root: subRoot, domains: [], admin: false, enabled: true, core_id: 'plugin-dev' },
    ])
    try {
      harness.setDirectory(subRoot)
      await harness.service.preflightForTurn(harness.agent, 1, '回填核心')
      const proposal = await harness.service.propose(harness.agent, {
        operation: 'create',
        type: 'constraint',
        scope: 'core',
        title: '插件坑：核心仓共享',
        summary: '所有插件工作区都应看到的坑。',
        content: '## 结论\n\n避免重复踩坑。\n',
        source_refs: ['note:test'],
      })
      const stored = harness.store.getProposal(proposal.proposalId)
      expect(stored?.scope).toEqual({ level: 'project', workspaceId: 'plugin-dev' })
      await harness.service.commit(harness.agent, proposal.proposalId)

      harness.setDirectory(coreRoot)
      const coreAgent = { ...harness.agent, id: 'session-core' } as AgentLike
      await harness.service.preflightForTurn(coreAgent, 1, '插件坑')
      expect(harness.service.stateFor(coreAgent.id)?.pack).toContain('插件坑')
    } finally {
      await harness.cleanup()
    }
  })

  it('lets sub-workspaces see core workspace scoped knowledge', async () => {
    const coreRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-core-'))
    const subRoot = join(coreRoot, 'frontend')
    const harness = await createHarness([
      { id: 'product', root: coreRoot, domains: [], admin: false, enabled: true },
      { id: 'frontend', root: subRoot, domains: [], admin: false, enabled: true, core_id: 'product' },
    ])
    try {
      await harness.seed({
        title: '核心仓决策',
        summary: '属于 product 核心仓的知识',
        scope: 'project:product',
      })
      await harness.seed({
        title: '子仓决策',
        summary: '属于 frontend 子仓的知识',
        scope: 'project:frontend',
      })
      const config = harness.service.config() as { workspaces: { id: string }[] }
      expect(config.workspaces.map((workspace) => workspace.id)).toEqual(['product', 'frontend'])

      harness.setDirectory(subRoot)
      await harness.service.preflightForTurn(harness.agent, 1, '核心仓决策')
      const state = harness.service.stateFor(harness.agent.id)
      expect(state?.pack).toContain('核心仓决策')
    } finally {
      await harness.cleanup()
    }
  })
})
