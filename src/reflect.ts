import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

import type { MemoryConfig } from './config.js'
import {
  type DistillReconcileReport,
  type DistillScheduleService,
  type DistillTarget,
  type ScheduleEntry,
  reconcileScheduleEntries,
} from './distill.js'
import { expandHome } from './hub.js'
import { nowIso } from './time.js'

/** 定时回顾任务在 Host `schedule` 服务里的标题前缀（与 distill 不冲突）。 */
export const REFLECT_TITLE_PREFIX = 'memory-hub:reflect:'

/** 一条会话在宿主 `sessionQuery` 服务里的最小投影。 */
export interface ReflectSessionHeader {
  id: string
  cwd?: string
  createdAt?: number
  origin?: string
  parentSession?: string
  delegationDepth?: number
}

export interface ReflectSessionRecord {
  header: ReflectSessionHeader
  live?: boolean
  persisted?: boolean
}

export interface ReflectEvent {
  type: string
  seq?: number
  time?: number
  data?: unknown
}

export interface ReflectSessionSnapshot {
  session: ReflectSessionHeader
  events: ReflectEvent[]
}

/** 宿主 `sessionQuery` 的最小可用面：list / read / 可选全文检索。 */
export interface SessionEventSearchRequest {
  sessionId: string
  query: string
  limit?: number
  cursor?: string
  filters?: unknown[]
}

export interface SessionEventHit {
  sessionId: string
  seq: number
  type: string
  time?: number
  surface?: string
  snippet: string
}

export interface SessionEventSearchPage {
  session?: ReflectSessionHeader
  items: SessionEventHit[]
  nextCursor?: string
}

export interface SessionQueryLike {
  listSessions(signal?: AbortSignal): Promise<ReflectSessionRecord[]>
  readSession(sessionId: string): Promise<ReflectSessionSnapshot>
  searchEvents?(request: SessionEventSearchRequest): Promise<SessionEventSearchPage>
}

export interface SessionDigestSource {
  available: boolean
  listSessions(): Promise<ReflectSessionRecord[]>
  readSession(sessionId: string): Promise<ReflectSessionSnapshot>
  searchEvents?(request: SessionEventSearchRequest): Promise<SessionEventSearchPage>
}

/** 包装宿主服务；任何单次读取失败都由调用方降级处理。 */
export class HostSessionDigestSource implements SessionDigestSource {
  readonly available = true

  constructor(private readonly query: SessionQueryLike) {}

  async listSessions(): Promise<ReflectSessionRecord[]> {
    const records = await this.query.listSessions()
    return Array.isArray(records) ? records : []
  }

  async readSession(sessionId: string): Promise<ReflectSessionSnapshot> {
    const snapshot = await this.query.readSession(sessionId)
    const events = Array.isArray(snapshot?.events) ? snapshot.events : []
    return { session: snapshot.session, events }
  }

  async searchEvents(request: SessionEventSearchRequest): Promise<SessionEventSearchPage> {
    if (typeof this.query.searchEvents !== 'function') {
      throw new Error('sessionQuery.searchEvents is not available on this host')
    }
    const page = await this.query.searchEvents(request)
    const items = Array.isArray(page?.items) ? page.items : []
    return {
      ...(page?.session === undefined ? {} : { session: page.session }),
      items: items.filter(
        (item): item is SessionEventHit =>
          item !== null
          && typeof item === 'object'
          && typeof item.sessionId === 'string'
          && typeof item.seq === 'number'
          && typeof item.snippet === 'string',
      ),
      ...(typeof page?.nextCursor === 'string' ? { nextCursor: page.nextCursor } : {}),
    }
  }
}

/** 宿主没有 `sessionQuery` 时的占位实现：只报不可用，不影响插件其他功能。 */
export class NullSessionDigestSource implements SessionDigestSource {
  readonly available = false

  async listSessions(): Promise<ReflectSessionRecord[]> {
    return []
  }

  async readSession(): Promise<ReflectSessionSnapshot> {
    throw new Error('sessionQuery service unavailable')
  }

  async searchEvents(): Promise<SessionEventSearchPage> {
    throw new Error('sessionQuery service unavailable')
  }
}

export interface ReflectRoot {
  workspaceId: string
  kind: 'core' | 'workspace'
  root: string
}

export function reflectRoots(config: MemoryConfig): ReflectRoot[] {
  const roots: ReflectRoot[] = []
  for (const core of config.core_workspaces) {
    const root = workspaceRoot(core)
    if (root !== null) roots.push({ workspaceId: core.id, kind: 'core', root })
  }
  for (const workspace of config.workspaces) {
    if (workspace.enabled === false) continue
    const root = workspaceRoot(workspace)
    if (root !== null) roots.push({ workspaceId: workspace.id, kind: 'workspace', root })
  }
  return roots
}

