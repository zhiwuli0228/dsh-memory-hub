import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'
import { serializeKnowledgeFile } from '../src/frontmatter.js'
import type {
  AgentLike,
  Context,
  ContentBlock,
  PreStepDecision,
  SkillRegistrationInput,
  ToolDefinition,
} from '../src/host.js'
import type { KnowledgeRecord } from '../src/types.js'

interface FakeHost {
  ctx: Context
  tools: Map<string, ToolDefinition>
  skills: Map<string, SkillRegistrationInput>
  listeners: Map<string, Array<(...args: any[]) => unknown>>
  disposers: Array<() => void>
  contexts: Array<{ name: string; text: string | ((context: unknown) => string) }>
}

function createFakeHost(root: string): FakeHost {
  const tools = new Map<string, ToolDefinition>()
  const skills = new Map<string, SkillRegistrationInput>()
  const listeners = new Map<string, Array<(...args: any[]) => unknown>>()
  const disposers: Array<() => void> = []
  const contexts: FakeHost['contexts'] = []

  const ctx: Context = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
      get(name) {
        return tools.get(name)
      },
    },
    skills: {
      register(skill) {
        skills.set(skill.name, skill)
        return () => skills.delete(skill.name)
      },
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    get: () => undefined,
    on(name, listener) {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => {
        const index = list.indexOf(listener)
        if (index >= 0) list.splice(index, 1)
      }
    },
    effect(execute) {
      const result = execute()
      if (typeof result === 'function') disposers.push(result)
      return result ?? (() => {})
    },
    inject(deps, callback) {
      if (deps.includes('skills')) callback(ctx)
    },
    workingDirectory: {
      defaultDirectory: root,
      get: () => root,
    },
    tokenMeter: {
      estimateMessage: (message: unknown) => Math.max(1, Math.ceil(JSON.stringify(message).length / 3.2)),
    },
  }

  return { ctx, tools, skills, listeners, disposers, contexts }
}

function makeAgent(host: FakeHost, id = 'session-plugin'): AgentLike {
  const agentCtx: Context = {
    ...host.ctx,
    systemPrompt: {
      context(context) {
        host.contexts.push({ name: context.name, text: context.text })
        return () => {}
      },
    },
    get(name: string) {
      if (name === 'systemPrompt') return agentCtx.systemPrompt
      return host.ctx.get(name)
    },
  }
  return {
    id,
    ctx: agentCtx,
    session: { id, seq: 0 },
  }
}

async function invoke(name: string, host: FakeHost, args: unknown, agent: AgentLike): Promise<unknown> {
  const tool = host.tools.get(name)
  if (tool === undefined) throw new Error(`missing tool ${name}`)
  return tool.execute(args, {
    name,
    arguments: args,
    agent,
    signal: new AbortController().signal,
  })
}

