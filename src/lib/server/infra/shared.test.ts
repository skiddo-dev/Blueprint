import { describe, it, expect } from 'vitest'
import { monthKey, monthsBackStart, topBreakdown, emptyProvider } from './shared'

describe('monthKey', () => {
  it('formats a date as its UTC YYYY-MM', () => {
    expect(monthKey(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06')
    expect(monthKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })
})

describe('monthsBackStart', () => {
  it('returns the start of the UTC month n months back', () => {
    const now = new Date('2026-06-15T12:00:00Z')
    expect(monthsBackStart(now, 0).toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(monthsBackStart(now, 5).toISOString()).toBe('2026-01-01T00:00:00.000Z')
    // Crosses a year boundary correctly.
    expect(monthsBackStart(now, 6).toISOString()).toBe('2025-12-01T00:00:00.000Z')
  })
})

describe('topBreakdown', () => {
  it('ranks largest first, drops zeros, and caps at the limit', () => {
    const m = new Map([['a', 100], ['b', 300], ['c', 0], ['d', 200]])
    expect(topBreakdown(m, 2)).toEqual([
      { name: 'b', amountCents: 300 },
      { name: 'd', amountCents: 200 },
    ])
  })
  it('breaks ties by name', () => {
    const m = new Map([['z', 100], ['a', 100]])
    expect(topBreakdown(m).map((l) => l.name)).toEqual(['a', 'z'])
  })
})

describe('emptyProvider', () => {
  it('hint → not configured', () => {
    const p = emptyProvider('atlas', 'MongoDB Atlas', { hint: 'set keys' })
    expect(p.configured).toBe(false)
    expect(p.error).toBe('set keys')
    expect(p.monthToDateCents).toBe(0)
  })
  it('error → configured but failed', () => {
    const p = emptyProvider('azure', 'Azure', { error: 'boom' })
    expect(p.configured).toBe(true)
    expect(p.error).toBe('boom')
  })
})