function workspaceRoot(entry: { root?: string }): string | null {
  const trimmed = entry.root?.trim()
  if (trimmed === undefined || trimmed === '') return null
  return expandHome(trimmed)
}

function normalizePath(value: string): string {
  const unified = value.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? unified.toLowerCase() : unified
}

/**
 * 按最长前缀把会话 cwd 归给某个已配置 root。一个会话只会属于最深匹配的 root，
 * 因此核心任务不会回顾子工作区的会话。
 */
export function ownerWorkspaceOf(cwd: string | undefined, roots: readonly ReflectRoot[]): ReflectRoot | null {
  if (cwd === undefined || cwd.trim() === '') return null
  const normalized = normalizePath(cwd.trim())
  let best: ReflectRoot | null = null
  let bestLength = -1
  for (const root of roots) {
    const candidate = normalizePath(root.root)
    if (candidate === '') continue
    if (normalized !== candidate && !normalized.startsWith(`${candidate}/`)) continue
    if (candidate.length > bestLength) {
      best = root
      bestLength = candidate.length
    }
  }
  return best
}

export interface DigestEntry {
  role: 'user' | 'assistant'
  text: string
}

export interface DigestFailure {
  name: string
  error: string
}

export interface SessionDigest {
  sessionId: string
  workspaceId: string
  cwd: string
  createdAt: string
  entries: DigestEntry[]
  failures: DigestFailure[]
  chars: number
  truncated: boolean
}

export type DigestResult =
  | { status: 'ok'; digest: SessionDigest }
  | { status: 'too-short'; messages: number }
  | { status: 'empty' }

const MAX_ENTRY_CHARS = 1500

/**
 * 把一次会话压成「用户诉求 + 助手最终结论 + 失败工具调用」。
 * 丢弃系统提示、成功工具输出、思考过程和失败细节正文，避免把密钥/日志搬进上下文。
 */
export function buildDigest(
  snapshot: ReflectSessionSnapshot,
  options: { workspaceId: string; maxChars: number; minMessages: number },
): DigestResult {
  const entries: DigestEntry[] = []
  const failures: DigestFailure[] = []
  const callNames = new Map<string, string>()
  let pendingAssistant: string | null = null
  let messageCount = 0

  const flushAssistant = (): void => {
    if (pendingAssistant === null) return
    const text = pendingAssistant.trim()
    pendingAssistant = null
    if (text === '') return
    entries.push({ role: 'assistant', text: truncate(text, MAX_ENTRY_CHARS) })
    messageCount += 1
  }

  for (const event of snapshot.events) {
    if (event === null || typeof event !== 'object') continue
    const data = event.data as Record<string, unknown> | undefined
    if (data === undefined || data === null) continue
    if (event.type === 'user/message') {
      const text = messageText(data).trim()
      if (text === '') continue
      flushAssistant()
      entries.push({ role: 'user', text: truncate(text, MAX_ENTRY_CHARS) })
      messageCount += 1
      continue
    }
    if (event.type === 'assistant/message') {
      const message = data.message as Record<string, unknown> | undefined
      const text = message === undefined ? '' : messageText(message).trim()
      if (text !== '') pendingAssistant = text
      continue
    }
    if (event.type === 'turn/end') {
      flushAssistant()
      continue
    }
    if (event.type === 'tool/call') {
      const callId = typeof data.callId === 'string' ? data.callId : null
      const name = typeof data.name === 'string' ? data.name : 'tool'
      if (callId !== null) callNames.set(callId, name)
      continue
    }
    if (event.type === 'tool/result') {
      const error = data.error as Record<string, unknown> | undefined
      if (error === undefined || error === null) continue
      const message = data.message as Record<string, unknown> | undefined
      const callId = typeof message?.toolCallId === 'string' ? message.toolCallId : null
      const name = callId === null ? 'tool' : callNames.get(callId) ?? 'tool'
      const code = typeof error.code === 'string' ? error.code : 'error'
      const reason = typeof error.reason === 'string' ? error.reason : ''
      const label = typeof error.name === 'string' ? error.name : code
      failures.push({ name, error: truncate(reason === '' ? label : `${label}: ${reason}`, 200) })
    }
  }
  flushAssistant()

  if (entries.length === 0 && failures.length === 0) return { status: 'empty' }
  if (messageCount < options.minMessages) return { status: 'too-short', messages: messageCount }

  const cwd = typeof snapshot.session?.cwd === 'string' ? snapshot.session.cwd : ''
  const createdAt = typeof snapshot.session?.createdAt === 'number'
    ? new Date(snapshot.session.createdAt).toISOString()
    : nowIso()
  const rendered = renderEntries(entries, failures)
  const { text, truncated } = clip(rendered, options.maxChars)
  return {
    status: 'ok',
    digest: {
      sessionId: snapshot.session?.id ?? '',
      workspaceId: options.workspaceId,
      cwd,
      createdAt,
      entries,
      failures,
      chars: text.length,
      truncated,
    },
  }
}

