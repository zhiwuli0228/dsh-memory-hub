import { resolve } from 'node:path'

import type { MemoryConfig } from './config.js'
import { expandHome } from './hub.js'

/** 定时蒸馏任务在 Host `schedule` 服务里的标题前缀。 */
export const DISTILL_TITLE_PREFIX = 'memory-hub:distill:'

export interface DistillScheduleEntry {
  /** 配置里的稳定身份：`core:<id>` 或 `workspace:<id>`。 */
  key: string
  title: string
  workspaceId: string
  workspaceKind: 'core' | 'workspace'
  root: string
  time: string
  timeZone: string
  target: DistillTarget
  prompt: string
}

/** 定时任务条目的通用形状：蒸馏与回顾共用同一套对齐逻辑。 */
export type ScheduleEntry = DistillScheduleEntry

export type DistillTarget =
  | { kind: 'new'; create: { cwd: string; agentPreset?: string } }
  | { kind: 'session'; sessionId: string }

export interface DistillScheduleTask {
  id: string
  title: string
  status?: string
  kind?: string
  time?: string
  target?: {
    kind?: string
    sessionId?: string
    create?: { cwd?: string }
  }
  updatedAt?: string
}

export interface DistillCreateRequest {
  title: string
  prompt: string
  timing: { kind: 'daily'; daily: { time: string; time_zone: string } }
  target:
    | { kind: 'new'; create: { cwd: string; agentPreset?: string } }
    | { kind: 'session'; sessionId: string }
}

export type DistillEditRequest =
  | { id: string; action: 'update'; patch: Record<string, unknown> }
  | { id: string; action: 'delete' }

/** Host `schedule` 服务的最小可用面：只做 list / create / edit。 */
export interface DistillScheduleService {
  list(request?: { limit?: number; offset?: number }): Promise<{ items: DistillScheduleTask[]; total?: number }>
  create(request: DistillCreateRequest, actorSessionId?: string): Promise<{ id: string }>
  edit(request: DistillEditRequest): Promise<unknown>
}

export interface DistillReportEntry {
  key: string
  title: string
  workspaceId: string
  workspaceKind: 'core' | 'workspace'
  root: string
  time: string
  target: 'new' | 'session'
  sessionId?: string
  taskId?: string
  action: 'created' | 'updated' | 'kept' | 'removed' | 'error'
  error?: string
}

export interface DistillReconcileReport {
  entries: DistillReportEntry[]
  removed: number
}

function localTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone === '' ? 'UTC' : zone
  } catch {
    return 'UTC'
  }
}

/** Host 的 daily.time 要求 `HH:mm:ss`（可带小数），配置里允许更友好的 `HH:mm`。 */
function hostDailyTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time
}

function taskTimeMatches(entry: ScheduleEntry, task: DistillScheduleTask): boolean {
  if (task.time === undefined) return true
  const normalized = task.time.length > 5 ? task.time.slice(0, 5) : task.time
  return normalized === entry.time
}

function parentCoreOf(config: MemoryConfig, coreId: string): string | undefined {
  const dualRole = config.workspaces.find((workspace) => workspace.id === coreId)
  const parent = dualRole?.core_id
  if (parent === null || parent === undefined || parent === '' || parent === coreId) return undefined
  return parent
}

function workspaceRoot(entry: { root?: string }): string | null {
  const trimmed = entry.root?.trim()
  if (trimmed === undefined || trimmed === '') return null
  return resolve(expandHome(trimmed))
}

/**
 * 生成一条蒸馏任务的提示词。提示词是确定性的操作步骤，不依赖模型自由发挥：
 * 读取 L1 → 选最多 N 条 → `memory_propose` 到上级（或 `memory_consolidate` 到 global）
 * → 绝不 `memory_commit`（候选留给人工批准）。
 */
