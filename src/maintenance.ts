import { createHash } from 'node:crypto'
import type { KnowledgeRecord, ProposalRecord } from './types.js'
import type { KnowledgeStore, ProposalInput } from './store.js'
import { formatScope } from './scope.js'
import { DEFAULT_TEMPORAL_POLICY, temporalState, type TemporalPolicy } from './temporal.js'

export type MaintenanceApply = 'report' | 'propose'

export interface MaintenanceWorkspace {
  id: string
  root: string
  coreId: string | null
  admin: boolean
  enabled: boolean
}

export interface MaintenanceAnalysisOptions {
  coreId: string | null
  workspaces: MaintenanceWorkspace[]
  citations: Set<string>
  stalePendingDays: number
  staleCitationDays: number
  now?: Date
  maxBodyBytes: number
  temporal?: TemporalPolicy
}

export interface MaintenanceIssue {
  code:
    | 'duplicate-exact'
    | 'duplicate-near'
    | 'promotion-candidate'
    | 'stale-pending'
    | 'uncited'
    | 'load-diagnostic'
    | 'oversized-body'
    | 'scope-mismatch'
    | 'expired'
    | 'aging'
  severity: 'info' | 'warn'
  message: string
  ids: string[]
}

export interface MaintenanceCandidate {
  kind: 'duplicate' | 'promotion'
  fingerprint: string
  issue: MaintenanceIssue
  input: ProposalInput
}

export interface MaintenanceWorkspaceStat {
  id: string
  accepted: number
  pending: number
}

export interface MaintenanceAnalysis {
  issues: MaintenanceIssue[]
  candidates: MaintenanceCandidate[]
  workspaceStats: MaintenanceWorkspaceStat[]
  totals: {
    knowledge: number
    pending: number
    accepted: number
    proposalsExisting: number
    fresh: number
    aging: number
    stale: number
    scheduled: number
  }
}

const PROMOTE_TAGS = new Set(['core', 'shared', 'reusable', 'promote'])
const NEAR_TITLE_THRESHOLD = 0.82

export function maintenanceToken(fingerprint: string): string {
  return `maint-${createHash('sha256').update(fingerprint).digest('hex').slice(0, 12)}`
}

