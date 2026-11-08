import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TEMPORAL_POLICY,
  temporalAnnotation,
  temporalDecay,
  temporalState,
  temporalStateFromTimes,
  temporalTimesOf,
} from '../src/temporal.js'
import type { TemporalState } from '../src/types.js'

const NOW = Date.parse('2026-11-08T12:00:00Z')

function record(overrides: {
  validFrom?: string | null
  expiresAt?: string | null
  lastVerified?: string | null
  updatedAt?: string
} = {}) {
  return {
    validFrom: null,
    expiresAt: null,
    lastVerified: null,
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}

describe('temporal state', () => {
  it('treats an unannotated record as fresh', () => {
    expect(temporalState(record(), NOW)).toBe('fresh')
  })

  it('marks a record stale once expires_at has passed', () => {
    expect(temporalState(record({ expiresAt: '2026-11-08T11:59:59Z' }), NOW)).toBe('stale')
    expect(temporalState(record({ expiresAt: '2026-12-01T00:00:00Z' }), NOW)).toBe('fresh')
  })

  it('keeps not-yet-valid records scheduled', () => {
    expect(temporalState(record({ validFrom: '2026-12-01T00:00:00Z' }), NOW)).toBe('scheduled')
    expect(temporalState(record({ validFrom: '2026-10-01T00:00:00Z' }), NOW)).toBe('fresh')
  })

  it('ages records by last_verified, falling back to updated_at', () => {
    expect(temporalState(record({ lastVerified: '2026-07-01T00:00:00Z' }), NOW)).toBe('aging')
    expect(temporalState(record({ updatedAt: '2026-07-01T00:00:00Z' }), NOW)).toBe('aging')
    // A recent confirmation overrides an old updated_at.
    expect(temporalState(record({ lastVerified: '2026-11-05T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }), NOW)).toBe('fresh')
    // The default window is 90 days: 89 days is still fresh.
    expect(temporalState(record({ lastVerified: '2026-08-11T12:00:00Z' }), NOW)).toBe('fresh')
  })

  it('prefers stale over scheduled when both dates contradict', () => {
    const state = temporalState(record({ validFrom: '2026-12-01T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z' }), NOW)
    expect(state).toBe('stale')
  })

  it('honors a custom aging window', () => {
    const policy = { ...DEFAULT_TEMPORAL_POLICY, aging_days: 7 }
    expect(temporalState(record({ lastVerified: '2026-10-20T00:00:00Z' }), NOW, policy)).toBe('aging')
    expect(temporalState(record({ lastVerified: '2026-11-05T00:00:00Z' }), NOW, policy)).toBe('fresh')
  })

  it('parses timestamps once and yields the same state as the record-based helper', () => {
    const cases = [
      record(),
      record({ expiresAt: '2026-11-01T00:00:00Z' }),
      record({ validFrom: '2026-12-01T00:00:00Z' }),
      record({ lastVerified: '2026-01-01T00:00:00Z' }),
      record({ expiresAt: 'not-a-date', validFrom: 'also-bad' }),
    ]
    for (const item of cases) {
      expect(temporalStateFromTimes(temporalTimesOf(item), NOW)).toBe(temporalState(item, NOW))
    }
    // 无法解析的时间按「未标注」处理，而不是抛错。
    expect(temporalStateFromTimes(temporalTimesOf(record({ expiresAt: 'not-a-date' })), NOW)).toBe('fresh')
  })
})

describe('temporal decay', () => {
  it('maps states to multipliers', () => {
    expect(temporalDecay('fresh')).toBe(1)
    expect(temporalDecay('aging')).toBe(0.85)
    expect(temporalDecay('stale')).toBe(0.6)
    expect(temporalDecay('scheduled')).toBe(0.3)
  })

  it('can be disabled with 1.0 so old entries rank exactly as before', () => {
    const policy = { ...DEFAULT_TEMPORAL_POLICY, aging_decay: 1 }
    expect(temporalDecay('aging', policy)).toBe(1)
  })
})

describe('temporal annotation', () => {
  it('explains non-fresh states and stays quiet for fresh ones', () => {
    const states: TemporalState[] = ['fresh', 'aging', 'stale', 'scheduled']
    const notes = states.map((state) => temporalAnnotation(record(), state))
    expect(notes[0]).toBeNull()
    expect(notes[1]).toContain('90')
    expect(notes[2]).toContain('需复核')
    expect(notes[3]).toContain('尚未生效')
  })
})
