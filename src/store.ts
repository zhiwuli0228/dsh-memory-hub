import { readFileSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { ensureDir, pathExists, readTextOrNull, removeFile, writeAtomic } from './atomic.js'
import { MemoryError } from './errors.js'
import { parseKnowledgeFile, parseProposalFile, PROPOSAL_ID_PATTERN, serializeKnowledgeFile, serializeProposalFile } from './frontmatter.js'
import type { Hub } from './hub.js'
import type { Ledger } from './ledger.js'
import { KnowledgeIndex, type SearchFilters, type SearchIndex } from './search.js'
import { SqliteIndex } from './index-sqlite.js'
import { formatScope, isScopeVisible, parseScope } from './scope.js'
import { formatSequence } from './ids.js'
import { isIsoTimestamp, nowIso } from './time.js'
import {
  PREFIX_TYPE,
  TYPE_PREFIX,
  type AppliesTo,
  type KnowledgeHit,
  type KnowledgeRecord,
  type KnowledgeStatus,
  type KnowledgeType,
  type ProposalOperation,
  type ProposalRecord,
  type Visibility,
} from './types.js'

export interface Diagnostic {
  path: string
  message: string
}

/** 允许未来 5 分钟的时钟偏差；与 frontmatter 校验保持一致。 */
const FUTURE_TOLERANCE_MS = 5 * 60_000

/** 把可选时间参数规整成 null 或带时区的 ISO 字符串；非法值直接拒绝。 */
function temporalValueOf(value: string | undefined, field: string): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (!isIsoTimestamp(trimmed)) {
    throw new MemoryError('INVALID_INPUT', `${field} must be an ISO 8601 timestamp with timezone`)
  }
  return trimmed
}

function assertTemporalWindow(validFrom: string | null, expiresAt: string | null, lastVerified: string | null): void {
  if (validFrom !== null && expiresAt !== null && Date.parse(validFrom) > Date.parse(expiresAt)) {
    throw new MemoryError('INVALID_INPUT', 'expires_at must not be earlier than valid_from')
  }
  if (lastVerified !== null && Date.parse(lastVerified) > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new MemoryError('INVALID_INPUT', 'last_verified must not be in the future')
  }
}

export interface ProposalInput {
  operation: ProposalOperation
  type: KnowledgeType
  scope: string
  title: string
  summary: string
  content?: string
  sourceRefs?: string[]
  tags?: string[]
  related?: string[]
  supersedes?: string[]
  appliesTo?: Partial<AppliesTo>
  target?: string
  expectedVersion?: number
  reason?: string
  promotedFrom?: string | null
  validFrom?: string
  expiresAt?: string
  lastVerified?: string
  /** merge 提案要并入 target 的知识 id（1..10）。 */
  mergedIds?: string[]
}

export interface CreateProposalOptions {
  taskId: string
}

export interface CommitResult {
  record: KnowledgeRecord
  superseded: string[]
}

export interface ConsolidateOptions {
  targetScope: string
  workspaceIds: string[]
  types?: KnowledgeType[]
  dryRun?: boolean
}

export interface ConsolidateResult {
  created: ProposalRecord[]
  skipped: number
}

export interface StoreCounts {
  knowledge: number
  pending: number
  byStatus: Record<KnowledgeStatus, number>
  byType: Record<string, number>
}

const EMPTY_APPLIES: AppliesTo = { branches: [], versions: [] }

function isUnder(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(`..${sep}`) && !rel.includes(`..${sep}`)
}

function sequenceOf(id: string): number {
  const tail = id.slice(id.lastIndexOf('-') + 1)
  const value = Number.parseInt(tail, 10)
  return Number.isFinite(value) ? value : 0
}

/** 启动时预解析的候选数上限；更多的 pending/ 文件按需解析，避免几千条候选拖慢启动。 */
export const PENDING_EAGER_LIMIT = 200

export class KnowledgeStore {
  /** 检索后端：默认内存索引；条目多且 node:sqlite 可用时换成派生 SQLite 索引。 */
  index: SearchIndex = new KnowledgeIndex()
  indexBackend: 'memory' | 'sqlite' = 'memory'
  /** 本次启动是否重建了派生索引（false = 复用了上次的库）。 */
  indexRebuilt = false
  /** 请求 SQLite 但不可用/只读时的说明；会进入 diagnostics。 */
  indexWarning: string | null = null
  readonly docs = new Map<string, KnowledgeRecord>()
  readonly proposals = new Map<string, ProposalRecord>()
  /** 超出预解析上限的 pending/ 文件：先记路径，打开或审批时再解析（见 getProposal）。 */
  private readonly pendingBacklog = new Map<string, string>()
  readonly diagnostics: Diagnostic[] = []
  sequences: Record<string, number> = {}

