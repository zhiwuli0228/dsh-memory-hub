import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
    expect(host.tools.size).toBe(9)
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
})
