import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'
import { MemoryError } from './errors.js'
import { formatScope, parseScope } from './scope.js'
import {
  KNOWLEDGE_STATUSES,
  KNOWLEDGE_TYPES,
  PREFIX_TYPE,
  type KnowledgeRecord,
  type KnowledgeStatus,
  type KnowledgeType,
  type ProposalOperation,
  type ProposalRecord,
  type ProposalStatus,
} from './types.js'
import { isIsoTimestamp } from './time.js'

export const KNOWLEDGE_ID_PATTERN = /^(?:DEC|CON|KNO|API|PRC|OQ|RUN|PLAY|AST)-\d{6}$/
export const PROPOSAL_ID_PATTERN = /^PRO-\d{6}$/

const timestampSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.string().refine(isIsoTimestamp, 'expected an ISO 8601 timestamp with a timezone'),
)

const appliesToSchema = z
  .object({
    branches: z.array(z.string()).default([]),
    versions: z.array(z.string()).default([]),
  })
  .default({ branches: [], versions: [] })

/** 当前写入的存储格式版本；读取时接受 ≤ 此值，更高版本显式拒绝而不是猜着解析。 */
export const CURRENT_FORMAT = 1

const knowledgeFrontmatterBase = z
  .object({
    id: z.string().regex(KNOWLEDGE_ID_PATTERN),
    type: z.enum(KNOWLEDGE_TYPES),
    scope: z.string().min(1),
    status: z.enum(KNOWLEDGE_STATUSES),
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(240),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    source_refs: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    related: z.array(z.string()).default([]),
    supersedes: z.array(z.string()).default([]),
    superseded_by: z.string().nullable().default(null),
    promoted_from: z.string().nullable().default(null),
    applies_to: appliesToSchema,
    valid_from: timestampSchema.nullable().default(null),
    expires_at: timestampSchema.nullable().default(null),
    last_verified: timestampSchema.nullable().default(null),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    deprecated_reason: z.string().max(500).optional(),
    format: z.number().int().positive().default(CURRENT_FORMAT),
  })
  .passthrough()

/** 允许未来 5 分钟的时钟偏差，避免宿主与 Hub 时钟轻微不一致时写不进去。 */
const FUTURE_TOLERANCE_MS = 5 * 60_000

const knowledgeFrontmatterSchema = knowledgeFrontmatterBase.superRefine((value, ctx) => {
  const validFrom = value.valid_from === null ? null : Date.parse(value.valid_from)
  const expiresAt = value.expires_at === null ? null : Date.parse(value.expires_at)
  if (validFrom !== null && expiresAt !== null && validFrom > expiresAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expires_at'],
      message: 'expires_at must not be earlier than valid_from',
    })
  }
  if (value.last_verified !== null) {
    const lastVerified = Date.parse(value.last_verified)
    if (lastVerified > Date.now() + FUTURE_TOLERANCE_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['last_verified'],
        message: 'last_verified must not be in the future',
      })
    }
  }
})

const proposalFrontmatterBase = z
  .object({
    id: z.string().regex(PROPOSAL_ID_PATTERN),
    status: z.enum(['pending', 'committed', 'rejected', 'superseded']),
    operation: z.enum(['create', 'update', 'deprecate', 'merge']),
    type: z.enum(KNOWLEDGE_TYPES),
    scope: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(240),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    source_refs: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    related: z.array(z.string()).default([]),
    supersedes: z.array(z.string()).default([]),
    applies_to: appliesToSchema,
    promoted_from: z.string().nullable().default(null),
    target: z.string().nullable().default(null),
    expected_version: z.number().int().positive().nullable().default(null),
    reason: z.string().max(500).nullable().default(null),
    valid_from: timestampSchema.nullable().default(null),
    expires_at: timestampSchema.nullable().default(null),
    last_verified: timestampSchema.nullable().default(null),
    merged_ids: z.array(z.string()).max(10).default([]),
    task_id: z.string().min(1),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    committed_to: z.string().nullable().default(null),
  })
  .passthrough()

