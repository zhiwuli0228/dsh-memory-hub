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
}
