import { describe, it, expect } from 'vitest'
import { normalizeGitHubUsage } from './github-billing'

describe('normalizeGitHubUsage', () => {
  const now = new Date('2026-06-15T00:00:00Z')
  const items = [
    { date: '2026-05-10', product: 'actions', sku: 'Actions Linux', netAmount: 10.0 },
    { date: '2026-06-01', product: 'actions', sku: 'Actions Linux', netAmount: 2.5 },
    { date: '2026-06-01', product: 'actions', sku: 'Actions macOS', netAmount: 1.0 },
    { date: '2026-06-05', product: 'actions', sku: 'Actions Linux', netAmount: 0.5 },
  ]

  it('aggregates daily usage items into months (in cents)', () => {
    const p = normalizeGitHubUsage(items, now)
    expect(p.provider).toBe('github')
    expect(p.configured).toBe(true)
    expect(p.monthToDateCents).toBe(400) // 250 + 100 + 50
    expect(p.lastFullMonthCents).toBe(1000) // May
    expect(p.trend).toEqual([
      { period: '2026-05', amountCents: 1000 },
      { period: '2026-06', amountCents: 400 },
    ])
  })

  it('breaks the current month down by SKU, largest first', () => {
    const p = normalizeGitHubUsage(items, now)
    expect(p.breakdown).toEqual([
      { name: 'Actions Linux', amountCents: 300 },
      { name: 'Actions macOS', amountCents: 100 },
    ])
  })

  it('treats free-tier usage (netAmount 0) as no spend', () => {
    // The plan's included quota arrives as grossAmount with a matching
    // discountAmount → netAmount 0. The card reports billed dollars only.
    const p = normalizeGitHubUsage(
      [{ date: '2026-06-02', product: 'actions', sku: 'Actions Linux', netAmount: 0 }],
      now,
    )
    expect(p.monthToDateCents).toBe(0)
    expect(p.trend).toEqual([])
    expect(p.breakdown).toEqual([])
  })

  it('skips items with missing or unparseable dates / amounts', () => {
    const p = normalizeGitHubUsage(
      [
        { product: 'actions', sku: 'Actions Linux', netAmount: 5 }, // no date
        { date: 'not-a-date', sku: 'Actions Linux', netAmount: 5 },
        { date: '2026-06-02', sku: 'Actions Linux' }, // no amount
      ],
      now,
    )
    expect(p.monthToDateCents).toBe(0)
    expect(p.breakdown).toEqual([])
  })

  it('sums sub-cent per-minute rows in dollars before converting to cents', () => {
    // Actions bills per minute (e.g. $0.008/min) — summing row-by-row in cents
    // would round every row to 1¢ or 0¢ and drift.
    const rows = Array.from({ length: 30 }, () => ({
      date: '2026-06-03',
      product: 'actions',
      sku: 'Actions Linux',
      netAmount: 0.008,
    }))
    const p = normalizeGitHubUsage(rows, now)
    expect(p.monthToDateCents).toBe(24) // 30 × $0.008 = $0.24
    expect(p.breakdown).toEqual([{ name: 'Actions Linux', amountCents: 24 }])
  })

  it('falls back to product, then "Other", when sku is absent', () => {
    const p = normalizeGitHubUsage(
      [
        { date: '2026-06-04', product: 'packages', netAmount: 1 },
        { date: '2026-06-04', netAmount: 2 },
      ],
      now,
    )
    expect(p.breakdown).toEqual([
      { name: 'Other', amountCents: 200 },
      { name: 'packages', amountCents: 100 },
    ])
  })
})