const proposalFrontmatterSchema = proposalFrontmatterBase

export type KnowledgeFrontmatter = z.infer<typeof knowledgeFrontmatterSchema>
export type ProposalFrontmatter = z.infer<typeof proposalFrontmatterSchema>

const KNOWLEDGE_KEYS = new Set(Object.keys(knowledgeFrontmatterBase.shape))
const PROPOSAL_KEYS = new Set(Object.keys(proposalFrontmatterBase.shape))

function splitFrontmatter(raw: string, path: string): { data: unknown; body: string } {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) {
    throw new MemoryError('INVALID_INPUT', `${path}: file must start with a YAML frontmatter block`)
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match) {
    throw new MemoryError('INVALID_INPUT', `${path}: frontmatter block is not closed with ---`)
  }
  const source = match[1] ?? ''
  const body = raw.slice(match[0].length).replace(/\r\n/g, '\n').trim()
  let data: unknown
  try {
    data = parseYaml(source)
  } catch (error) {
    throw new MemoryError('INVALID_INPUT', `${path}: invalid YAML frontmatter: ${(error as Error).message}`)
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new MemoryError('INVALID_INPUT', `${path}: frontmatter must be a YAML mapping`)
  }
  return { data, body }
}

function pickExtra(data: Record<string, unknown>, known: Set<string>): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key)) extra[key] = value
  }
  return extra
}

function assertIdMatchesType(id: string, type: KnowledgeType, path: string): void {
  const prefix = id.slice(0, id.indexOf('-'))
  if (PREFIX_TYPE[prefix] !== type) {
    throw new MemoryError('INVALID_INPUT', `${path}: id ${id} does not match type ${type}`)
  }
}

