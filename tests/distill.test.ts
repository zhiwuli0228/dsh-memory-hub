import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { configSchema, type MemoryConfig } from '../src/config.js'
import {
  desiredDistillSchedules,
  distillPrompt,
  reconcileDistillSchedules,
  type DistillCreateRequest,
  type DistillEditRequest,
  type DistillScheduleTask,
} from '../src/distill.js'

function makeConfig(input: Record<string, unknown>): MemoryConfig {
  return configSchema.parse(input)
}

class FakeScheduleService {
  readonly items: DistillScheduleTask[] = []
  readonly created: DistillCreateRequest[] = []
  readonly edits: DistillEditRequest[] = []
  failCreate: string | null = null

  async list(): Promise<{ items: DistillScheduleTask[]; total: number }> {
    return { items: this.items, total: this.items.length }
  }

  async create(request: DistillCreateRequest): Promise<{ id: string }> {
    if (this.failCreate !== null) throw new Error(this.failCreate)
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
      const target = patch.target as DistillCreateRequest['target'] | undefined
      task.status = 'active'
      if (timing !== undefined) task.time = timing.daily.time
      if (target !== undefined) {
        task.target = target.kind === 'new'
          ? { kind: 'new', create: { cwd: target.create.cwd } }
          : { kind: 'session', sessionId: target.sessionId }
      }
    }
    return { ok: true }
  }
}

describe('distill schedules', () => {
  it('derives one daily task per enabled workspace and skips disabled ones', () => {
    const config = makeConfig({
      core_workspaces: [
        { id: 'core-a', root: 'C:/work/core-a', distill: { enabled: true, time: '04:15' } },
        { id: 'core-b', root: 'C:/work/core-b' },
      ],
      workspaces: [
        { id: 'sub-a', core_id: 'core-a', root: 'C:/work/sub-a', distill: { enabled: true, time: '05:00', target: 'session', session_id: 'session-123', max_proposals: 3 } },
        { id: 'sub-off', core_id: 'core-a', root: 'C:/work/off', enabled: false, distill: { enabled: true } },
        { id: 'sub-no-id', core_id: 'core-a', root: 'C:/work/no-id', distill: { enabled: true, target: 'session' } },
      ],
    })

    const specs = desiredDistillSchedules(config, 'primary')
    expect(specs.map((spec) => spec.title)).toEqual([
      'memory-hub:distill:primary:core:core-a',
      'memory-hub:distill:primary:workspace:sub-a',
    ])
    expect(specs[0]?.time).toBe('04:15')
    expect(specs[0]?.target).toEqual({ kind: 'new', create: { cwd: resolve('C:/work/core-a') } })
    expect(specs[1]?.target).toEqual({ kind: 'session', sessionId: 'session-123' })
    expect(specs[1]?.prompt).toContain('最多挑 3 条')
  })

  it('promotes core knowledge to its parent core and falls back to global at the top', () => {
    const withParent = makeConfig({
      core_workspaces: [
        { id: 'core-a', root: 'C:/work/core-a', distill: { enabled: true } },
        { id: 'core-parent', root: 'C:/work/parent', distill: { enabled: true } },
      ],
      // 双角色：core-a 同时是 core-parent 的子工作区，蒸馏目标应是 core-parent。
      workspaces: [{ id: 'core-a', core_id: 'core-parent', root: 'C:/work/core-a' }],
    })
    const parentSpec = desiredDistillSchedules(withParent, 'primary').find((spec) => spec.key === 'core:core-a')
    expect(parentSpec?.prompt).toContain('project:core-parent')
    expect(parentSpec?.prompt).toContain('memory_propose')
    expect(parentSpec?.prompt).not.toContain('memory_consolidate')

    const top = makeConfig({
      core_workspaces: [{ id: 'core-top', root: 'C:/work/top', distill: { enabled: true } }],
    })
    const topSpec = desiredDistillSchedules(top, 'primary')[0]
    expect(topSpec?.prompt).toContain('memory_consolidate')
    expect(topSpec?.prompt).toContain('global')
  })

  it('keeps the prompt from ever committing proposals', () => {
    const prompt = distillPrompt({
      workspaceId: 'sub-a',
      workspaceKind: 'workspace',
      root: 'C:/work/sub-a',
      maxProposals: 5,
    })
    expect(prompt).toContain('memory_close_task')
    expect(prompt).toContain('不要调用 memory_commit')
  })

  it('creates missing tasks, keeps matching ones, updates changed ones, and deletes stale ones', async () => {
    const service = new FakeScheduleService()
    const config = makeConfig({
      core_workspaces: [{ id: 'core-a', root: 'C:/work/core-a', distill: { enabled: true, time: '04:15' } }],
    })

    const first = await reconcileDistillSchedules(service, config, 'primary')
    expect(first.entries.map((entry) => entry.action)).toEqual(['created'])
    expect(service.created[0]?.target).toEqual({ kind: 'new', create: { cwd: resolve('C:/work/core-a') } })

    const second = await reconcileDistillSchedules(service, config, 'primary')
    expect(second.entries.map((entry) => entry.action)).toEqual(['kept'])
    expect(service.created).toHaveLength(1)
    expect(service.edits).toHaveLength(0)

    const changedTime = makeConfig({
      core_workspaces: [{ id: 'core-a', root: 'C:/work/core-a', distill: { enabled: true, time: '06:30' } }],
    })
    const third = await reconcileDistillSchedules(service, changedTime, 'primary')
    expect(third.entries.map((entry) => entry.action)).toEqual(['updated'])
    expect(service.edits).toHaveLength(1)

    const disabled = makeConfig({ core_workspaces: [{ id: 'core-a', root: 'C:/work/core-a' }] })
    const fourth = await reconcileDistillSchedules(service, disabled, 'primary')
    expect(fourth.removed).toBe(1)
    expect(service.items).toHaveLength(0)
  })

  it('reports per-entry errors without stopping other workspaces', async () => {
    const service = new FakeScheduleService()
    service.failCreate = 'session not found'
    const config = makeConfig({
      core_workspaces: [{ id: 'core-a', root: 'C:/work/core-a', distill: { enabled: true } }],
    })
    const report = await reconcileDistillSchedules(service, config, 'primary')
    expect(report.entries[0]?.action).toBe('error')
    expect(report.entries[0]?.error).toContain('session not found')
  })
})
