import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { ensureDir, pathExists, readTextOrNull, removeFile, writeAtomic } from './atomic.js'
import { MemoryError } from './errors.js'
import { parseKnowledgeFile, parseProposalFile, PROPOSAL_ID_PATTERN, serializeKnowledgeFile, serializeProposalFile } from './frontmatter.js'
import type { Hub } from './hub.js'
import type { Ledger } from './ledger.js'
import { KnowledgeIndex, type SearchFilters } from './search.js'
import { formatScope, isScopeVisible, parseScope } from './scope.js'
import { formatSequence } from './ids.js'
import { nowIso } from './time.js'
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

export class KnowledgeStore {
  readonly index = new KnowledgeIndex()
  readonly docs = new Map<string, KnowledgeRecord>()
  readonly proposals = new Map<string, ProposalRecord>()
  readonly diagnostics: Diagnostic[] = []
  sequences: Record<string, number> = {}

  constructor(
    private readonly hub: Hub,
    private readonly ledger: Ledger,
  ) {}

  async load(): Promise<void> {
    this.docs.clear()
    this.proposals.clear()
    this.diagnostics.length = 0
    this.sequences = {}

    for (const type of Object.keys(TYPE_PREFIX) as KnowledgeType[]) {
      const dir = this.hub.knowledgeDir(type)
      const files = await readdirSafe(dir)
      for (const file of files) {
        if (!file.endsWith('.md')) continue
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
          this.index.add(record)
          this.bumpSequence(TYPE_PREFIX[type], sequenceOf(record.id))
        } catch (error) {
          this.diagnostics.push({ path, message: (error as Error).message })
        }
      }
    }

    const pendingFiles = await readdirSafe(this.hub.pendingDir())
    for (const file of pendingFiles) {
      if (!file.endsWith('.md') || !PROPOSAL_ID_PATTERN.test(file.slice(0, -3))) continue
      const path = join(this.hub.pendingDir(), file)
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
    return this.proposals.get(id) ?? null
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
      pending: [...this.proposals.values()].filter((proposal) => proposal.status === 'pending').length,
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
    return { record, superseded }
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
      body: proposal.body,
      path: this.hub.knowledgePath(target.type, target.id),
    }
    await this.archiveVersion(target)
    await this.writeRecord(record)
    return record
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
      this.removePath(path)
      return
    }
    if (!info.isFile()) return
    if (isUnder(this.hub.pendingDir(), path) && !isUnder(this.hub.pendingArchiveDir(), path)) {
      try {
        const proposal = parseProposalFile(await readFile(path, 'utf8'), path)
        this.proposals.set(proposal.id, proposal)
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
    }
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