function renderEntries(entries: DigestEntry[], failures: DigestFailure[]): string {
  const lines: string[] = []
  for (const entry of entries) {
    lines.push(entry.role === 'user' ? `用户：${entry.text}` : `助手：${entry.text}`)
  }
  for (const failure of failures) {
    lines.push(`失败工具：${failure.name} — ${failure.error}`)
  }
  return lines.join('\n\n')
}

function clip(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false }
  const marker = '\n\n…（已截断）'
  const budget = Math.max(0, maxChars - marker.length)
  const head = Math.floor(budget * 0.6)
  const tail = budget - head
  return { text: `${value.slice(0, head)}${marker}${value.slice(value.length - tail)}`, truncated: true }
}

function messageText(message: Record<string, unknown>): string {
  const blocks = message.blocks
  if (Array.isArray(blocks)) {
    return blocks
      .map((block) => (block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text'
        ? String((block as { text?: unknown }).text ?? '')
        : ''))
      .filter((text) => text !== '')
      .join('\n')
  }
  const content = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block
        if (block === null || typeof block !== 'object') return ''
        const typed = block as { type?: unknown; text?: unknown }
        return typed.type === 'text' ? String(typed.text ?? '') : ''
      })
      .filter((text) => text !== '')
      .join('\n')
  }
  return ''
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

export function digestHash(digest: SessionDigest): string {
  const stable = JSON.stringify({
    sessionId: digest.sessionId,
    entries: digest.entries,
    failures: digest.failures,
  })
  return createHash('sha256').update(stable).digest('hex')
}

/** 工具返回给模型的文本形态。 */
export function renderDigest(digest: SessionDigest): string {
  const lines = [
    `## 会话 ${digest.sessionId}`,
    `- 工作区：${digest.workspaceId}`,
    `- cwd：${digest.cwd === '' ? '（未知）' : digest.cwd}`,
    `- 开始于：${digest.createdAt}`,
    `- 字符数：${digest.chars}${digest.truncated ? '（已截断）' : ''}`,
    '',
    '### 用户诉求与助手结论',
    '',
  ]
  for (const entry of digest.entries) {
    lines.push(entry.role === 'user' ? `**用户**：${entry.text}` : `**助手**：${entry.text}`)
    lines.push('')
  }
  if (digest.failures.length > 0) {
    lines.push('### 失败的工具调用')
    lines.push('')
    for (const failure of digest.failures) lines.push(`- \`${failure.name}\`：${failure.error}`)
    lines.push('')
  }
  return lines.join('\n').trim()
}

// ---------------------------------------------------------------------------
// reflect-state.json：按会话记录 digestHash，避免重复回顾。
// ---------------------------------------------------------------------------

export interface ReflectStateEntry {
  sessionId: string
  workspaceId: string
  reflectedAt: string
  digestHash: string
  proposals: string[]
}

export interface ReflectState {
  v: 1
  sessions: ReflectStateEntry[]
}

export class ReflectStateFile {
  private state: ReflectState = { v: 1, sessions: [] }
  private loaded = false

  constructor(private readonly file: string, private readonly limit = 200) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<ReflectState>
      if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.sessions)) {
        this.state = {
          v: 1,
          sessions: parsed.sessions.filter((entry): entry is ReflectStateEntry =>
            entry !== null
            && typeof entry === 'object'
            && typeof entry.sessionId === 'string'
            && typeof entry.digestHash === 'string'),
        }
      }
    } catch {
      this.state = { v: 1, sessions: [] }
    }
    this.loaded = true
  }

  entries(): readonly ReflectStateEntry[] {
    return this.state.sessions
  }

  find(sessionId: string): ReflectStateEntry | undefined {
    return this.state.sessions.find((entry) => entry.sessionId === sessionId)
  }

  async mark(entry: ReflectStateEntry): Promise<void> {
    if (!this.loaded) await this.load()
    this.state.sessions = [entry, ...this.state.sessions.filter((item) => item.sessionId !== entry.sessionId)]
      .slice(0, this.limit)
    await writeFile(this.file, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8')
  }
}

