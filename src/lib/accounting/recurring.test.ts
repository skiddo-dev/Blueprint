import { describe, it, expect } from 'vitest'
import { advanceDate, describeCadence } from './recurring'

describe('advanceDate', () => {
  it('monthly steps clamp to short months', () => {
    expect(advanceDate('2026-01-31', { unit: 'month', interval: 1 })).toBe('2026-02-28')
    expect(advanceDate('2024-01-31', { unit: 'month', interval: 1 })).toBe('2024-02-29') // leap year
    expect(advanceDate('2026-01-15', { unit: 'month', interval: 1 })).toBe('2026-02-15')
    expect(advanceDate('2026-11-30', { unit: 'month', interval: 3 })).toBe('2027-02-28') // across the year
  })
  it('weekly steps are exact 7-day multiples', () => {
    expect(advanceDate('2026-06-01', { unit: 'week', interval: 1 })).toBe('2026-06-08')
    expect(advanceDate('2026-06-01', { unit: 'week', interval: 2 })).toBe('2026-06-15')
  })
  it('non-positive or fractional intervals are normalized to at least 1', () => {
    expect(advanceDate('2026-06-01', { unit: 'month', interval: 0 })).toBe('2026-07-01')
    expect(advanceDate('2026-06-01', { unit: 'week', interval: 1.9 })).toBe('2026-06-08')
  })
})

describe('describeCadence', () => {
  it('reads naturally', () => {
    expect(describeCadence({ unit: 'month', interval: 1 })).toBe('every month')
    expect(describeCadence({ unit: 'week', interval: 2 })).toBe('every 2 weeks')
  })
})