export function analyzeMaintenance(store: KnowledgeStore, options: MaintenanceAnalysisOptions): MaintenanceAnalysis {
  const now = options.now ?? new Date()
  const nowMs = now.getTime()
  const accepted = [...store.docs.values()].filter((record) => record.status === 'accepted')
  const pending = [...store.proposals.values()].filter((proposal) => proposal.status === 'pending')
  const workspaceIds = new Set(options.workspaces.map((workspace) => workspace.id))
  const issues: MaintenanceIssue[] = []
  const candidates: MaintenanceCandidate[] = []
  const temporal = options.temporal ?? DEFAULT_TEMPORAL_POLICY
  const temporalCounts = { fresh: 0, aging: 0, stale: 0, scheduled: 0 }

  for (const record of accepted) {
    const state = temporalState(record, nowMs, temporal)
    temporalCounts[state] += 1
    if (state === 'stale') {
      issues.push({
        code: 'expired',
        severity: 'warn',
        message: `${record.id} 已于 ${record.expiresAt ?? '未知时间'} 到期，需要复核后更新 expires_at：${record.title}`,
        ids: [record.id],
      })
    } else if (state === 'aging') {
      issues.push({
        code: 'aging',
        severity: 'info',
        message: `${record.id} 已 ${Math.floor(ageDays(record.lastVerified ?? record.updatedAt, nowMs) ?? 0)} 天未确认：${record.title}`,
        ids: [record.id],
      })
    }
  }

  const duplicateGroups = new Map<string, KnowledgeRecord[]>()
  for (const record of accepted) {
    const key = [
      record.type,
      normalizeText(record.title),
      normalizeText(record.summary),
      sha256(record.body.trim()),
    ].join('|')
    const group = duplicateGroups.get(key) ?? []
    group.push(record)
    duplicateGroups.set(key, group)
  }

  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue
    const ordered = [...group].sort(
      (left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
    )
    const keeper = ordered[0]!
    for (const duplicate of ordered.slice(1)) {
      const fingerprint = `duplicate:${duplicate.id}@${duplicate.version}:${keeper.id}`
      const token = maintenanceToken(fingerprint)
      const issue: MaintenanceIssue = {
        code: 'duplicate-exact',
        severity: 'warn',
        message: `${duplicate.id} 与 ${keeper.id} 的标题、摘要和正文完全相同。`,
        ids: [duplicate.id, keeper.id],
      }
      issues.push(issue)
      candidates.push({
        kind: 'duplicate',
        fingerprint,
        issue,
        input: {
          operation: 'deprecate',
          type: duplicate.type,
          scope: formatScope(duplicate.scope),
          title: truncate(`[维护] 废弃重复：${duplicate.id}`, 200),
          summary: truncate(`${duplicate.id} 与 ${keeper.id} 完全相同，建议废弃重复项。`, 240),
          target: duplicate.id,
          expectedVersion: duplicate.version,
          reason: `exact duplicate of ${keeper.id}`,
          sourceRefs: [`note:maintenance duplicate ${duplicate.id}@v${duplicate.version} == ${keeper.id}@v${keeper.version}`],
          tags: mergeTags(duplicate.tags, ['maintenance', token, 'duplicate']),
          related: [keeper.id],
        },
      })
    }
  }

  const nearPairs = findNearDuplicateTitles(accepted)
  for (const [left, right] of nearPairs) {
    issues.push({
      code: 'duplicate-near',
      severity: 'info',
      message: `${left.id}（${left.title}）与 ${right.id}（${right.title}）标题高度相似，需人工判断是否合并。`,
      ids: [left.id, right.id],
    })
  }

  for (const proposal of pending) {
    const age = ageDays(proposal.createdAt, nowMs)
    if (age !== null && age >= options.stalePendingDays) {
      issues.push({
        code: 'stale-pending',
        severity: 'info',
        message: `${proposal.id} 已 pending ${age} 天：${proposal.title}`,
        ids: [proposal.id],
      })
    }
  }

  let uncited = 0
  for (const record of accepted) {
    if (options.citations.has(record.id)) continue
    const age = ageDays(record.updatedAt, nowMs)
    if (age === null || age < options.staleCitationDays) continue
    uncited += 1
    if (uncited > 20) continue
    issues.push({
      code: 'uncited',
      severity: 'info',
      message: `${record.id} 已 ${age} 天未被引用：${record.title}`,
      ids: [record.id],
    })
  }

  for (const diagnostic of store.diagnostics) {
    issues.push({
      code: 'load-diagnostic',
      severity: 'warn',
      message: `${diagnostic.path}: ${diagnostic.message}`,
      ids: [],
    })
  }

  for (const record of accepted) {
    if (Buffer.byteLength(record.body, 'utf8') > options.maxBodyBytes) {
      issues.push({
        code: 'oversized-body',
        severity: 'info',
        message: `${record.id} 正文超过 ${options.maxBodyBytes} bytes，建议拆分。`,
        ids: [record.id],
      })
    }
    if (record.scope.level === 'project' && !workspaceIds.has(record.scope.workspaceId)) {
      issues.push({
        code: 'scope-mismatch',
        severity: 'warn',
        message: `${record.id} 使用未注册作用域 project:${record.scope.workspaceId}。`,
        ids: [record.id],
      })
    }
  }

  const coreId = options.coreId
  if (coreId !== null) {
    const alreadyPromoted = new Set<string>()
    for (const record of store.docs.values()) {
      if (record.promotedFrom !== null) alreadyPromoted.add(record.promotedFrom)
    }
    for (const proposal of store.proposals.values()) {
      if (proposal.promotedFrom !== null) alreadyPromoted.add(proposal.promotedFrom)
    }
    const coreTitles = new Set(
      accepted
        .filter((record) => record.scope.level === 'project' && record.scope.workspaceId === coreId)
        .map((record) => `${normalizeText(record.title)}\u0000${normalizeText(record.summary)}`),
    )
    for (const record of accepted) {
      if (record.scope.level !== 'project' || record.scope.workspaceId === coreId) continue
      if (!record.tags.some((tag) => PROMOTE_TAGS.has(tag))) continue
      const key = `project:${record.scope.workspaceId}/${record.id}@${record.version}`
      if (alreadyPromoted.has(key)) continue
      if (coreTitles.has(`${normalizeText(record.title)}\u0000${normalizeText(record.summary)}`)) continue
      const fingerprint = `promotion:${key}`
      const token = maintenanceToken(fingerprint)
      const issue: MaintenanceIssue = {
        code: 'promotion-candidate',
        severity: 'info',
        message: `${record.id} 带有复用标记，可晋升到核心作用域。`,
        ids: [record.id],
      }
      candidates.push({
        kind: 'promotion',
        fingerprint,
        issue,
        input: {
          operation: 'create',
          type: record.type,
          scope: `project:${coreId}`,
          title: truncate(`[promoted] ${record.title}`, 200),
          summary: truncate(`[promoted] ${record.summary}`, 240),
          content: record.body,
          sourceRefs: [`note:${key}`, ...record.sourceRefs].slice(0, 20),
          tags: mergeTags(record.tags, ['maintenance', token, 'promoted']),
          related: record.related,
          promotedFrom: key,
        },
      })
    }
  }

  const workspaceStats: MaintenanceWorkspaceStat[] = options.workspaces.map((workspace) => ({
    id: workspace.id,
    accepted: accepted.filter(
      (record) => record.scope.level === 'project' && record.scope.workspaceId === workspace.id,
    ).length,
    pending: pending.filter(
      (proposal) => proposal.scope.level === 'project' && proposal.scope.workspaceId === workspace.id,
    ).length,
  }))

  candidates.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'duplicate' ? -1 : 1
    return left.fingerprint.localeCompare(right.fingerprint)
  })

  return {
    issues,
    candidates,
    workspaceStats,
    totals: {
      knowledge: store.docs.size,
      pending: pending.length,
      accepted: accepted.length,
      proposalsExisting: store.proposals.size,
      ...temporalCounts,
    },
  }
}