// ---------------------------------------------------------------------------
// 定时任务：与 distill 同构，标题前缀独立。
// ---------------------------------------------------------------------------

export function reflectPrompt(options: {
  workspaceId: string
  workspaceKind: 'core' | 'workspace'
  root: string
  maxCandidates: number
  lookbackDays: number
}): string {
  return [
    `[记忆回顾] 工作区 ${options.workspaceKind === 'core' ? '核心' : '子工作区'} ${options.workspaceId}（${options.root}）开始一次定时回顾。`,
    '',
    `目标：回顾本工作区最近 ${options.lookbackDays} 天内已结束的会话，把当时被验证过、但没记下来的结论补成候选（最多 ${options.maxCandidates} 条），供人工在面板「待审批」审批。`,
    '',
    '步骤（只做这些，不要扩展任务）：',
    '1. 若当前没有打开的记忆任务，先调用 memory_preflight，query 用 "记忆回顾"。',
    '2. 调用 memory_reflect（不传 session_id），读取本工作区名下最近可回顾的会话 digest。',
    '3. 从 digest 里挑出仍然成立、且没有被现有知识覆盖的结论（做过的取舍、踩过的坑、验证过的命令/接口）。先用 memory_search 查重，重复的不要提。',
    `4. 最多提交 ${options.maxCandidates} 条候选：`,
    '   - 用 memory_propose 提交：operation: "create"',
    `   - scope: "project:${options.workspaceId}"（只写本工作区，不要写上级或 global）`,
    '   - source_refs: ["session:<会话ID>#<起始序号>-<结束序号>"]（用 memory_reflect 返回的会话 ID 与区间）',
    '   - tags 追加 "reflection"',
    '5. 不要调用 memory_commit；候选留给人工审批。向上晋升是蒸馏任务的职责，不要在这里做。',
    '6. 最后调用 memory_close_task 记录本次回顾（assessment: proposed 或 no_new_knowledge）。',
  ].join('\n')
}

/** 从配置推导应存在的定时回顾任务；未启用、无 root 或工作区已禁用时跳过。 */
export function desiredReflectSchedules(config: MemoryConfig, hubId: string): ScheduleEntry[] {
  const timeZone = localTimeZone()
  const entries: ScheduleEntry[] = []

  for (const core of config.core_workspaces) {
    const reflect = core.reflect
    if (reflect === undefined || reflect.enabled !== true) continue
    const root = workspaceRoot(core)
    if (root === null) continue
    const target = buildTarget(reflect.target, root, reflect.session_id, reflect.agent_preset)
    if (target === null) continue
    entries.push(entryOf(core.id, 'core', root, reflect, target, timeZone, hubId))
  }
  for (const workspace of config.workspaces) {
    const reflect = workspace.reflect
    if (reflect === undefined || reflect.enabled !== true) continue
    if (workspace.enabled === false) continue
    const root = workspaceRoot(workspace)
    if (root === null) continue
    const target = buildTarget(reflect.target, root, reflect.session_id, reflect.agent_preset)
    if (target === null) continue
    entries.push(entryOf(workspace.id, 'workspace', root, reflect, target, timeZone, hubId))
  }
  return entries
}

function entryOf(
  workspaceId: string,
  workspaceKind: 'core' | 'workspace',
  root: string,
  reflect: { time: string; max_candidates: number; lookback_days: number },
  target: DistillTarget,
  timeZone: string,
  hubId: string,
): ScheduleEntry {
  return {
    key: `${workspaceKind}:${workspaceId}`,
    title: `${REFLECT_TITLE_PREFIX}${hubId}:${workspaceKind}:${workspaceId}`,
    workspaceId,
    workspaceKind,
    root,
    time: reflect.time,
    timeZone,
    target,
    prompt: reflectPrompt({
      workspaceId,
      workspaceKind,
      root,
      maxCandidates: reflect.max_candidates,
      lookbackDays: reflect.lookback_days,
    }),
  }
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
  return { kind: 'new', create: { cwd: root, ...(preset === '' ? {} : { agentPreset: preset }) } }
}

export async function reconcileReflectSchedules(
  service: DistillScheduleService,
  config: MemoryConfig,
  hubId: string,
): Promise<DistillReconcileReport> {
  return reconcileScheduleEntries(service, desiredReflectSchedules(config, hubId), `${REFLECT_TITLE_PREFIX}${hubId}:`)
}

function localTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone === '' ? 'UTC' : zone
  } catch {
    return 'UTC'
  }
}
