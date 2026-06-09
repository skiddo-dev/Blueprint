import { describe, it, expect } from 'vitest'
import { normalizeAtlasUsage } from './atlas-billing'

describe('normalizeAtlasUsage', () => {
  const now = new Date('2026-06-15T00:00:00Z')

  it('sums current-month usage (dollars → cents) — the empty pending invoice is bypassed', () => {
    // Cost Explorer reports the accrued $3.24 the Invoices API still shows as $0.
    const p = normalizeAtlasUsage(
      [{ usageAmount: 3.24, usageDate: '2026-06-01' }],
      [{ usageAmount: 3.24, usageDate: '2026-06-01' }],
      now,
    )
    expect(p.provider).toBe('atlas')
    expect(p.monthToDateCents).toBe(324)
  })

  it('falls back to a single "MongoDB Atlas" breakdown line when ungrouped', () => {
    const p = normalizeAtlasUsage([{ usageAmount: 3.24, usageDate: '2026-06-01' }], [], now)
    expect(p.breakdown).toEqual([{ name: 'MongoDB Atlas', amountCents: 324 }])
  })

  it('uses the service label when Cost Explorer groups by service', () => {
    const p = normalizeAtlasUsage(
      [
        { usageAmount: 2.0, usageDate: '2026-06-01', service: 'Clusters' },
        { usageAmount: 1.24, usageDate: '2026-06-01', service: 'Data Transfer' },
      ],
      [],
      now,
    )
    expect(p.monthToDateCents).toBe(324)
    expect(p.breakdown).toEqual([
      { name: 'Clusters', amountCents: 200 },
      { name: 'Data Transfer', amountCents: 124 },
    ])
  })

  it('buckets the trend by usageDate month and resolves last full month', () => {
    const p = normalizeAtlasUsage(
      [],
      [
        { usageAmount: 5.0, usageDate: '2026-05-01' },
        { usageAmount: 3.24, usageDate: '2026-06-01' },
      ],
      now,
    )
    expect(p.trend).toEqual([
      { period: '2026-05', amountCents: 500 },
      { period: '2026-06', amountCents: 324 },
    ])
    expect(p.lastFullMonthCents).toBe(500)
  })

  it('empty usage → $0 and an empty breakdown', () => {
    const p = normalizeAtlasUsage([], [], now)
    expect(p.monthToDateCents).toBe(0)
    expect(p.breakdown).toEqual([])
    expect(p.trend).toEqual([])
  })
})
