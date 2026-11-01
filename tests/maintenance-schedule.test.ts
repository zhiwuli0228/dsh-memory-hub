import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../src/config.js'
import { localDateKey, localTimeKey, maintenanceDue } from '../src/maintenance-schedule.js'

describe('maintenance schedule helpers', () => {
  it('formats local date and time keys with padding', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5)
    expect(localDateKey(date)).toBe('2026-01-02')
    expect(localTimeKey(date)).toBe('03:04')
  })

  it('defaults the nightly maintenance timer to disabled', () => {
    expect(defaultConfig().policy.maintenance).toMatchObject({
      enabled: false,
      time: '03:00',
      apply: 'propose',
      all_cores: true,
    })
  })

  it('runs at or after the configured local time', () => {
    expect(maintenanceDue('03:00', new Date(2026, 5, 1, 2, 59))).toBe(false)
    expect(maintenanceDue('03:00', new Date(2026, 5, 1, 3, 0))).toBe(true)
    expect(maintenanceDue('03:00', new Date(2026, 5, 1, 23, 59))).toBe(true)
  })
})
