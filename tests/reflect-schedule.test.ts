import { describe, expect, it } from 'vitest'

import { configSchema, type MemoryConfig } from '../src/config.js'
import type { DistillCreateRequest, DistillEditRequest, DistillScheduleTask } from '../src/distill.js'
import {
  REFLECT_TITLE_PREFIX,
  desiredReflectSchedules,
  reconcileReflectSchedules,
  reflectPrompt,
} from '../src/reflect.js'

function makeConfig(input: Record<string, unknown>): MemoryConfig {
  return configSchema.parse(input)
}

class FakeScheduleService {
  readonly items: DistillScheduleTask[] = []
  readonly created: DistillCreateRequest[] = []
  readonly edits: DistillEditRequest[] = []

  async list(): Promise<{ items: DistillScheduleTask[]; total: number }> {
    return { items: this.items, total: this.items.length }
  }

  async create(request: DistillCreateRequest): Promise<{ id: string }> {
    this.created.push(request)
    const id = `task-${this.created.length}`
    this.items.push({
      id,
      title: request.title,
      status: 'active',
      kind: 'daily',
      time: request.timing.daily.time,
      target: request.target.kind === 'new'
        ? { kind: 'new', create: { cwd: request.target.create.cwd } }
        : { kind: 'session', sessionId: request.target.sessionId },
    })
    return { id }
  }

  async edit(request: DistillEditRequest): Promise<unknown> {
    this.edits.push(request)
    if (request.action === 'delete') {
      const index = this.items.findIndex((task) => task.id === request.id)
      if (index >= 0) this.items.splice(index, 1)
      return { ok: true }
    }
    const task = this.items.find((entry) => entry.id === request.id)
    if (task !== undefined) {
      const patch = request.patch as Record<string, unknown>
      const timing = patch.timing as { daily: { time: string } } | undefined
      if (timing !== undefined) task.time = timing.daily.time
    }
    return { ok: true }
  }
}

describe('reflect schedules', () => {
  it('is opt-in per workspace and honours target settings', () => {
    const config = makeConfig({
      core_workspaces: [{ id: 'product', root: 'D:/projects' }],
      workspaces: [
        { id: 'backend', root: 'D:/projects/backend' },
        { id: 'frontend', root: 'D:/projects/frontend', reflect: { enabled: true, time: '05:00', max_candidates: 3 } },
        { id: 'paused', root: 'D:/projects/paused', enabled: false, reflect: { enabled: true } },
        { id: 'delivery', root: 'D:/projects/delivery', reflect: { enabled: true, target: 'session' } },
      ],
    })
    const entries = desiredReflectSchedules(config, 'hub')
    expect(entries.map((entry) => entry.workspaceId)).toEqual(['frontend'])
    expect(entries[0]!.time).toBe('05:00')
    expect(entries[0]!.title).toBe(`${REFLECT_TITLE_PREFIX}hub:workspace:frontend`)
    expect(entries[0]!.target).toEqual({ kind: 'new', create: { cwd: 'D:/projects/frontend' } })
    expect(entries[0]!.prompt).toContain('最多 3 条')
    expect(entries[0]!.prompt).toContain('project:frontend')
    expect(entries[0]!.prompt).toContain('不要调用 memory_commit')
  })

  it('skips target: session without a session id', () => {
    const config = makeConfig({
      workspaces: [{ id: 'backend', root: 'D:/projects/backend', reflect: { enabled: true, target: 'session' } }],
    })
    expect(desiredReflectSchedules(config, 'hub')).toEqual([])
  })

  it('creates, updates and removes reflect tasks without touching distill tasks', async () => {
    const service = new FakeScheduleService()
    service.items.push({
      id: 'distill-1',
      title: 'memory-hub:distill:hub:workspace:backend',
      status: 'active',
      kind: 'daily',
      time: '03:30',
    })
    service.items.push({
      id: 'reflect-1',
      title: `${REFLECT_TITLE_PREFIX}hub:workspace:backend`,
      status: 'active',
      kind: 'daily',
      time: '04:30',
      target: { kind: 'new', create: { cwd: 'D:/projects/backend' } },
    })
    service.items.push({
      id: 'reflect-stale',
      title: `${REFLECT_TITLE_PREFIX}hub:workspace:legacy`,
      status: 'active',
      kind: 'daily',
      time: '04:30',
    })

    const config = makeConfig({
      workspaces: [
        { id: 'backend', root: 'D:/projects/backend', reflect: { enabled: true, time: '05:10' } },
        { id: 'frontend', root: 'D:/projects/frontend', reflect: { enabled: true } },
      ],
    })
    const report = await reconcileReflectSchedules(service, config, 'hub')
    expect(report.entries.map((entry) => `${entry.workspaceId}:${entry.action}`)).toEqual([
      'backend:updated',
      'frontend:created',
      'workspace:legacy:removed',
    ])
    expect(report.removed).toBe(1)
    expect(service.created).toHaveLength(1)
    expect(service.items.some((task) => task.title === 'memory-hub:distill:hub:workspace:backend')).toBe(true)
  })

  it('prompt pins scope, source refs and the no-commit rule', () => {
    const prompt = reflectPrompt({
      workspaceId: 'backend',
      workspaceKind: 'workspace',
      root: 'D:/projects/backend',
      maxCandidates: 5,
      lookbackDays: 30,
    })
    expect(prompt).toContain('memory_reflect')
    expect(prompt).toContain('session:<会话ID>#<起始序号>-<结束序号>')
    expect(prompt).toContain('project:backend')
    expect(prompt).toContain('不要调用 memory_commit')
    expect(prompt).toContain('最近 30 天')
  })
})
