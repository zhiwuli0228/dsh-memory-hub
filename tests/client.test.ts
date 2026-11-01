import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

interface Registration {
  options: { name: string; id?: string; key?: string; label?: () => string }
  component: unknown
}

interface ClientSpec {
  id: string
  factory: (require: (name: string) => unknown) => { name: string; inject: string[]; apply: (ctx: unknown) => void }
}

describe('client bundle', () => {
  it('registers the sidebar entry and its main panel', () => {
    const captured: { spec: ClientSpec | null } = { spec: null }
    const window = {
      __ModuleLoader__: {
        load(value: ClientSpec) {
          captured.spec = value
        },
      },
    }
    const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    runInNewContext(code, { window, console })

    const spec = captured.spec as ClientSpec | null
    expect(spec).not.toBeNull()
    if (spec === null) return

    const module = spec.factory((name: string) => {
      if (name === 'react') return React
      throw new Error(`unexpected require ${name}`)
    })

    const registrations: Registration[] = []
    const ctx = {
      slots: {
        inject(_name: string, callback: () => void) {
          callback()
        },
        register(options: Registration['options'], component: unknown) {
          registrations.push({ options, component })
          return () => {}
        },
      },
      locale: {
        register: () => () => {},
        bind: () => (key: string) => key,
        getLocale: () => ({ active: 'zh' }),
      },
      effect: (fn: () => unknown) => {
        const dispose = fn()
        return typeof dispose === 'function' ? dispose : () => {}
      },
    }

    expect(module.name).toBe('dsh-memory-hub')
    expect(module.inject).toContain('slots')
    module.apply(ctx)

    expect(registrations).toHaveLength(2)
    const sidebar = registrations.find((entry) => entry.options.name === 'sidebar.panellist')
    const main = registrations.find((entry) => entry.options.name === 'main')
    expect(sidebar?.options.id).toBe('memory-hub')
    expect(sidebar?.options.label?.()).toBe('记忆中枢')
    expect(main?.options.key).toBe('memory-hub')
    expect(typeof sidebar?.component).toBe('function')
    expect(typeof main?.component).toBe('function')

    const iconHtml = renderToStaticMarkup(
      React.createElement(sidebar?.component as React.ComponentType<{ size: number; active: boolean }>, {
        size: 20,
        active: true,
      }),
    )
    expect(iconHtml).toContain('<svg')

    const panelHtml = renderToStaticMarkup(
      React.createElement(main?.component as React.ComponentType),
    )
    expect(panelHtml).toContain('dmh-root')
    expect(panelHtml).toContain('记忆中枢')
    expect(panelHtml).toContain('dmh-tab')

    const sample = {
      version: '0.1.1',
      initialized: true,
      root: '~/.dsh/memory-hub',
      readOnly: false,
      readOnlyReason: null,
      configError: null,
      counts: {
        knowledge: 1,
        pending: 1,
        byStatus: { candidate: 0, accepted: 1, rejected: 0, superseded: 0, deprecated: 0 },
        byType: { decision: 1 },
      },
      index: { documents: 1, diagnostics: [] },
      workspaces: [{ id: 'backend', root: 'D:/projects/backend', domains: ['backend'], admin: true, enabled: true }],
      policy: {
        preflight: { mode: 'per-turn', pack_tokens: 600, max_hits: 6, inject: 'compact' },
        gate: { mode: 'enforce', on_preflight_error: 'allow', unknown_tools: 'allow' },
        evidence: { required_for: ['decision'] },
      },
      knowledge: [
        {
          id: 'DEC-000001',
          type: 'decision',
          status: 'accepted',
          version: 1,
          title: '缓存广播使用版本号',
          summary: '广播消息携带单调版本号。',
          scope: 'global',
          updatedAt: '2026-11-01T00:00:00Z',
        },
      ],
      pending: [
        {
          id: 'PRO-000001',
          operation: 'create',
          type: 'decision',
          title: '待审批决策',
          summary: '等待批准。',
          scope: 'global',
          taskId: 'TSK-20261101-abc123',
          createdAt: '2026-11-01T00:00:00Z',
        },
      ],
      tasks: [
        {
          taskId: 'TSK-20261101-abc123',
          sessionId: 'session-aaaa-bbbb',
          turn: 1,
          workspaceId: 'backend',
          createdAt: '2026-11-01T00:00:00Z',
          preflight: { status: 'ready', hits: [{ id: 'DEC-000001', version: 1 }] },
          assessment: null,
        },
      ],
      generatedAt: '2026-11-01T00:00:00Z',
    }
    const dataHtml = renderToStaticMarkup(
      React.createElement(main?.component as React.ComponentType<{ initialData: unknown }>, { initialData: sample }),
    )
    expect(dataHtml).toContain('DEC-000001')
    expect(dataHtml).toContain('memory_search')
    expect(dataHtml).toContain('backend')
    expect(dataHtml).toContain('1')
  })
})