export function renderMaintenanceReport(input: {
  root: string
  coreId: string | null
  apply: MaintenanceApply
  analysis: MaintenanceAnalysis
  created: ProposalRecord[]
  skipped: number
  maxProposals: number
  reportPath: string | null
  generatedAt: string
}): string {
  const lines: string[] = [
    '# Memory Hub Maintenance',
    '',
    `- Generated: ${input.generatedAt}`,
    `- Mode: ${input.apply}`,
    `- Hub: ${input.root}`,
    `- Core: ${input.coreId ?? '(fallback)'}`,
    `- Report: ${input.reportPath ?? '(not written)'}`,
    '',
    '## Summary',
    '',
    `- knowledge: ${input.analysis.totals.knowledge} (accepted ${input.analysis.totals.accepted})`,
    `- pending: ${input.analysis.totals.pending}`,
    `- issues: ${input.analysis.issues.length}`,
    `- candidates: ${input.analysis.candidates.length}`,
    `- temporal: fresh ${input.analysis.totals.fresh} · aging ${input.analysis.totals.aging} · stale ${input.analysis.totals.stale} · scheduled ${input.analysis.totals.scheduled}`,
    `- proposals created: ${input.created.length}`,
    `- skipped (already pending): ${input.skipped}`,
    `- max proposals: ${input.maxProposals}`,
    '',
    '## Workspaces',
    '',
    '| workspace | accepted | pending |',
    '| --- | ---: | ---: |',
    ...input.analysis.workspaceStats.map((stat) => `| ${stat.id} | ${stat.accepted} | ${stat.pending} |`),
    '',
    '## Created proposals',
    '',
    ...(input.created.length === 0
      ? ['- none']
      : input.created.map(
          (proposal) =>
            `- ${proposal.id} · ${proposal.operation} · ${formatScope(proposal.scope)} · ${proposal.title}`,
        )),
    '',
    '## Issues',
    '',
  ]

  const byCode = new Map<string, MaintenanceIssue[]>()
  for (const issue of input.analysis.issues) {
    const list = byCode.get(issue.code) ?? []
    list.push(issue)
    byCode.set(issue.code, list)
  }
  if (byCode.size === 0) {
    lines.push('- none', '')
  } else {
    for (const [code, list] of [...byCode.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      lines.push(`### ${code} (${list.length})`, '')
      for (const issue of list.slice(0, 20)) lines.push(`- ${issue.message}`)
      if (list.length > 20) lines.push(`- (+${list.length - 20} more)`)
      lines.push('')
    }
  }

  lines.push(
    '## Guardrails',
    '',
    '- This report is not authoritative knowledge.',
    '- Proposals are pending; nothing was committed, deleted, or rewritten.',
    '- Exact duplicates become deprecate proposals; project knowledge is promoted only with an explicit reuse tag.',
    '- Expired entries are reported only: they are never deleted or rewritten automatically.',
    '- Review pending proposals in the Web panel or with memory_get, then commit intentionally.',
    '',
  )
  return lines.join('\n')
}

function findNearDuplicateTitles(records: KnowledgeRecord[]): Array<[KnowledgeRecord, KnowledgeRecord]> {
  const pairs: Array<[KnowledgeRecord, KnowledgeRecord]> = []
  for (let index = 0; index < records.length; index += 1) {
    const left = records[index]!
    const leftGrams = bigrams(left.title)
    for (let other = index + 1; other < records.length; other += 1) {
      const right = records[other]!
      if (left.type !== right.type) continue
      if (normalizeText(left.title) === normalizeText(right.title)) continue
      const score = jaccard(leftGrams, bigrams(right.title))
      if (score >= NEAR_TITLE_THRESHOLD) pairs.push([left, right])
    }
  }
  return pairs
}

function bigrams(value: string): Set<string> {
  const chars = Array.from(normalizeText(value))
  const grams = new Set<string>()
  if (chars.length < 2) {
    if (chars.length === 1) grams.add(chars[0]!)
    return grams
  }
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.add(`${chars[index]}${chars[index + 1]}`)
  }
  return grams
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const value of left) if (right.has(value)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function ageDays(value: string, nowMs: number): number | null {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return Math.floor((nowMs - timestamp) / 86_400_000)
}

function mergeTags(existing: string[], extra: string[]): string[] {
  return [...new Set([...extra, ...existing])].slice(0, 12)
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}
