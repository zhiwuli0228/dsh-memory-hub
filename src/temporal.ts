import type { KnowledgeRecord, TemporalState } from './types.js'

/**
 * 时效策略。全部是确定性数值，不依赖模型判断：
 * - aging_days：多久没确认算「陈旧」；
 * - *_decay：检索时乘在分数上的系数（1 表示不降权）。
 */
export interface TemporalPolicy {
  aging_days: number
  aging_decay: number
  stale_decay: number
  scheduled_decay: number
}

export const DEFAULT_TEMPORAL_POLICY: TemporalPolicy = {
  aging_days: 90,
  aging_decay: 0.85,
  stale_decay: 0.6,
  scheduled_decay: 0.3,
}

const DAY_MS = 86_400_000

/** 解析时间；无效值返回 null，调用方按「未标注」处理。 */
function parseTime(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * 计算派生时效状态。优先级：stale > scheduled > aging > fresh。
 * 未来生效的条目同时已过期属于配置矛盾，按 stale 处理（更保守：提醒复核）。
 */
export function temporalState(
  record: Pick<KnowledgeRecord, 'validFrom' | 'expiresAt' | 'lastVerified' | 'updatedAt'>,
  nowMs: number,
  policy: TemporalPolicy = DEFAULT_TEMPORAL_POLICY,
): TemporalState {
  const expiresAt = parseTime(record.expiresAt)
  if (expiresAt !== null && nowMs >= expiresAt) return 'stale'

  const validFrom = parseTime(record.validFrom)
  if (validFrom !== null && nowMs < validFrom) return 'scheduled'

  const lastVerified = parseTime(record.lastVerified) ?? parseTime(record.updatedAt)
  if (lastVerified !== null && nowMs - lastVerified >= policy.aging_days * DAY_MS) return 'aging'

  return 'fresh'
}

/** 状态对应的检索降权系数。 */
export function temporalDecay(state: TemporalState, policy: TemporalPolicy = DEFAULT_TEMPORAL_POLICY): number {
  switch (state) {
    case 'stale':
      return policy.stale_decay
    case 'aging':
      return policy.aging_decay
    case 'scheduled':
      return policy.scheduled_decay
    case 'fresh':
      return 1
  }
}

/** `/api/overview` 与 `memory_get` 元数据用的人读注解；无标注时返回 null。 */
export function temporalAnnotation(
  record: Pick<KnowledgeRecord, 'validFrom' | 'expiresAt' | 'lastVerified' | 'updatedAt'>,
  state: TemporalState,
  policy: TemporalPolicy = DEFAULT_TEMPORAL_POLICY,
): string | null {
  if (state === 'stale') return `需复核：已于 ${record.expiresAt ?? '未知'} 到期`
  if (state === 'scheduled') return `尚未生效：自 ${record.validFrom ?? '未知'} 起`
  if (state === 'aging') {
    const basis = record.lastVerified ?? record.updatedAt
    return `长期未确认：上次确认 ${basis}（阈值 ${policy.aging_days} 天）`
  }
  return null
}