describe('plugin entry', () => {
  it('registers tools, runs preflight, injects context, and disposes cleanly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-plugin-'))
    await mkdir(join(root, 'knowledge', 'decision'), { recursive: true })
    const record: KnowledgeRecord = {
      id: 'DEC-000001',
      type: 'decision',
      scope: { level: 'global' },
      status: 'accepted',
      version: 1,
      title: '插件测试决策',
      summary: '一条用于插件冒烟测试的决策。',
      tags: [],
      sourceRefs: ['note:test'],
      related: [],
      supersedes: [],
      promotedFrom: null,
      appliesTo: { branches: [], versions: [] },
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      format: 1,
      body: '## 结论\n\n插件测试。\n',
      path: join(root, 'knowledge', 'decision', 'DEC-000001.md'),
      extra: {},
    }
    await writeFile(record.path, serializeKnowledgeFile(record), 'utf8')

    const host = createFakeHost(root)
    apply(host.ctx, { root })
    expect(host.tools.size).toBe(10)
    expect(host.tools.has('memory_maintenance')).toBe(true)
    expect(host.skills.get('memory-hub')?.source).toBe('runtime')
    expect(host.listeners.get('agent/pre-step')?.length).toBe(1)

    const statusBefore = (await invoke('memory_status', host, {}, makeAgent(host))) as {
      initialized: boolean
      counts: { knowledge: number }
    }
    expect(statusBefore.initialized).not.toBe(false)
    expect(statusBefore.counts.knowledge).toBe(1)

    const agent = makeAgent(host)
    const created = host.listeners.get('agent/created') ?? []
    for (const listener of created) listener({ agent })

    const messages: Array<{ role: 'user'; content: ContentBlock[]; source: { kind: string } }> = [
      { role: 'user', content: [{ type: 'text', text: '插件测试决策是什么？' }], source: { kind: 'user' } },
    ]
    const preStep = host.listeners.get('agent/pre-step') ?? []
    let decision: PreStepDecision = { kind: 'enter', messages }
    for (const listener of preStep) {
      decision = (await listener(
        { agent, messages, turn: 1, step: 1, signal: new AbortController().signal },
        async () => decision,
      )) as PreStepDecision
    }
    expect(decision.kind).toBe('enter')

    const context = host.contexts.find((entry) => entry.name === 'memory:pack')
    expect(context).toBeDefined()
    const text = typeof context?.text === 'function' ? context.text({}) : (context?.text ?? '')
    expect(text).toContain('DEC-000001')

    const cited = (await invoke(
      'memory_cite',
      host,
      { knowledge_id: 'DEC-000001', purpose: '验证插件入口' },
      agent,
    )) as { citationId: string }
    expect(cited.citationId).toMatch(/^CIT-/)

    // 检索默认返回摘要；detail:"ids" 只回 id/标题等紧凑字段，控制上下文体积。
    const idsOnly = (await invoke('memory_search', host, { query: '插件测试', detail: 'ids' }, agent)) as {
      total: number
      hits: Array<Record<string, unknown>>
    }
    expect(idsOnly.hits[0]?.id).toBe('DEC-000001')
    expect(idsOnly.hits[0]?.title).toBe('插件测试决策')
    expect(idsOnly.hits[0]?.summary).toBeUndefined()
    expect(idsOnly.hits[0]?.body).toBeUndefined()

    // 读取默认摘要；section 只读一个小节。
    const digest = (await invoke('memory_get', host, { id: 'DEC-000001' }, agent)) as {
      body: string
      headings: string[]
      truncated: boolean
    }
    expect(digest.body).toContain('插件测试')
    expect(digest.headings).toContain('结论')
    expect(digest.truncated).toBe(false)

    const section = (await invoke('memory_get', host, { id: 'DEC-000001', section: '结论' }, agent)) as {
      body: string
      section: string
    }
    expect(section.body).toContain('插件测试')
    expect(section.section).toBe('结论')

    for (const dispose of host.disposers.reverse()) {
      await dispose()
    }
    await rm(root, { recursive: true, force: true })
  })

  it('routes sessions to per-core-workspace hubs', async () => {
    const configRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-config-'))
    const coreA = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-core-a-'))
    const coreB = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-core-b-'))
    const subA = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-sub-a-'))
    const configYaml = `version: 1
hub:
  id: primary
core_workspaces:
  - id: core-a
    name: Core A
    root: '${coreA.replace(/\\/g, '/')}'
  - id: core-b
    name: Core B
    root: '${coreB.replace(/\\/g, '/')}'
workspaces:
  - id: sub-a
    core_id: core-a
    root: '${subA.replace(/\\/g, '/')}'
    domains: []
    admin: false
    enabled: true
`
    await writeFile(join(configRoot, 'config.yaml'), configYaml, 'utf8')

    const directories = new Map<string, string>()
    directories.set('session-a', coreA)
    directories.set('session-b', coreB)
    directories.set('session-sub', subA)

    const tools = new Map<string, ToolDefinition>()
    const listeners = new Map<string, Array<(...args: any[]) => unknown>>()
    const disposers: Array<() => void> = []
    const workingDirectoryService = {
      defaultDirectory: configRoot,
      get: (session: { id: string }) => directories.get(session.id) ?? configRoot,
    }
    const ctx: Context = {
      tools: {
        register(definition) {
          tools.set(definition.name, definition)
          return () => tools.delete(definition.name)
        },
        get(name) {
          return tools.get(name)
        },
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      get(name: string) {
        if (name === 'workingDirectory') return workingDirectoryService
        return undefined
      },
      on(name, listener) {
        const list = listeners.get(name) ?? []
        list.push(listener)
        listeners.set(name, list)
        return () => {
          const index = list.indexOf(listener)
          if (index >= 0) list.splice(index, 1)
        }
      },
      effect(execute) {
        const result = execute()
        if (typeof result === 'function') disposers.push(result)
        return result ?? (() => {})
      },
      inject: () => {},
      workingDirectory: workingDirectoryService,
      tokenMeter: {
        estimateMessage: (message: unknown) => Math.max(1, Math.ceil(JSON.stringify(message).length / 3.2)),
      },
    }

    apply(ctx, { root: configRoot })

    // Give runtime a moment to open the hubs.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const makeAgentFor = (id: string): AgentLike => ({
      id,
      ctx,
      session: { id, seq: 0 },
    })

    const statusA = (await invoke('memory_status', { ctx, tools, skills: new Map(), listeners, disposers, contexts: [] }, {}, makeAgentFor('session-a'))) as {
      root: string
    }
    expect(statusA.root).toContain('core-a')

    const statusB = (await invoke('memory_status', { ctx, tools, skills: new Map(), listeners, disposers, contexts: [] }, {}, makeAgentFor('session-b'))) as {
      root: string
    }
    expect(statusB.root).toContain('core-b')

    const statusSub = (await invoke(
      'memory_status',
      { ctx, tools, skills: new Map(), listeners, disposers, contexts: [] },
      {},
      makeAgentFor('session-sub'),
    )) as { root: string; workspace: { id: string } | null }
    expect(statusSub.root).toContain('core-a')
    expect(statusSub.workspace?.id).toBe('sub-a')

    for (const dispose of disposers.reverse()) {
      await dispose()
    }
    await rm(configRoot, { recursive: true, force: true })
    await rm(coreA, { recursive: true, force: true })
    await rm(coreB, { recursive: true, force: true })
    await rm(subA, { recursive: true, force: true })
  })

  it('routes a dual-role workspace to its own core hub even when the parent core is configured first', async () => {
    const configRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-dual-config-'))
    const dualRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-dual-'))
    const parentRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-dual-parent-'))
    const configYaml = `version: 1
hub:
  id: primary
core_workspaces:
  - id: parent
    name: Parent
    root: '${parentRoot.replace(/\\/g, '/')}'
  - id: dual
    name: Dual
    root: '${dualRoot.replace(/\\/g, '/')}'
workspaces:
  - id: dual
    core_id: parent
    root: '${dualRoot.replace(/\\/g, '/')}'
    domains: []
    admin: false
    enabled: true
`
    await writeFile(join(configRoot, 'config.yaml'), configYaml, 'utf8')

    const directories = new Map<string, string>()
    directories.set('session-dual', dualRoot)
    directories.set('session-parent', parentRoot)

    const host = createDirectoryHost(configRoot, directories)
    apply(host.ctx, { root: configRoot })
    await new Promise((resolve) => setTimeout(resolve, 50))

    // 父核心在配置里排在前面；等长前缀平局时必须自己的核心优先。
    const dualStatus = (await invoke(
      'memory_status',
      host,
      {},
      makeAgent(host, 'session-dual'),
    )) as {
      root: string
      workspace: { id: string; parentCoreId: string | null; parentCoreIds: string[] } | null
      parent: { coreId: string } | null
    }
    expect(dualStatus.root).toContain('dual-')
    expect(dualStatus.workspace?.id).toBe('dual')
    expect(dualStatus.workspace?.parentCoreId).toBe('parent')
    expect(dualStatus.workspace?.parentCoreIds).toEqual(['parent'])
    expect(dualStatus.parent?.coreId).toBe('parent')

    const parentStatus = (await invoke(
      'memory_status',
      host,
      {},
      makeAgent(host, 'session-parent'),
    )) as { root: string; workspace: { id: string } | null; parent: unknown }
    expect(parentStatus.root).toContain('dual-parent')
    expect(parentStatus.workspace?.id).toBe('parent')
    expect(parentStatus.parent).toBeNull()

    for (const dispose of host.disposers.reverse()) {
      await dispose()
    }
    await rm(configRoot, { recursive: true, force: true })
    await rm(dualRoot, { recursive: true, force: true })
    await rm(parentRoot, { recursive: true, force: true })
  })

  it('re-wires cores and dual-role parents on config hot reload without a restart', async () => {
    const configRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-reload-config-'))
    const parentRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-reload-parent-'))
    const dualRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-reload-dual-'))
    const slash = (value: string): string => value.replace(/\\/g, '/')
    const head = `version: 1
hub:
  id: primary
core_workspaces:
  - id: parent
    name: Parent
    root: '${slash(parentRoot)}'
`
    const tail = `workspaces:
  - id: dual
    core_id: parent
    root: '${slash(dualRoot)}'
    domains: []
    admin: false
    enabled: true
`
    await writeFile(join(configRoot, 'config.yaml'), `${head}${tail}`, 'utf8')

    const directories = new Map<string, string>()
    directories.set('session-reload', dualRoot)

    const host = createDirectoryHost(configRoot, directories)
    apply(host.ctx, { root: configRoot })
    await new Promise((resolve) => setTimeout(resolve, 50))

    try {
      const makeStatus = async (): Promise<{
        root: string
        workspace?: { id: string; parentCoreId: string | null } | null
        parent?: { coreId: string } | null
      }> =>
        (await invoke('memory_status', host, {}, makeAgent(host, 'session-reload'))) as {
          root: string
          workspace?: { id: string; parentCoreId: string | null } | null
          parent?: { coreId: string } | null
        }

      // 初始：dual 只是 parent 的子工作区。
      const before = await makeStatus()
      expect(before.root).toContain('reload-parent')
      expect(before.parent).toBeNull()

      // 热更新：把 dual 同时声明为核心工作区（双角色），无需重启。
      const updated = `${head}  - id: dual
    name: Dual
    root: '${slash(dualRoot)}'
${tail}`
      await writeFile(join(configRoot, 'config.yaml'), updated, 'utf8')

      const deadline = Date.now() + 6000
      let after = await makeStatus()
      while (Date.now() < deadline && !after.root.includes('reload-dual')) {
        await new Promise((resolve) => setTimeout(resolve, 150))
        after = await makeStatus()
      }
      expect(after.root).toContain('reload-dual')
      expect(after.workspace?.id).toBe('dual')
      expect(after.workspace?.parentCoreId).toBe('parent')
      expect(after.parent?.coreId).toBe('parent')
    } finally {
      for (const dispose of host.disposers.reverse()) {
        await dispose()
      }
      await rm(configRoot, { recursive: true, force: true })
      await rm(parentRoot, { recursive: true, force: true })
      await rm(dualRoot, { recursive: true, force: true })
    }
  })

  it('builds a two-level ancestor pyramid from the config chain (leaf → parent → grand)', async () => {
    const configRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-pyramid-config-'))
    const leafRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-pyramid-leaf-'))
    const parentRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-pyramid-parent-'))
    const grandRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-pyramid-grand-'))
    const slash = (value: string): string => value.replace(/\\/g, '/')
    const configYaml = `version: 1
hub:
  id: primary
core_workspaces:
  - id: grand
    name: Grand
    root: '${slash(grandRoot)}'
  - id: parent
    name: Parent
    root: '${slash(parentRoot)}'
  - id: leaf
    name: Leaf
    root: '${slash(leafRoot)}'
workspaces:
  - id: parent
    core_id: grand
    root: '${slash(parentRoot)}'
    domains: []
    admin: false
    enabled: true
  - id: leaf
    core_id: parent
    root: '${slash(leafRoot)}'
    domains: []
    admin: false
    enabled: true
`
    await writeFile(join(configRoot, 'config.yaml'), configYaml, 'utf8')

    const directories = new Map<string, string>()
    directories.set('session-leaf', leafRoot)
    directories.set('session-parent', parentRoot)

    const host = createDirectoryHost(configRoot, directories)
    apply(host.ctx, { root: configRoot })
    await new Promise((resolve) => setTimeout(resolve, 50))

    try {
      const leafStatus = (await invoke('memory_status', host, {}, makeAgent(host, 'session-leaf'))) as {
        root: string
        workspace?: { id: string; parentCoreId: string | null; parentCoreIds: string[] } | null
        ancestors?: Array<{ coreId: string }> | null
      }
      expect(leafStatus.root).toContain('pyramid-leaf')
      expect(leafStatus.workspace?.id).toBe('leaf')
      expect(leafStatus.workspace?.parentCoreId).toBe('parent')
      expect(leafStatus.workspace?.parentCoreIds).toEqual(['parent', 'grand'])
      expect(leafStatus.ancestors?.map((ancestor) => ancestor.coreId)).toEqual(['parent', 'grand'])

      const parentStatus = (await invoke('memory_status', host, {}, makeAgent(host, 'session-parent'))) as {
        root: string
        workspace?: { parentCoreIds?: string[] } | null
      }
      expect(parentStatus.root).toContain('pyramid-parent')
      expect(parentStatus.workspace?.parentCoreIds).toEqual(['grand'])
    } finally {
      for (const dispose of host.disposers.reverse()) {
        await dispose()
      }
      await rm(configRoot, { recursive: true, force: true })
      await rm(leafRoot, { recursive: true, force: true })
      await rm(parentRoot, { recursive: true, force: true })
      await rm(grandRoot, { recursive: true, force: true })
    }
  })

  it('stops an ancestor chain that would cycle instead of hanging', async () => {
    const configRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-cycle-config-'))
    const leafRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-cycle-leaf-'))
    const parentRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-cycle-parent-'))
    const slash = (value: string): string => value.replace(/\\/g, '/')
    const configYaml = `version: 1
hub:
  id: primary
core_workspaces:
  - id: leaf
    name: Leaf
    root: '${slash(leafRoot)}'
  - id: parent
    name: Parent
    root: '${slash(parentRoot)}'
workspaces:
  - id: leaf
    core_id: parent
    root: '${slash(leafRoot)}'
    domains: []
    admin: false
    enabled: true
  - id: parent
    core_id: leaf
    root: '${slash(parentRoot)}'
    domains: []
    admin: false
    enabled: true
`
    await writeFile(join(configRoot, 'config.yaml'), configYaml, 'utf8')

    const directories = new Map<string, string>()
    directories.set('session-cycle', leafRoot)

    const host = createDirectoryHost(configRoot, directories)
    apply(host.ctx, { root: configRoot })
    await new Promise((resolve) => setTimeout(resolve, 50))

    try {
      const status = (await invoke('memory_status', host, {}, makeAgent(host, 'session-cycle'))) as {
        root: string
        workspace?: { parentCoreIds?: string[] } | null
      }
      expect(status.root).toContain('cycle-leaf')
      // 环在第一个重复点截断：leaf → parent（回到 leaf 即停）。
      expect(status.workspace?.parentCoreIds).toEqual(['parent'])
    } finally {
      for (const dispose of host.disposers.reverse()) {
        await dispose()
      }
      await rm(configRoot, { recursive: true, force: true })
      await rm(leafRoot, { recursive: true, force: true })
      await rm(parentRoot, { recursive: true, force: true })
    }
  })

  it('keeps core workspaces writable when the config-root lock is busy', async () => {
    const configRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-cfg-lock-'))
    const coreRoot = await mkdtemp(join(tmpdir(), 'dsh-memory-hub-core-free-'))
    await mkdir(join(configRoot, 'records'), { recursive: true })
    await writeFile(
      join(configRoot, 'config.yaml'),
      `version: 1
core_workspaces:
  - id: core-a
    name: Core A
    root: '${coreRoot.replace(/\\/g, '/')}'
`,
      'utf8',
    )
    const now = new Date().toISOString()
    await writeFile(
      join(configRoot, 'records', '.writer.lock'),
      JSON.stringify({ pid: process.pid, host: hostname(), startedAt: now, heartbeatAt: now }),
      'utf8',
    )

    const host = createDirectoryHost(configRoot, new Map([['session-core', coreRoot]]))
    apply(host.ctx, { root: configRoot })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const configStatus = (await invoke('memory_status', host, {}, makeAgent(host, 'session-config'))) as {
      readOnly: boolean
      readOnlyReason: string | null
      configWritable: boolean
    }
    expect(configStatus.readOnly).toBe(true)
    expect(configStatus.readOnlyReason).toContain('another writer')
    expect(configStatus.configWritable).toBe(true)

    const coreStatus = (await invoke('memory_status', host, {}, makeAgent(host, 'session-core'))) as {
      readOnly: boolean
      root: string
    }
    expect(coreStatus.root).toContain('core-free')
    expect(coreStatus.readOnly).toBe(false)

    for (const dispose of host.disposers.reverse()) {
      await dispose()
    }
    await rm(configRoot, { recursive: true, force: true })
    await rm(coreRoot, { recursive: true, force: true })
  })
})

function createDirectoryHost(configRoot: string, directories: Map<string, string>): FakeHost {
  const tools = new Map<string, ToolDefinition>()
  const listeners = new Map<string, Array<(...args: any[]) => unknown>>()
  const disposers: Array<() => void> = []
  const workingDirectoryService = {
    defaultDirectory: configRoot,
    get: (session: { id: string }) => directories.get(session.id) ?? configRoot,
  }
  const ctx: Context = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
      get(name) {
        return tools.get(name)
      },
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    get(name: string) {
      if (name === 'workingDirectory') return workingDirectoryService
      return undefined
    },
    on(name, listener) {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => {
        const index = list.indexOf(listener)
        if (index >= 0) list.splice(index, 1)
      }
    },
    effect(execute) {
      const result = execute()
      if (typeof result === 'function') disposers.push(result)
      return result ?? (() => {})
    },
    inject: () => {},
    workingDirectory: workingDirectoryService,
    tokenMeter: {
      estimateMessage: (message: unknown) => Math.max(1, Math.ceil(JSON.stringify(message).length / 3.2)),
    },
  }
  return { ctx, tools, skills: new Map(), listeners, disposers, contexts: [] }
}