function quoteTimestampLines(yaml: string): string {
  return yaml
    .split('\n')
    .map((line) => {
      const match = /^(created_at|updated_at|valid_from|expires_at|last_verified):\s*(.*)$/.exec(line)
      if (!match) return line
      const key = match[1] ?? 'created_at'
      const value = (match[2] ?? '').replace(/^['"]|['"]$/g, '')
      return `${key}: '${value.replace(/'/g, "''")}'`
    })
    .join('\n')
}

export function parseKnowledgeFile(raw: string, path: string): KnowledgeRecord {
  const { data, body } = splitFrontmatter(raw, path)
  const result = knowledgeFrontmatterSchema.safeParse(data)
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ')
    throw new MemoryError('INVALID_INPUT', `${path}: invalid knowledge frontmatter: ${details}`)
  }
  const fm = result.data
  // 前向兼容：更新版本写下的文件不能被旧版本「按 format 1 猜着读」，否则语义会悄悄跑偏。
  // 这里显式拒绝并交由 store 记为诊断，文件保持原样，升级后即可恢复。
  if (fm.format > CURRENT_FORMAT) {
    throw new MemoryError(
      'INVALID_INPUT',
      `${path}: format ${fm.format} is newer than this version supports (${CURRENT_FORMAT}); upgrade dsh-memory-hub instead of editing the file`,
    )
  }
  assertIdMatchesType(fm.id, fm.type, path)
  if (!body) {
    throw new MemoryError('INVALID_INPUT', `${path}: body must not be empty`)
  }
  return {
    id: fm.id,
    type: fm.type,
    scope: parseScope(fm.scope),
    status: fm.status,
    version: fm.version,
    title: fm.title,
    summary: fm.summary,
    tags: fm.tags,
    sourceRefs: fm.source_refs,
    related: fm.related,
    supersedes: fm.supersedes,
    promotedFrom: fm.promoted_from,
    appliesTo: fm.applies_to,
    createdAt: fm.created_at,
    updatedAt: fm.updated_at,
    validFrom: fm.valid_from,
    expiresAt: fm.expires_at,
    lastVerified: fm.last_verified,
    supersededBy: fm.superseded_by,
    ...(fm.deprecated_reason === undefined ? {} : { deprecatedReason: fm.deprecated_reason }),
    format: fm.format,
    body,
    path,
    extra: pickExtra(data as Record<string, unknown>, KNOWLEDGE_KEYS),
  }
}

export function serializeKnowledgeFile(record: KnowledgeRecord): string {
  const fm: Record<string, unknown> = {
    id: record.id,
    type: record.type,
    scope: formatScope(record.scope),
    status: record.status,
    version: record.version,
    title: record.title,
    summary: record.summary,
    tags: record.tags,
    source_refs: record.sourceRefs,
    related: record.related,
    supersedes: record.supersedes,
    ...(record.supersededBy === null ? {} : { superseded_by: record.supersededBy }),
    promoted_from: record.promotedFrom,
    applies_to: record.appliesTo,
    ...(record.validFrom === null ? {} : { valid_from: record.validFrom }),
    ...(record.expiresAt === null ? {} : { expires_at: record.expiresAt }),
    ...(record.lastVerified === null ? {} : { last_verified: record.lastVerified }),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    ...(record.deprecatedReason === undefined ? {} : { deprecated_reason: record.deprecatedReason }),
    format: record.format,
    ...record.extra,
  }
  const yaml = quoteTimestampLines(stringifyYaml(fm, { lineWidth: 0 }).trimEnd())
  return `---\n${yaml}\n---\n\n${record.body.trim()}\n`
}

export function parseProposalFile(raw: string, path: string): ProposalRecord {
  const { data, body } = splitFrontmatter(raw, path)
  const result = proposalFrontmatterSchema.safeParse(data)
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ')
    throw new MemoryError('INVALID_INPUT', `${path}: invalid proposal frontmatter: ${details}`)
  }
  const fm = result.data
  return {
    id: fm.id,
    status: fm.status,
    operation: fm.operation,
    type: fm.type,
    scope: parseScope(fm.scope),
    title: fm.title,
    summary: fm.summary,
    tags: fm.tags,
    sourceRefs: fm.source_refs,
    related: fm.related,
    supersedes: fm.supersedes,
    appliesTo: fm.applies_to,
    promotedFrom: fm.promoted_from,
    target: fm.target,
    expectedVersion: fm.expected_version,
    reason: fm.reason,
    validFrom: fm.valid_from,
    expiresAt: fm.expires_at,
    lastVerified: fm.last_verified,
    mergedIds: fm.merged_ids,
    taskId: fm.task_id,
    createdAt: fm.created_at,
    updatedAt: fm.updated_at,
    committedTo: fm.committed_to,
    body,
    path,
    extra: pickExtra(data as Record<string, unknown>, PROPOSAL_KEYS),
  }
}

export function serializeProposalFile(record: ProposalRecord): string {
  const fm: Record<string, unknown> = {
    id: record.id,
    status: record.status,
    operation: record.operation,
    type: record.type,
    scope: formatScope(record.scope),
    title: record.title,
    summary: record.summary,
    tags: record.tags,
    source_refs: record.sourceRefs,
    related: record.related,
    supersedes: record.supersedes,
    applies_to: record.appliesTo,
    promoted_from: record.promotedFrom,
    target: record.target,
    expected_version: record.expectedVersion,
    reason: record.reason,
    ...(record.mergedIds.length === 0 ? {} : { merged_ids: record.mergedIds }),
    ...(record.validFrom === null ? {} : { valid_from: record.validFrom }),
    ...(record.expiresAt === null ? {} : { expires_at: record.expiresAt }),
    ...(record.lastVerified === null ? {} : { last_verified: record.lastVerified }),
    task_id: record.taskId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    committed_to: record.committedTo,
    ...record.extra,
  }
  const yaml = quoteTimestampLines(stringifyYaml(fm, { lineWidth: 0 }).trimEnd())
  const body = record.body.trim()
  return `---\n${yaml}\n---\n${body ? `\n${body}\n` : ''}`
}

export type { KnowledgeStatus, KnowledgeType, ProposalOperation, ProposalStatus }
