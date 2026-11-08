export const KNOWLEDGE_TYPES = [
  'decision',
  'constraint',
  'knowledge',
  'api-catalog',
  'process',
  'open-questions',
  'runtime-base',
  'playbooks',
  'assets',
] as const

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number]

export const TYPE_PREFIX: Record<KnowledgeType, string> = {
  decision: 'DEC',
  constraint: 'CON',
  knowledge: 'KNO',
  'api-catalog': 'API',
  process: 'PRC',
  'open-questions': 'OQ',
  'runtime-base': 'RUN',
  playbooks: 'PLAY',
  assets: 'AST',
}

export const PREFIX_TYPE: Record<string, KnowledgeType> = Object.fromEntries(
  Object.entries(TYPE_PREFIX).map(([type, prefix]) => [prefix, type]),
) as Record<string, KnowledgeType>

export const KNOWLEDGE_STATUSES = [
  'candidate',
  'accepted',
  'rejected',
  'superseded',
  'deprecated',
] as const

export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number]

export type Scope =
  | { level: 'global' }
  | { level: 'domain'; id: string }
  | { level: 'project'; workspaceId: string }

export interface AppliesTo {
  branches: string[]
  versions: string[]
}

/**
 * 时效派生状态：读取时按三个时间字段实时计算，不落盘。
 * - scheduled: valid_from 在未来（尚未生效）
 * - stale:     expires_at 已过（需要复核；不删除、只降权）
 * - aging:     last_verified（缺失时用 updated_at）超过 aging_days
 * - fresh:     其余
 */
export type TemporalState = 'fresh' | 'aging' | 'stale' | 'scheduled'

export interface KnowledgeRecord {
  id: string
  type: KnowledgeType
  scope: Scope
  status: KnowledgeStatus
  version: number
  title: string
  summary: string
  tags: string[]
  sourceRefs: string[]
  related: string[]
  supersedes: string[]
  promotedFrom: string | null
  appliesTo: AppliesTo
  createdAt: string
  updatedAt: string
  /** 事实开始成立的时刻；null 表示与 created_at 相同（未标注）。 */
  validFrom: string | null
  /** 事实不再可信的时刻；null 表示不设到期。 */
  expiresAt: string | null
  /** 上次被确认仍然正确的时刻；null 表示从未显式确认（回退到 updated_at）。 */
  lastVerified: string | null
  deprecatedReason?: string
  format: number
  body: string
  path: string
  extra: Record<string, unknown>
}

export interface KnowledgeHit {
  id: string
  version: number
  type: KnowledgeType
  status: KnowledgeStatus
  scope: Scope
  title: string
  summary: string
  path: string
  snippet: string
  score: number
  /** 命中条目的时效派生状态；用于预检标记与过滤。 */
  temporal: TemporalState
  /** 来源核心 Hub（跨 Hub 检索时标注；null/undefined 表示当前 Hub）。 */
  core?: string | null
}

export type ProposalOperation = 'create' | 'update' | 'deprecate'

export type ProposalStatus = 'pending' | 'committed' | 'rejected' | 'superseded'

export interface ProposalRecord {
  id: string
  status: ProposalStatus
  operation: ProposalOperation
  type: KnowledgeType
  scope: Scope
  title: string
  summary: string
  tags: string[]
  sourceRefs: string[]
  related: string[]
  supersedes: string[]
  appliesTo: AppliesTo
  promotedFrom: string | null
  target: string | null
  expectedVersion: number | null
  reason: string | null
  validFrom: string | null
  expiresAt: string | null
  lastVerified: string | null
  taskId: string
  createdAt: string
  updatedAt: string
  committedTo: string | null
  body: string
  path: string
  extra: Record<string, unknown>
}

export type WritebackAssessment =
  | { kind: 'proposed'; proposalIds: string[] }
  | { kind: 'no_new_knowledge'; reason: string }
  | { kind: 'needs_evidence'; missing: string[] }
  | { kind: 'deferred'; reason: string }

export type PreflightStatus = 'ready' | 'no_match' | 'unavailable'

export interface PreflightRecord {
  id: string
  taskId: string
  sessionId: string
  turn: number
  workspaceId: string | null
  status: PreflightStatus
  hits: Array<{ id: string; version: number }>
  tokens: number
  createdAt: string
}

export interface CitationRecord {
  id: string
  taskId: string
  knowledgeId: string
  version: number
  purpose: string
  createdAt: string
  /** 被引用条目所在的核心 Hub（跨 Hub 引用时标注；同 Hub 为 null）。 */
  coreId?: string | null
}

export interface TaskRecord {
  taskId: string
  sessionId: string
  turn: number
  workspaceId: string | null
  intentHash: string
  createdAt: string
  preflight: PreflightRecord | null
  assessment: WritebackAssessment | null
  closedAt: string | null
}

export interface Visibility {
  global: boolean
  domains: Set<string>
  projects: Set<string>
}

export interface WorkspaceMatch {
  id: string | null
  root: string | null
  domains: string[]
  admin: boolean
  path: string
  registered: boolean
  coreId: string | null
  /** 双角色工作区：本工作区同时是 coreId 的子工作区时，指向最近的父核心 id。 */
  parentCoreId: string | null
  /** 金字塔上级链：全部祖先核心 id，按 近→远 排列（父、祖父、…）。 */
  parentCoreIds: string[]
}
