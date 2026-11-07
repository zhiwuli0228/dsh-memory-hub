import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Hub } from '../src/hub.js'
import type { AgentLike, Context, ToolRunContext } from '../src/host.js'
import { Ledger } from '../src/ledger.js'
import { MemoryService } from '../src/service.js'
import { KnowledgeStore } from '../src/store.js'
import type { KnowledgeType, WritebackAssessment } from '../src/types.js'
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
      expect(pack).toContain('memory-hub skill')
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

  it('updateConfig replaces the whole list so removing sub-workspaces takes effect', async () => {
    const harness = await createHarness()
    try {
      await harness.service.updateConfig({
        core_workspaces: [
          { id: 'core1', name: 'Core One' },
          { id: 'core2', name: 'Core Two' },
        ],
        workspaces: [
          { id: 'sub1', core_id: 'core1', root: '/tmp/sub1', domains: [], admin: false, enabled: true },
          { id: 'sub2', core_id: 'core1', root: '/tmp/sub2', domains: [], admin: false, enabled: true },
        ],
      })

      // 仍有子工作区引用 core1 时直接删它 → 校验拒绝（面板因此先解绑再删）。
      await expect(
        harness.service.updateConfig({ core_workspaces: [{ id: 'core2', name: 'Core Two' }] }),
      ).rejects.toThrow(/references unknown core/)

      // 面板“删除子工作区”：提交去掉该项后的完整列表，后端整表替换。
      const afterSub = (await harness.service.updateConfig({
        workspaces: [{ id: 'sub2', core_id: 'core1', root: '/tmp/sub2', domains: [], admin: false, enabled: true }],
      })) as { workspaces: { id: string }[] }
      expect(afterSub.workspaces.map((workspace) => workspace.id)).toEqual(['sub2'])
      expect(harness.hub.config.workspaces.map((workspace) => workspace.id)).toEqual(['sub2'])

      // 面板“删除核心工作区”：引用它的子工作区解绑为未分配，核心本身移除。
      const afterCore = (await harness.service.updateConfig({
        core_workspaces: [{ id: 'core2', name: 'Core Two' }],
        workspaces: [{ id: 'sub2', core_id: null, root: '/tmp/sub2', domains: [], admin: false, enabled: true }],
      })) as { core_workspaces: { id: string }[]; workspaces: { core_id: string | null }[] }
      expect(afterCore.core_workspaces.map((core) => core.id)).toEqual(['core2'])
      expect(afterCore.workspaces[0]!.core_id).toBeNull()
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

  it('keeps config editing available when another writer holds the lock', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-lock-cfg-'))
    const owner = await Hub.open({ root })
    const degraded = await Hub.open({ root })
    const harness = await createHarness(undefined, { root, hub: degraded })
    try {
      expect(degraded.readOnly).toBe(true)
      expect(degraded.readOnlySource).toBe('lock')

      const before = harness.service.config() as { readOnly: boolean; configWritable: boolean }
      expect(before.readOnly).toBe(true)
      expect(before.configWritable).toBe(true)

      const updated = (await harness.service.updateConfig({
        core_workspaces: [{ id: 'app', name: 'App', root: join(root, 'app') }],
      })) as { configWritable: boolean; core_workspaces: Array<{ id: string }> }
      expect(updated.configWritable).toBe(true)
      expect(updated.core_workspaces.map((core) => core.id)).toContain('app')
      expect(await readFile(join(root, 'config.yaml'), 'utf8')).toContain('app')
    } finally {
      await harness.cleanup()
      await owner.close()
    }
  })

  it('refuses config edits only when read-only is explicit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-forced-ro-'))
    const hub = await Hub.open({ root, readOnly: true, lock: false })
    const harness = await createHarness(undefined, { root, hub })
    try {
      expect(hub.readOnlySource).toBe('forced')
      expect((harness.service.config() as { configWritable: boolean }).configWritable).toBe(false)
      await expect(harness.service.updateConfig({ core_workspaces: [] })).rejects.toThrow(/read-only/)
    } finally {
      await harness.cleanup()
    }
  })

  it('rejects a workspace that references itself as its core', async () => {
    const harness = await createHarness()
    try {
      await expect(
        harness.service.updateConfig({
          core_workspaces: [{ id: 'self', name: 'Self' }],
          workspaces: [{ id: 'self', core_id: 'self', root: '/tmp/self', domains: [], admin: false, enabled: true }],
        }),
      ).rejects.toThrow(/reference itself/)
    } finally {
      await harness.cleanup()
    }
  })

  it('lets a dual-role workspace retrieve both its own core and the parent core', async () => {
    const ownRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-own-'))
    const parentRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-parent-'))
    const ownHub = await Hub.open({ root: ownRoot, lock: false })
    const parentHub = await Hub.open({ root: parentRoot, lock: false })
    const ownLedger = new Ledger(ownHub.ledgerPath())
    const parentLedger = new Ledger(parentHub.ledgerPath())
    const ownStore = new KnowledgeStore(ownHub, ownLedger)
    const parentStore = new KnowledgeStore(parentHub, parentLedger)
    await ownStore.load()
    await parentStore.load()

    const ctx = createDualCtx(ownRoot)
    const ownService = new MemoryService({
      ctx,
      hub: ownHub,
      store: ownStore,
      ledger: ownLedger,
      ledgerState: await ownLedger.load(),
      workspaces: [{ id: 'own', root: ownRoot, domains: [], admin: true, enabled: true }],
      coreId: 'own',
    })
    ownService.setParent({ coreId: 'parent', store: parentStore, ledger: parentLedger, hub: parentHub })

    try {
      const ownProposal = await ownStore.propose(
        {
          operation: 'create',
          type: 'decision',
          scope: 'project:own',
          title: '自己的核心蒸馏',
          summary: 'L1 知识，只属于 own。',
          content: '## 结论\n\nL1。\n',
          sourceRefs: ['note:test'],
        },
        { taskId: 'TSK-seed' },
      )
      await ownStore.commit(ownProposal.id)
      const parentProposal = await parentStore.propose(
        {
          operation: 'create',
          type: 'constraint',
          scope: 'project:parent',
          title: '父核心既有蒸馏',
          summary: 'L2 基线，属于 parent。',
          content: '## 结论\n\nL2 基线。\n',
          sourceRefs: ['note:test'],
        },
        { taskId: 'TSK-seed' },
      )
      const parentKnowledgeId = (await parentStore.commit(parentProposal.id)).record.id

      const agent: AgentLike = { id: 'session-dual', ctx, session: { id: 'session-dual', seq: 0 } }
      await ownService.preflightForTurn(agent, 1, '核心蒸馏')
      const state = ownService.stateFor(agent.id)
      // 金字塔回退：自己的 Hub 有命中时预检只带当前工作区的知识。
      expect(state?.pack).toContain('自己的核心蒸馏')
      expect(state?.pack).not.toContain('父核心既有蒸馏')

      const result = await ownService.search(agent, { query: '蒸馏' })
      expect(result.hits.map((hit) => hit.title)).toEqual(['自己的核心蒸馏'])

      // 本层无命中才回退到父核心层，命中带 core 标注。
      const fallback = await ownService.search(agent, { query: '既有' })
      expect(fallback.hits.map((hit) => hit.title)).toEqual(['父核心既有蒸馏'])
      expect(fallback.hits[0]?.core).toBe('parent')

      // 默认解析：自己的 Hub 没有该条目时回退到父核心 Hub。
      const got = await ownService.get(agent, parentKnowledgeId)
      expect(got.core).toBe('parent')
      expect(got.metadata.title).toBe('父核心既有蒸馏')
      // 显式 core 参数取父核心副本。
      const gotParent = await ownService.get(agent, parentKnowledgeId, undefined, 'parent')
      expect(gotParent.core).toBe('parent')
      expect(gotParent.metadata.title).toBe('父核心既有蒸馏')
    } finally {
      await ownHub.close()
      await parentHub.close()
      await ownLedger.close()
      await parentLedger.close()
      await rm(ownRoot, { recursive: true, force: true })
      await rm(parentRoot, { recursive: true, force: true })
    }
  })

  it('routes scope=core to the own hub and project:<parent> to the parent hub', async () => {
    const ownRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-own2-'))
    const parentRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-parent2-'))
    const ownHub = await Hub.open({ root: ownRoot, lock: false })
    const parentHub = await Hub.open({ root: parentRoot, lock: false })
    const ownLedger = new Ledger(ownHub.ledgerPath())
    const parentLedger = new Ledger(parentHub.ledgerPath())
    const ownStore = new KnowledgeStore(ownHub, ownLedger)
    const parentStore = new KnowledgeStore(parentHub, parentLedger)
    await ownStore.load()
    await parentStore.load()

    const ctx = createDualCtx(ownRoot)
    const ownService = new MemoryService({
      ctx,
      hub: ownHub,
      store: ownStore,
      ledger: ownLedger,
      ledgerState: await ownLedger.load(),
      workspaces: [{ id: 'own', root: ownRoot, domains: [], admin: true, enabled: true }],
      coreId: 'own',
    })
    ownService.setParent({ coreId: 'parent', store: parentStore, ledger: parentLedger, hub: parentHub })

    try {
      const agent: AgentLike = { id: 'session-dual2', ctx, session: { id: 'session-dual2', seq: 0 } }
      await ownService.preflightForTurn(agent, 1, '蒸馏落点')

      // L1：scope=core 落到自己的 Hub。
      const l1 = await ownService.propose(agent, {
        operation: 'create',
        type: 'decision',
        scope: 'core',
        title: 'L1 回填',
        summary: '写进自己的核心仓。',
        content: '## 结论\n\nL1。\n',
        source_refs: ['note:test'],
      })
      expect(l1.core).toBe('own')
      expect(l1.scope).toBe('project:own')
      expect(ownStore.getProposal(l1.proposalId)?.scope).toEqual({ level: 'project', workspaceId: 'own' })
      expect(parentStore.getProposal(l1.proposalId)).toBeNull()

      // L2：显式 project:parent 落到父核心 Hub（两个 Hub 各自从 PRO-000001 起号，
      // 同 ID 是预期的；用归属 Hub 与 pending 路径断言落点）。
      const l2 = await ownService.propose(agent, {
        operation: 'create',
        type: 'decision',
        scope: 'project:parent',
        title: 'L2 继续蒸馏',
        summary: '写进父核心仓。',
        content: '## 结论\n\nL2。\n',
        source_refs: ['note:test'],
      })
      const parentCopy = parentStore.getProposal(l2.proposalId)
      expect(parentCopy?.scope).toEqual({ level: 'project', workspaceId: 'parent' })
      expect(parentCopy?.path).toContain('dsh-memory-hub-parent2-')
      const ownCopy = ownStore.getProposal(l2.proposalId)
      if (ownCopy !== null) {
        expect(ownCopy.scope).toEqual({ level: 'project', workspaceId: 'own' })
      }
      expect(l2.pendingPath).toMatch(/^pending\/PRO-/)

      // 跨 Hub commit：同 ID 冲突时显式 core=parent，从 own 会话提交父核心的候选，
      // 落到父核心账本与知识目录。
      const committed = await ownService.commit(agent, l2.proposalId, 'parent')
      expect(committed.status).toBe('accepted')
      expect(parentStore.docs.has(committed.knowledgeId)).toBe(true)
      expect(ownStore.docs.has(committed.knowledgeId)).toBe(false)
      const parentLedgerTypes = await ledgerTypes(parentHub.ledgerPath())
      expect(parentLedgerTypes).toContain('proposal.committed')

      // 别名 parent：等价于 project:<父核心>，并回报归属 core 便于 commit 显式指定。
      const l2b = await ownService.propose(agent, {
        operation: 'create',
        type: 'knowledge',
        scope: 'parent',
        title: 'L2 别名',
        summary: '别名落到父核心。',
        content: '## 结论\n\n别名。\n',
        source_refs: ['note:test'],
      })
      expect(l2b.core).toBe('parent')
      expect(l2b.scope).toBe('project:parent')
      expect(parentStore.getProposal(l2b.proposalId)?.scope).toEqual({ level: 'project', workspaceId: 'parent' })
    } finally {
      await ownHub.close()
      await parentHub.close()
      await ownLedger.close()
      await parentLedger.close()
      await rm(ownRoot, { recursive: true, force: true })
      await rm(parentRoot, { recursive: true, force: true })
    }
  })

  it('supports a two-level ancestor pyramid (self → parent → grandparent)', async () => {
    const ownRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-pyramid-own-'))
    const parentRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-pyramid-parent-'))
    const grandRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-pyramid-grand-'))
    const open = async (root: string) => {
      const hub = await Hub.open({ root, lock: false })
      const ledger = new Ledger(hub.ledgerPath())
      const store = new KnowledgeStore(hub, ledger)
      await store.load()
      return { hub, ledger, store }
    }
    const own = await open(ownRoot)
    const parent = await open(parentRoot)
    const grand = await open(grandRoot)
    const ctx = createDualCtx(ownRoot)
    const ownService = new MemoryService({
      ctx,
      hub: own.hub,
      store: own.store,
      ledger: own.ledger,
      ledgerState: await own.ledger.load(),
      workspaces: [{ id: 'leaf', root: ownRoot, domains: [], admin: true, enabled: true }],
      coreId: 'leaf',
    })
    ownService.setParents([
      { coreId: 'parent', store: parent.store, ledger: parent.ledger, hub: parent.hub },
      { coreId: 'grand', store: grand.store, ledger: grand.ledger, hub: grand.hub },
    ])

    try {
      const seed = async (store: KnowledgeStore, scope: string, type: KnowledgeType, title: string) => {
        const proposal = await store.propose(
          {
            operation: 'create',
            type,
            scope,
            title,
            summary: `${title} 摘要`,
            content: `## 结论\n\n${title}。\n`,
            sourceRefs: ['note:test'],
          },
          { taskId: 'TSK-pyramid' },
        )
        return (await store.commit(proposal.id)).record
      }
      await seed(own.store, 'project:leaf', 'decision', 'L1 自身蒸馏记忆')
      await seed(parent.store, 'project:parent', 'constraint', 'L2 父核心蒸馏')
      const grandRecord = await seed(grand.store, 'project:grand', 'knowledge', 'L3 顶层蒸馏')

      const agent: AgentLike = { id: 'session-pyramid', ctx, session: { id: 'session-pyramid', seq: 0 } }
      await ownService.preflightForTurn(agent, 1, '蒸馏')
      const state = ownService.stateFor(agent.id)
      // 金字塔回退：自己的 Hub 有命中时，预检不带上层知识。
      expect(state?.pack).toContain('L1 自身蒸馏记忆')
      expect(state?.pack).not.toContain('L2 父核心蒸馏')
      expect(state?.pack).not.toContain('L3 顶层蒸馏')

      const result = await ownService.search(agent, { query: '蒸馏' })
      expect(result.hits.map((hit) => hit.title)).toEqual(['L1 自身蒸馏记忆'])

      // 本层无命中 → 回退到最近的父层；命中带 core 标注。
      const parentFallback = await ownService.search(agent, { query: '父核心' })
      expect(parentFallback.hits.map((hit) => hit.title)).toEqual(['L2 父核心蒸馏'])
      expect(parentFallback.hits[0]?.core).toBe('parent')

      // 本层与父层都无命中 → 再回退到祖父层。
      const grandFallback = await ownService.search(agent, { query: '顶层' })
      expect(grandFallback.hits.map((hit) => hit.title)).toEqual(['L3 顶层蒸馏'])
      expect(grandFallback.hits[0]?.core).toBe('grand')

      // 显式祖先作用域：只查对应层，不做回退。
      const scoped = await ownService.search(agent, { query: '蒸馏', scope: 'project:grand' })
      expect(scoped.hits.map((hit) => hit.title)).toEqual(['L3 顶层蒸馏'])
      expect(scoped.hits[0]?.core).toBe('grand')

      // 回退读取：自己的 Hub 没有时按 近→远 穿透到顶层。
      const got = await ownService.get(agent, grandRecord.id)
      expect(got.core).toBe('grand')
      expect(got.metadata.title).toBe('L3 顶层蒸馏')

      // 显式 scope 上推：L3 候选写进顶层 Hub。
      const l3 = await ownService.propose(agent, {
        operation: 'create',
        type: 'knowledge',
        scope: 'project:grand',
        title: 'L3 上推候选',
        summary: '写进顶层。',
        content: '## 结论\n\n上推。\n',
        source_refs: ['note:test'],
      })
      expect(l3.core).toBe('grand')
      expect(l3.scope).toBe('project:grand')
      expect(grand.store.getProposal(l3.proposalId)?.scope).toEqual({ level: 'project', workspaceId: 'grand' })

      const status = (await ownService.status(agent)) as {
        workspace?: { parentCoreIds?: string[] } | null
        ancestors?: Array<{ coreId: string }>
      }
      expect(status.workspace?.parentCoreIds).toEqual(['parent', 'grand'])
      expect(status.ancestors?.map((ancestor) => ancestor.coreId)).toEqual(['parent', 'grand'])
    } finally {
      for (const pack of [own, parent, grand]) {
        await pack.hub.close()
        await pack.ledger.close()
      }
      await rm(ownRoot, { recursive: true, force: true })
      await rm(parentRoot, { recursive: true, force: true })
      await rm(grandRoot, { recursive: true, force: true })
    }
  })
})

function createDualCtx(directory: string): Context {
  const ctx: Context = {
    tools: {
      register: () => () => {},
      get: () => undefined,
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    get(name: string) {
      if (name === 'workingDirectory') return ctx.workingDirectory
      if (name === 'tokenMeter') return ctx.tokenMeter
      return undefined
    },
    on: () => () => {},
    effect: () => () => {},
    inject: () => {},
    workingDirectory: {
      defaultDirectory: directory,
      get: () => directory,
    },
    tokenMeter: {
      estimateMessage: (message: unknown) => Math.max(1, Math.ceil(JSON.stringify(message).length / 3.2)),
    },
  }
  return ctx
}
