import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'
import { serializeKnowledgeFile } from '../src/frontmatter.js'
import type { AgentLike, Context, ContentBlock, PreStepDecision, ToolDefinition } from '../src/host.js'
import type { KnowledgeRecord } from '../src/types.js'

interface FakeHost {
  ctx: Context
  tools: Map<string, ToolDefinition>
  listeners: Map<string, Array<(...args: any[]) => unknown>>
  disposers: Array<() => void>
  contexts: Array<{ name: string; text: string | ((context: unknown) => string) }>
}

function createFakeHost(root: string): FakeHost {
  const tools = new Map<string, ToolDefinition>()
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
    inject: () => {},
    workingDirectory: {
      defaultDirectory: root,
      get: () => root,
    },
    tokenMeter: {
      estimateMessage: (message: unknown) => Math.max(1, Math.ceil(JSON.stringify(message).length / 3.2)),
    },
  }

  return { ctx, tools, listeners, disposers, contexts }
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
})