export function distillPrompt(options: {
  workspaceId: string
  workspaceKind: 'core' | 'workspace'
  root: string
  maxProposals: number
  parentCoreId?: string
}): string {
  const scope = options.parentCoreId !== undefined
    ? `project:${options.parentCoreId}`
    : 'global'
  const upward = options.parentCoreId !== undefined
    ? `蒸馏到上级核心 ${options.parentCoreId} 的 L2（scope: "${scope}"）`
    : '晋升为 global 候选（scope: "global"）'
  const proposeStep = options.parentCoreId !== undefined
    ? `   - 用 memory_propose 提交：operation: "create"，type 沿用原类型\n   - scope: "${scope}"\n   - title / summary / content 写成去掉项目私有的蒸馏版\n   - source_refs: ["knowledge:<原ID>@<版本>"]\n   - tags 追加 "distilled"`
    : `   - 用 memory_consolidate 把本工作区可复用条目晋升为 global 候选（type 过滤：decision / constraint / process / api-catalog / playbooks）`

  return [
    `[记忆蒸馏] 工作区 ${options.workspaceKind === 'core' ? '核心' : '子工作区'} ${options.workspaceId}（${options.root}）开始一次定时蒸馏。`,
    '',
    `目标：把本工作区可复用的 L1 知识${upward}，供人工在面板「待审批」审批。`,
    '',
    '步骤（只做这些，不要扩展任务）：',
    '1. 若当前没有打开的记忆任务，先调用 memory_preflight，query 用 "记忆蒸馏"。',
    `2. 用 memory_search 读取本工作区知识（query "记忆蒸馏"，scope "project:${options.workspaceId}"；必要时 memory_get 读正文）。`,
    `3. 最多挑 ${options.maxProposals} 条对上级有复用价值的条目（decision / constraint / process / api-catalog / playbooks），提交候选：`,
    proposeStep,
    '4. 不要调用 memory_commit；候选留给人工在面板「待审批」审批。',
    '5. 最后调用 memory_close_task 记录本次蒸馏（assessment: proposed 或 no_new_knowledge）。',
  ].join('\n')
}

/** 从配置推导应存在的定时蒸馏任务；未启用、无 root 或工作区已禁用时跳过。 */
export function desiredDistillSchedules(config: MemoryConfig, hubId: string): DistillScheduleEntry[] {
  const timeZone = localTimeZone()
  const entries: DistillScheduleEntry[] = []

  for (const core of config.core_workspaces) {
    const distill = core.distill
    if (distill === undefined || distill.enabled !== true) continue
    const root = workspaceRoot(core)
    if (root === null) continue
    const target = buildTarget(distill.target, root, distill.session_id, distill.agent_preset)
    if (target === null) continue
    entries.push({
      key: `core:${core.id}`,
      title: `${DISTILL_TITLE_PREFIX}${hubId}:core:${core.id}`,
      workspaceId: core.id,
      workspaceKind: 'core',
      root,
      time: distill.time,
      timeZone,
      target,
      prompt: distillPrompt({
        workspaceId: core.id,
        workspaceKind: 'core',
        root,
        maxProposals: distill.max_proposals,
        parentCoreId: parentCoreOf(config, core.id),
      }),
    })
  }

  for (const workspace of config.workspaces) {
    const distill = workspace.distill
    if (distill === undefined || distill.enabled !== true) continue
    if (workspace.enabled === false) continue
    const root = workspaceRoot(workspace)
    if (root === null) continue
    const target = buildTarget(distill.target, root, distill.session_id, distill.agent_preset)
    if (target === null) continue
    const parentCoreId = workspace.core_id !== null && workspace.core_id !== undefined && workspace.core_id !== ''
      ? parentCoreOf(config, workspace.core_id)
      : undefined
    entries.push({
      key: `workspace:${workspace.id}`,
      title: `${DISTILL_TITLE_PREFIX}${hubId}:workspace:${workspace.id}`,
      workspaceId: workspace.id,
      workspaceKind: 'workspace',
      root,
      time: distill.time,
      timeZone,
      target,
      prompt: distillPrompt({
        workspaceId: workspace.id,
        workspaceKind: 'workspace',
        root,
        maxProposals: distill.max_proposals,
        parentCoreId,
      }),
    })
  }

  return entries
}

function buildTarget(
  kind: 'new' | 'session',
  root: string,
  sessionId: string | null | undefined,
  agentPreset: string | null | undefined,
): DistillTarget | null {
  if (kind === 'session') {
    const trimmed = sessionId?.trim() ?? ''
    if (trimmed === '') return null
    return { kind: 'session', sessionId: trimmed }
  }
  const preset = agentPreset?.trim() ?? ''
  return {
    kind: 'new',
    create: { cwd: root, ...(preset === '' ? {} : { agentPreset: preset }) },
  }
}