  constructor(
    private readonly hub: Hub,
    private readonly ledger: Ledger,
  ) {}

  async load(): Promise<void> {
    this.closeIndex()
    this.docs.clear()
    this.proposals.clear()
    this.pendingBacklog.clear()
    this.diagnostics.length = 0
    this.sequences = {}
    this.index = new KnowledgeIndex()
    this.indexBackend = 'memory'
    this.indexRebuilt = false
    this.indexWarning = null

    // 先只读目录名拿到条目数（auto 模式据此选后端），解析与建索引在之后一次完成。
    const knowledgeFiles: Array<{ type: KnowledgeType; dir: string; files: string[] }> = []
    let knowledgeCount = 0
    for (const type of Object.keys(TYPE_PREFIX) as KnowledgeType[]) {
      const dir = this.hub.knowledgeDir(type)
      const files = (await readdirSafe(dir)).filter((file) => file.endsWith('.md'))
      knowledgeFiles.push({ type, dir, files })
      knowledgeCount += files.length
    }

    const storage = this.hub.config.storage
    const wantsSqlite =
      storage.index === 'sqlite' ||
      (storage.index === 'auto' && knowledgeCount >= storage.sqlite_min_entries)
    const fingerprint = await this.knowledgeFingerprint(knowledgeCount)
    if (wantsSqlite) {
      if (this.hub.readOnly) {
        this.indexWarning = 'read-only hub: the derived SQLite index is disabled'
      } else {
        const outcome = await SqliteIndex.open({
          path: this.hub.indexPath(),
          recordOf: (id) => this.docs.get(id),
          fingerprint,
          candidateLimit: storage.index_candidate_limit,
        })
        if ('reason' in outcome) {
          this.indexWarning = `sqlite index unavailable (${outcome.reason}); using the memory index`
        } else {
          this.index = outcome.index
          this.indexBackend = 'sqlite'
          this.indexRebuilt = outcome.rebuilt
        }
      }
    }

    const parsed: KnowledgeRecord[] = []
    for (const { type, dir, files } of knowledgeFiles) {
      for (const file of files) {
        const path = join(dir, file)
        try {
          const record = parseKnowledgeFile(await readFile(path, 'utf8'), path)
          if (record.type !== type) {
            throw new MemoryError('INVALID_INPUT', `${path}: type ${record.type} is stored in ${type}/`)
          }
          if (this.docs.has(record.id)) {
            this.diagnostics.push({ path, message: `duplicate knowledge id ${record.id}; keeping the first file` })
            continue
          }
          this.docs.set(record.id, record)
          parsed.push(record)
          this.bumpSequence(TYPE_PREFIX[type], sequenceOf(record.id))
        } catch (error) {
          this.diagnostics.push({ path, message: (error as Error).message })
        }
      }
    }

    if (this.indexBackend === 'sqlite') {
      const sqlite = this.index as SqliteIndex
      if (this.indexRebuilt) {
        await sqlite.rebuild(
          (async function* records() {
            yield* parsed
          })(),
        )
      }
      // 复用与重建都刷新指纹/时间：下次启动只要文件没动就直接用。
      sqlite.setFingerprint(await this.knowledgeFingerprint(this.docs.size))
    } else {
      for (const record of parsed) this.index.add(record)
    }
    if (this.indexWarning !== null) {
      this.diagnostics.push({ path: this.hub.indexPath(), message: this.indexWarning })
    }

    const pendingFiles = (await readdirSafe(this.hub.pendingDir()))
      .filter((file) => file.endsWith('.md') && PROPOSAL_ID_PATTERN.test(file.slice(0, -3)))
      // 文件名是零填充序号，倒序即“最新在前”；只预解析最新的一批，其余按需解析。
      .sort((left, right) => right.localeCompare(left))
    for (const [index, file] of pendingFiles.entries()) {
      const id = file.slice(0, -3)
      const path = join(this.hub.pendingDir(), file)
      if (index >= PENDING_EAGER_LIMIT) {
        this.pendingBacklog.set(id, path)
        this.bumpSequence('PRO', sequenceOf(id))
        continue
      }
      try {
        const proposal = parseProposalFile(await readFile(path, 'utf8'), path)
        this.proposals.set(proposal.id, proposal)
        this.bumpSequence('PRO', sequenceOf(proposal.id))
      } catch (error) {
        this.diagnostics.push({ path, message: (error as Error).message })
      }
    }

    const sequenceRaw = await readTextOrNull(this.hub.sequencesPath())
    if (sequenceRaw !== null) {
      try {
        const parsed = JSON.parse(sequenceRaw) as Record<string, unknown>
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'number' && Number.isFinite(value)) {
            this.sequences[key] = Math.max(this.sequences[key] ?? 0, value)
          }
        }
      } catch (error) {
        this.diagnostics.push({ path: this.hub.sequencesPath(), message: `invalid sequences.json: ${(error as Error).message}` })
      }
    }
  }

  records(): KnowledgeRecord[] {
    return [...this.docs.values()]
  }

  /** 释放派生索引句柄（SQLite 文件在 Windows 上不关闭就无法删除/移动）。 */
  closeIndex(): void {
    if (this.index instanceof SqliteIndex) {
      try {
        this.index.close()
      } catch {
        // 已经关闭或文件已删除：忽略。
      }
    }
  }

  async get(id: string, version?: number): Promise<KnowledgeRecord | null> {
    const current = this.docs.get(id)
    if (version === undefined || (current !== undefined && current.version === version)) {
      return current ?? null
    }
    const prefix = id.slice(0, id.indexOf('-'))
    const type = PREFIX_TYPE[prefix]
    if (type === undefined) return null
    const historyPath = this.hub.historyPath(type, id, version)
    const raw = await readTextOrNull(historyPath)
    if (raw === null) return null
    try {
      return parseKnowledgeFile(raw, historyPath)
    } catch {
      return null
    }
  }

  search(query: string, options: SearchFilters): KnowledgeHit[] {
    return this.index.search(query, options)
  }

  getProposal(id: string): ProposalRecord | null {
    const cached = this.proposals.get(id)
    if (cached !== undefined) return cached
    const path = this.pendingBacklog.get(id)
    if (path === undefined) return null
    // 少量、低频的“打开旧候选”路径：同步读一次即可，避免把整条服务链路改成异步。
    try {
      const proposal = parseProposalFile(readFileSync(path, 'utf8'), path)
      this.proposals.set(proposal.id, proposal)
      this.pendingBacklog.delete(id)
      return proposal
    } catch (error) {
      this.pendingBacklog.delete(id)
      this.diagnostics.push({ path, message: (error as Error).message })
      return null
    }
  }

  pendingForTask(taskId: string): ProposalRecord[] {
    return [...this.proposals.values()].filter((proposal) => proposal.taskId === taskId && proposal.status === 'pending')
  }

  counts(): StoreCounts {
    const byStatus = {
      candidate: 0,
      accepted: 0,
      rejected: 0,
      superseded: 0,
      deprecated: 0,
    } satisfies Record<KnowledgeStatus, number>
    const byType: Record<string, number> = {}
    for (const record of this.docs.values()) {
      byStatus[record.status] += 1
      byType[record.type] = (byType[record.type] ?? 0) + 1
    }
    return {
      knowledge: this.docs.size,
      pending: this.pendingBacklog.size + [...this.proposals.values()].filter((proposal) => proposal.status === 'pending').length,
      byStatus,
      byType,
    }
  }

  async propose(input: ProposalInput, options: CreateProposalOptions): Promise<ProposalRecord> {
    this.assertWritable()
    const now = nowIso()
    const title = input.title.trim()
    const summary = input.summary.trim()
    const body = (input.content ?? '').trim()
    if (title.length === 0 || title.length > 200) {
      throw new MemoryError('INVALID_INPUT', 'title must be 1..200 characters')
    }
    if (summary.length === 0 || summary.length > 240) {
      throw new MemoryError('INVALID_INPUT', 'summary must be 1..240 characters')
    }
    if (body.length === 0 && input.operation !== 'deprecate') {
      throw new MemoryError('INVALID_INPUT', 'content is required for create/update proposals')
    }
    if (Buffer.byteLength(body, 'utf8') > this.hub.config.policy.limits.max_body_bytes) {
      throw new MemoryError('INVALID_INPUT', `content exceeds ${this.hub.config.policy.limits.max_body_bytes} bytes`)
    }
    const tags = (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean)
    if (tags.length > 12) throw new MemoryError('INVALID_INPUT', 'at most 12 tags are allowed')
    const sourceRefs = (input.sourceRefs ?? []).map((ref) => ref.trim()).filter(Boolean)
    if (sourceRefs.length > this.hub.config.policy.limits.max_source_refs) {
      throw new MemoryError('INVALID_INPUT', `at most ${this.hub.config.policy.limits.max_source_refs} source_refs are allowed`)
    }
    for (const ref of sourceRefs) {
      if (!/^(?:session:[^\s#]+#\d+-\d+|file:.+|url:https?:\/\/\S+|note:.+)$/.test(ref)) {
        throw new MemoryError('INVALID_INPUT', `unsupported source_ref "${ref}" (use session:, file:, url:, or note:)`)
      }
    }

    const scope = parseScope(input.scope)
    const validFrom = temporalValueOf(input.validFrom, 'valid_from')
    const expiresAt = temporalValueOf(input.expiresAt, 'expires_at')
    const lastVerified = temporalValueOf(input.lastVerified, 'last_verified')
    assertTemporalWindow(validFrom, expiresAt, lastVerified)
    if (input.operation !== 'create') {
      if (input.target === undefined || input.target === '') {
        throw new MemoryError('INVALID_INPUT', `${input.operation} requires target`)
      }
      if (input.expectedVersion === undefined) {
        throw new MemoryError('INVALID_INPUT', `${input.operation} requires expected_version`)
      }
      const target = this.docs.get(input.target)
      if (target === undefined) {
        throw new MemoryError('NOT_FOUND', `target ${input.target} does not exist`)
      }
      if (target.status !== 'accepted') {
        throw new MemoryError('INVALID_STATE', `target ${input.target} is ${target.status}`)
      }
      if (target.version !== input.expectedVersion) {
        throw new MemoryError('VERSION_CONFLICT', `target ${input.target} is at version ${target.version}, expected ${input.expectedVersion}`)
      }
      if (formatScope(target.scope) !== formatScope(scope)) {
        throw new MemoryError('SCOPE_FORBIDDEN', 'target scope does not match proposal scope')
      }
      if (input.operation === 'deprecate' && (input.reason === undefined || input.reason.trim() === '')) {
        throw new MemoryError('INVALID_INPUT', 'deprecate requires a reason')
      }
    }
    if (input.supersedes !== undefined && input.supersedes.length > 0 && input.operation !== 'create') {
      throw new MemoryError('INVALID_INPUT', 'supersedes is only supported for create')
    }
    for (const oldId of input.supersedes ?? []) {
      const old = this.docs.get(oldId)
      if (old === undefined || old.status !== 'accepted') {
        throw new MemoryError('INVALID_STATE', `supersedes target ${oldId} is not an accepted knowledge entry`)
      }
    }

    const rawMergedIds = (input.mergedIds ?? []).map((value) => value.trim()).filter(Boolean)
    if (new Set(rawMergedIds).size !== rawMergedIds.length) {
      throw new MemoryError('INVALID_INPUT', 'merged_ids must not contain duplicates')
    }
    const mergedIds = [...new Set(rawMergedIds)]
    if (input.operation !== 'merge') {
      if (mergedIds.length > 0) {
        throw new MemoryError('INVALID_INPUT', 'merged_ids is only supported for merge')
      }
    } else {
      if (mergedIds.length === 0) {
        throw new MemoryError('INVALID_INPUT', 'merge requires merged_ids')
      }
      if (mergedIds.length > 10) {
        throw new MemoryError('INVALID_INPUT', 'merge supports at most 10 merged_ids')
      }
      if (input.target === undefined || input.target === '') {
        throw new MemoryError('INVALID_INPUT', 'merge requires target')
      }
      const target = this.docs.get(input.target)
      if (target === undefined) {
        throw new MemoryError('NOT_FOUND', `target ${input.target} does not exist`)
      }
      if (mergedIds.includes(target.id)) {
        throw new MemoryError('INVALID_INPUT', 'merged_ids must not contain the target')
      }
      for (const mergedId of mergedIds) {
        const merged = this.docs.get(mergedId)
        if (merged === undefined) {
          throw new MemoryError('NOT_FOUND', `merged entry ${mergedId} does not exist`)
        }
        if (merged.status !== 'accepted') {
          throw new MemoryError('INVALID_STATE', `merged entry ${mergedId} is ${merged.status}`)
        }
        if (merged.supersededBy !== null) {
          throw new MemoryError('INVALID_STATE', `merged entry ${mergedId} is already superseded by ${merged.supersededBy}`)
        }
        if (merged.type !== target.type) {
          throw new MemoryError('INVALID_INPUT', `merged entry ${mergedId} has type ${merged.type}, target has ${target.type}`)
        }
        if (formatScope(merged.scope) !== formatScope(target.scope)) {
          throw new MemoryError('SCOPE_FORBIDDEN', `merged entry ${mergedId} is not in scope ${formatScope(target.scope)}`)
        }
      }
    }

    const number = await this.allocate('PRO')
    const id = `PRO-${formatSequence(number)}`

    const proposal: ProposalRecord = {
      id,
      status: 'pending',
      operation: input.operation,
      type: input.type,
      scope,
      title,
      summary,
      tags,
      sourceRefs,
      related: input.related ?? [],
      supersedes: input.supersedes ?? [],
      appliesTo: {
        branches: input.appliesTo?.branches ?? [],
        versions: input.appliesTo?.versions ?? [],
      },
      promotedFrom: input.promotedFrom ?? null,
      target: input.target ?? null,
      expectedVersion: input.expectedVersion ?? null,
      reason: input.reason ?? null,
      validFrom,
      expiresAt,
      lastVerified,
      mergedIds,
      taskId: options.taskId,
      createdAt: now,
      updatedAt: now,
      committedTo: null,
      body,
      path: this.hub.pendingPath(id),
      extra: {},
    }

    await writeAtomic(proposal.path, serializeProposalFile(proposal))
    this.proposals.set(id, proposal)
    return proposal
  }

  async commit(proposalId: string, approvalRef = 'dsh:approval'): Promise<CommitResult> {
    this.assertWritable()
    const proposal = this.proposals.get(proposalId)
    if (proposal === undefined) {
      throw new MemoryError('NOT_FOUND', `proposal ${proposalId} does not exist`)
    }
    if (proposal.status !== 'pending') {
      throw new MemoryError('INVALID_STATE', `proposal ${proposalId} is ${proposal.status}`)
    }
    if (proposal.operation !== 'deprecate' && proposal.sourceRefs.length === 0) {
      const required = this.hub.config.policy.evidence.required_for
      if (required.includes(proposal.type)) {
        throw new MemoryError('INVALID_INPUT', `proposal ${proposalId} needs at least one source_ref for type ${proposal.type}`)
      }
    }

    const now = nowIso()
    let record: KnowledgeRecord
    const superseded: string[] = []

    if (proposal.operation === 'create') {
      record = await this.createFromProposal(proposal, now)
      for (const oldId of record.supersedes) {
        const old = this.docs.get(oldId)
        if (old === undefined || old.status !== 'accepted') continue
        const next: KnowledgeRecord = {
          ...old,
          status: 'superseded',
          version: old.version + 1,
          updatedAt: now,
          path: this.hub.knowledgePath(old.type, old.id),
        }
        await this.archiveVersion(old)
        await this.writeRecord(next)
        superseded.push(old.id)
      }
    } else if (proposal.operation === 'update') {
      record = await this.updateFromProposal(proposal, now)
    } else if (proposal.operation === 'merge') {
      const merged = await this.mergeFromProposal(proposal, now)
      record = merged.record
      superseded.push(...merged.merged)
    } else {
      record = await this.deprecateFromProposal(proposal, now)
    }

    await this.ledger.append({
      type: 'proposal.committed',
      proposalId: proposal.id,
      knowledgeId: record.id,
      version: record.version,
      approvalRef,
    })
    await this.archiveProposal(proposal, 'committed', `${record.id}@${record.version}`)
    await this.refreshIndexFingerprint()
    return { record, superseded }
  }

  /**
   * 数据指纹 = 条目数 + 知识目录最近 mtime。目录 mtime 在新建/删除/原子替换文件时
   * 都会变化，所以外部编辑（或 git checkout）能被下一次启动检测到并触发重建。
   */
  private async knowledgeFingerprint(count: number): Promise<string> {
    let maxMtime = 0
    for (const type of Object.keys(TYPE_PREFIX) as KnowledgeType[]) {
      const info = await stat(this.hub.knowledgeDir(type)).catch(() => null)
      if (info !== null) maxMtime = Math.max(maxMtime, Math.floor(info.mtimeMs))
    }
    return `${count}:${maxMtime}`
  }

  private async refreshIndexFingerprint(): Promise<void> {
    if (this.indexBackend !== 'sqlite') return
    const fingerprint = await this.knowledgeFingerprint(this.docs.size)
    ;(this.index as SqliteIndex).setFingerprint(fingerprint)
  }

  /** 拒绝候选：归档为 rejected 并记一条 proposal.rejected 账本事件。 */
  async reject(proposalId: string, reason?: string): Promise<{ proposalId: string; status: 'rejected' }> {
    this.assertWritable()
    const proposal = this.proposals.get(proposalId)
    if (proposal === undefined) {
      throw new MemoryError('NOT_FOUND', `proposal ${proposalId} does not exist`)
    }
    if (proposal.status !== 'pending') {
      throw new MemoryError('INVALID_STATE', `proposal ${proposalId} is ${proposal.status}`)
    }
    await this.ledger.append({
      type: 'proposal.rejected',
      proposalId: proposal.id,
      ...(reason === undefined || reason === '' ? {} : { reason }),
    })
    await this.archiveProposal(proposal, 'rejected', null)
    return { proposalId, status: 'rejected' }
  }

  private async createFromProposal(proposal: ProposalRecord, now: string): Promise<KnowledgeRecord> {
    const prefix = TYPE_PREFIX[proposal.type]
    const number = await this.allocate(prefix)
    const id = `${prefix}-${formatSequence(number)}`
    const supersedes = proposal.supersedes
    for (const oldId of supersedes) {
      const old = this.docs.get(oldId)
      if (old === undefined || old.status !== 'accepted') {
        throw new MemoryError('INVALID_STATE', `supersedes target ${oldId} is not an accepted knowledge entry`)
      }
      if (old.id === id) throw new MemoryError('INVALID_STATE', 'an entry cannot supersede itself')
    }
    const record: KnowledgeRecord = {
      id,
      type: proposal.type,
      scope: proposal.scope,
      status: 'accepted',
      version: 1,
      title: proposal.title,
      summary: proposal.summary,
      tags: proposal.tags,
      sourceRefs: proposal.sourceRefs,
      related: proposal.related,
      supersedes,
      promotedFrom: proposal.promotedFrom,
      appliesTo: proposal.appliesTo,
      createdAt: now,
      updatedAt: now,
      validFrom: proposal.validFrom,
      expiresAt: proposal.expiresAt,
      lastVerified: proposal.lastVerified ?? now,
      supersededBy: null,
      format: 1,
      body: proposal.body,
      path: this.hub.knowledgePath(proposal.type, id),
      extra: {},
    }
    await this.writeRecord(record)
    return record
  }

  private async updateFromProposal(proposal: ProposalRecord, now: string): Promise<KnowledgeRecord> {
    const target = this.requireTarget(proposal)
    const record: KnowledgeRecord = {
      ...target,
      title: proposal.title,
      summary: proposal.summary,
      tags: proposal.tags,
      sourceRefs: proposal.sourceRefs,
      related: proposal.related,
      appliesTo: proposal.appliesTo,
      version: target.version + 1,
      updatedAt: now,
      // 文件模型里「未提供」与「清空」不可区分：更新提案缺省保留 target 的时间字段。
      validFrom: proposal.validFrom ?? target.validFrom,
      expiresAt: proposal.expiresAt ?? target.expiresAt,
      lastVerified: proposal.lastVerified ?? now,
      body: proposal.body,
      path: this.hub.knowledgePath(target.type, target.id),
    }
    await this.archiveVersion(target)
    await this.writeRecord(record)
    return record
  }

  /**
   * merge 提交：target 接受合并稿并 +1；被合并项进入 superseded 并写反向指针。
   * 纯确定性——不重新计算相似度、不改写被合并项的正文。
   */
  private async mergeFromProposal(
    proposal: ProposalRecord,
    now: string,
  ): Promise<{ record: KnowledgeRecord; merged: string[] }> {
    const target = this.requireTarget(proposal)
    const mergedIds = proposal.mergedIds
    if (mergedIds.length === 0) {
      throw new MemoryError('INVALID_INPUT', 'merge requires merged_ids')
    }
    const mergedRecords: KnowledgeRecord[] = []
    for (const mergedId of mergedIds) {
      const merged = this.docs.get(mergedId)
      if (merged === undefined) throw new MemoryError('NOT_FOUND', `merged entry ${mergedId} does not exist`)
      if (merged.status !== 'accepted') {
        throw new MemoryError('INVALID_STATE', `merged entry ${mergedId} is ${merged.status}`)
      }
      if (merged.supersededBy !== null) {
        throw new MemoryError('INVALID_STATE', `merged entry ${mergedId} is already superseded by ${merged.supersededBy}`)
      }
      if (merged.type !== target.type) {
        throw new MemoryError('INVALID_INPUT', `merged entry ${mergedId} has type ${merged.type}, target has ${target.type}`)
      }
      if (formatScope(merged.scope) !== formatScope(target.scope)) {
        throw new MemoryError('SCOPE_FORBIDDEN', `merged entry ${mergedId} is not in scope ${formatScope(target.scope)}`)
      }
      mergedRecords.push(merged)
    }

    const maxSourceRefs = this.hub.config.policy.limits.max_source_refs
    const related = [...new Set([...target.related, ...mergedIds, ...proposal.related])]
    const sourceRefs = [...new Set([
      ...target.sourceRefs,
      ...proposal.sourceRefs,
      ...mergedRecords.flatMap((merged) => merged.sourceRefs),
    ])].slice(0, maxSourceRefs)

    const record: KnowledgeRecord = {
      ...target,
      title: proposal.title,
      summary: proposal.summary,
      tags: proposal.tags,
      sourceRefs,
      related,
      appliesTo: proposal.appliesTo,
      version: target.version + 1,
      updatedAt: now,
      validFrom: proposal.validFrom ?? target.validFrom,
      expiresAt: proposal.expiresAt ?? target.expiresAt,
      lastVerified: proposal.lastVerified ?? now,
      supersededBy: null,
      body: proposal.body,
      path: this.hub.knowledgePath(target.type, target.id),
    }
    await this.archiveVersion(target)
    await this.writeRecord(record)

    for (const merged of mergedRecords) {
      const next: KnowledgeRecord = {
        ...merged,
        status: 'superseded',
        supersededBy: target.id,
        version: merged.version + 1,
        updatedAt: now,
        path: this.hub.knowledgePath(merged.type, merged.id),
      }
      await this.archiveVersion(merged)
      await this.writeRecord(next)
    }

    await this.ledger.append({
      type: 'knowledge.merged',
      target: target.id,
      merged: mergedIds,
      version: record.version,
      proposalId: proposal.id,
    })
    return { record, merged: mergedIds }
  }

  private async deprecateFromProposal(proposal: ProposalRecord, now: string): Promise<KnowledgeRecord> {
    const target = this.requireTarget(proposal)
    const record: KnowledgeRecord = {
      ...target,
      status: 'deprecated',
      version: target.version + 1,
      updatedAt: now,
      ...(proposal.reason === null ? {} : { deprecatedReason: proposal.reason }),
      path: this.hub.knowledgePath(target.type, target.id),
    }
    await this.archiveVersion(target)
    await this.writeRecord(record)
    return record
  }

  private requireTarget(proposal: ProposalRecord): KnowledgeRecord {
    if (proposal.target === null) {
      throw new MemoryError('INVALID_INPUT', `${proposal.operation} requires target`)
    }
    if (proposal.expectedVersion === null) {
      throw new MemoryError('INVALID_INPUT', `${proposal.operation} requires expected_version`)
    }
    const target = this.docs.get(proposal.target)
    if (target === undefined) {
      throw new MemoryError('NOT_FOUND', `target ${proposal.target} does not exist`)
    }
    if (target.status !== 'accepted') {
      throw new MemoryError('INVALID_STATE', `target ${proposal.target} is ${target.status}`)
    }
    if (target.version !== proposal.expectedVersion) {
      throw new MemoryError('VERSION_CONFLICT', `target ${proposal.target} is at version ${target.version}, expected ${proposal.expectedVersion}`)
    }
    if (formatScope(target.scope) !== formatScope(proposal.scope)) {
      throw new MemoryError('SCOPE_FORBIDDEN', 'target scope does not match proposal scope')
    }
    return target
  }

  private async writeRecord(record: KnowledgeRecord): Promise<void> {
    await writeAtomic(record.path, serializeKnowledgeFile(record))
    this.docs.set(record.id, record)
    this.index.add(record)
  }

  private async archiveVersion(record: KnowledgeRecord): Promise<void> {
    const path = this.hub.historyPath(record.type, record.id, record.version)
    if (await pathExists(path)) return
    await writeAtomic(path, serializeKnowledgeFile(record))
  }

  private async archiveProposal(proposal: ProposalRecord, status: 'committed' | 'rejected', committedTo: string | null): Promise<void> {
    const archived: ProposalRecord = {
      ...proposal,
      status,
      committedTo,
      updatedAt: nowIso(),
      path: this.hub.pendingArchivePath(proposal.id),
    }
    await writeAtomic(archived.path, serializeProposalFile(archived))
    await removeFile(proposal.path)
    this.proposals.set(proposal.id, archived)
  }

  async consolidate(options: ConsolidateOptions): Promise<ConsolidateResult> {
    this.assertWritable()
    const created: ProposalRecord[] = []
    let skipped = 0
    const targetScope = parseScope(options.targetScope)
    const existing = new Set<string>()
    for (const record of this.docs.values()) {
      if (record.promotedFrom !== null) existing.add(record.promotedFrom)
    }
    for (const proposal of this.proposals.values()) {
      if (proposal.promotedFrom !== null) existing.add(proposal.promotedFrom)
    }

    for (const workspaceId of options.workspaceIds) {
      for (const record of this.docs.values()) {
        if (record.scope.level !== 'project' || record.scope.workspaceId !== workspaceId) continue
        if (record.status !== 'accepted') continue
        if (options.types !== undefined && !options.types.includes(record.type)) continue
        const key = `project:${workspaceId}/${record.id}@${record.version}`
        if (existing.has(key)) {
          skipped += 1
          continue
        }
        if (options.dryRun === true) {
          created.push({
            ...(await this.previewConsolidationProposal(record, key, targetScope)),
          })
          existing.add(key)
          continue
        }
        const proposal = await this.propose(
          {
            operation: 'create',
            type: record.type,
            scope: options.targetScope,
            title: truncate(`[promoted] ${record.title}`, 200),
            summary: truncate(`[promoted] ${record.summary}`, 240),
            content: record.body,
            tags: record.tags,
            related: record.related,
            sourceRefs: [`note:${key}`],
            promotedFrom: key,
          },
          { taskId: 'TSK-consolidation' },
        )
        created.push(proposal)
        existing.add(key)
      }
    }
    return { created, skipped }
  }

  private async previewConsolidationProposal(
    record: KnowledgeRecord,
    key: string,
    targetScope: ReturnType<typeof parseScope>,
  ): Promise<ProposalRecord> {
    const now = nowIso()
    return {
      id: 'PRO-preview',
      status: 'pending',
      operation: 'create',
      type: record.type,
      scope: targetScope,
      title: truncate(`[promoted] ${record.title}`, 200),
      summary: truncate(`[promoted] ${record.summary}`, 240),
      tags: record.tags,
      sourceRefs: [`note:${key}`],
      related: record.related,
      supersedes: [],
      appliesTo: { ...EMPTY_APPLIES },
      promotedFrom: key,
      target: null,
      expectedVersion: null,
      reason: null,
      validFrom: null,
      expiresAt: null,
      lastVerified: null,
      mergedIds: [],
      taskId: 'TSK-consolidation',
      createdAt: now,
      updatedAt: now,
      committedTo: null,
      body: record.body,
      path: '',
      extra: {},
    }
  }

  async refreshPath(path: string): Promise<void> {
    const info = await stat(path).catch(() => null)
    if (info === null) {
      const touchedKnowledge = isUnder(join(this.hub.root, 'knowledge'), path)
      this.removePath(path)
      if (touchedKnowledge) await this.refreshIndexFingerprint()
      return
    }
    if (!info.isFile()) return
    if (isUnder(this.hub.pendingDir(), path) && !isUnder(this.hub.pendingArchiveDir(), path)) {
      try {
        const proposal = parseProposalFile(await readFile(path, 'utf8'), path)
        this.proposals.set(proposal.id, proposal)
        this.pendingBacklog.delete(proposal.id)
      } catch (error) {
        this.diagnostics.push({ path, message: (error as Error).message })
      }
      return
    }
    if (!isUnder(join(this.hub.root, 'knowledge'), path)) return
    try {
      const record = parseKnowledgeFile(await readFile(path, 'utf8'), path)
      this.docs.set(record.id, record)
      this.index.add(record)
      this.bumpSequence(TYPE_PREFIX[record.type], sequenceOf(record.id))
    } catch (error) {
      this.diagnostics.push({ path, message: (error as Error).message })
    }
    await this.refreshIndexFingerprint()
  }

  private removePath(path: string): void {
    const name = basename(path)
    const id = name.endsWith('.md') ? name.slice(0, -3) : name
    if (this.docs.has(id)) {
      this.docs.delete(id)
      this.index.remove(id)
      return
    }
    if (this.proposals.has(id)) {
      this.proposals.delete(id)
      return
    }
    this.pendingBacklog.delete(id)
  }

  private bumpSequence(prefix: string, value: number): void {
    this.sequences[prefix] = Math.max(this.sequences[prefix] ?? 0, value)
  }

  private async allocate(key: string): Promise<number> {
    const next = (this.sequences[key] ?? 0) + 1
    this.sequences[key] = next
    await ensureDir(join(this.hub.root, 'records'))
    await writeAtomic(this.hub.sequencesPath(), `${JSON.stringify(this.sequences, null, 2)}\n`)
    return next
  }

  private assertWritable(): void {
    if (this.hub.readOnly) {
      throw new MemoryError('READ_ONLY', this.hub.readOnlyReason ?? 'memory hub is read-only')
    }
  }

  static relativePath(root: string, path: string): string {
    return relative(root, path).replace(/\\/g, '/')
  }

  static isVisible(record: KnowledgeRecord, visibility: Visibility): boolean {
    return isScopeVisible(record.scope, visibility)
  }
}

async function readdirSafe(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

export type { KnowledgeRecord }