function targetMatches(entry: ScheduleEntry, task: DistillScheduleTask): boolean {
  const target = task.target
  if (target === undefined || target.kind !== entry.target.kind) return false
  if (entry.target.kind === 'session') {
    return target.sessionId === entry.target.sessionId
  }
  return (target.create?.cwd ?? '') === entry.target.create.cwd
}

function taskMatches(entry: ScheduleEntry, task: DistillScheduleTask): boolean {
  if (task.status !== undefined && task.status !== 'active') return false
  if (task.kind !== undefined && task.kind !== 'daily') return false
  if (!taskTimeMatches(entry, task)) return false
  return targetMatches(entry, task)
}

async function listTasks(service: DistillScheduleService): Promise<DistillScheduleTask[]> {
  const items: DistillScheduleTask[] = []
  const limit = 100
  for (let offset = 0; offset < 1000; offset += limit) {
    const page = await service.list({ limit, offset })
    const pageItems = Array.isArray(page?.items) ? page.items : []
    items.push(...pageItems)
    const total = typeof page?.total === 'number' ? page.total : items.length
    if (pageItems.length < limit || items.length >= total) break
  }
  return items
}

/**
 * 让 Host 的 `schedule` 任务与配置保持一致：缺少的创建、变化的更新、多余的删除。
 * 单条失败不会中断其他条目，错误回填到 report 供面板展示。
 */
export async function reconcileDistillSchedules(
  service: DistillScheduleService,
  config: MemoryConfig,
  hubId: string,
): Promise<DistillReconcileReport> {
  return reconcileScheduleEntries(service, desiredDistillSchedules(config, hubId), `${DISTILL_TITLE_PREFIX}${hubId}:`)
}

/** 通用对齐实现：按标题前缀认领任务，其余任务不动。 */
export async function reconcileScheduleEntries(
  service: DistillScheduleService,
  desired: ScheduleEntry[],
  prefix: string,
): Promise<DistillReconcileReport> {
  const existing = (await listTasks(service)).filter((task) => typeof task.title === 'string' && task.title.startsWith(prefix))
  const byTitle = new Map(existing.map((task) => [task.title, task]))
  const matched = new Set<string>()
  const entries: DistillReportEntry[] = []

  for (const entry of desired) {
    const base = {
      key: entry.key,
      title: entry.title,
      workspaceId: entry.workspaceId,
      workspaceKind: entry.workspaceKind,
      root: entry.root,
      time: entry.time,
      target: entry.target.kind,
      ...(entry.target.kind === 'session' ? { sessionId: entry.target.sessionId } : {}),
    }
    const task = byTitle.get(entry.title)
    try {
      if (task === undefined) {
        const created = await service.create({
          title: entry.title,
          prompt: entry.prompt,
          timing: { kind: 'daily', daily: { time: hostDailyTime(entry.time), time_zone: entry.timeZone } },
          target: entry.target,
        })
        entries.push({ ...base, taskId: created.id, action: 'created' })
      } else {
        matched.add(entry.title)
        if (taskMatches(entry, task)) {
          entries.push({ ...base, taskId: task.id, action: 'kept' })
        } else {
          await service.edit({
            id: task.id,
            action: 'update',
            patch: {
              timing: { kind: 'daily', daily: { time: hostDailyTime(entry.time), time_zone: entry.timeZone } },
              target: entry.target,
              prompt: entry.prompt,
              active: true,
            },
          })
          entries.push({ ...base, taskId: task.id, action: 'updated' })
        }
      }
    } catch (error) {
      entries.push({ ...base, action: 'error', error: (error as Error).message })
    }
  }

  let removed = 0
  for (const task of existing) {
    if (matched.has(task.title)) continue
    if (desired.some((entry) => entry.title === task.title)) continue
    try {
      await service.edit({ id: task.id, action: 'delete' })
      removed += 1
      entries.push({
        key: task.title.slice(prefix.length),
        title: task.title,
        workspaceId: task.title.slice(prefix.length),
        workspaceKind: 'core',
        root: '',
        time: task.time ?? '',
        target: 'new',
        taskId: task.id,
        action: 'removed',
      })
    } catch (error) {
      entries.push({
        key: task.title.slice(prefix.length),
        title: task.title,
        workspaceId: task.title.slice(prefix.length),
        workspaceKind: 'core',
        root: '',
        time: task.time ?? '',
        target: 'new',
        taskId: task.id,
        action: 'error',
        error: (error as Error).message,
      })
    }
  }

  return { entries, removed }
}
