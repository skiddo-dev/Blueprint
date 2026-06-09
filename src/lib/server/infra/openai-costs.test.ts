import { describe, it, expect } from 'vitest'
import { normalizeOpenAiCosts } from './openai-costs'

const ts = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 1000)

describe('normalizeOpenAiCosts', () => {
  const now = new Date('2026-06-15T00:00:00Z')
  const buckets = [
    { start_time: ts(2026, 5, 10), results: [{ amount: { value: 10.0 }, line_item: 'gpt-4o-mini' }] },
    {
      start_time: ts(2026, 6, 1),
      results: [
        { amount: { value: 2.5 }, line_item: 'gpt-4o-mini' },
        { amount: { value: 1.0 }, line_item: 'gpt-4o' },
      ],
    },
    { start_time: ts(2026, 6, 5), results: [{ amount: { value: 0.5 }, line_item: 'gpt-4o-mini' }] },
  ]

  it('aggregates daily buckets into months (in cents)', () => {
    const p = normalizeOpenAiCosts(buckets, now)
    expect(p.provider).toBe('openai')
    expect(p.configured).toBe(true)
    expect(p.monthToDateCents).toBe(400) // 250 + 100 + 50
    expect(p.lastFullMonthCents).toBe(1000) // May
    expect(p.trend).toEqual([
      { period: '2026-05', amountCents: 1000 },
      { period: '2026-06', amountCents: 400 },
    ])
  })

  it('breaks the current month down by line item, largest first', () => {
    const p = normalizeOpenAiCosts(buckets, now)
    expect(p.breakdown).toEqual([
      { name: 'gpt-4o-mini', amountCents: 300 },
      { name: 'gpt-4o', amountCents: 100 },
    ])
  })

  it('skips non-numeric amounts', () => {
    const p = normalizeOpenAiCosts(
      [{ start_time: ts(2026, 6, 2), results: [{ amount: {}, line_item: 'x' }] }],
      now,
    )
    expect(p.monthToDateCents).toBe(0)
    expect(p.breakdown).toEqual([])
  })

  it('coerces STRING amounts (the live API returns value as a string) and sums sub-cent rows', () => {
    // Regression: the costs endpoint returns amount.value like "0.11567415".
    // A `typeof v === 'number'` guard would drop every row → $0.00.
    const p = normalizeOpenAiCosts(
      [
        {
          start_time: ts(2026, 6, 3),
          results: [
            { amount: { value: '0.11567415' }, line_item: 'gpt-4o-mini' },
            { amount: { value: '0.0908175' }, line_item: 'gpt-4o-mini' },
            { amount: { value: '0.007756' }, line_item: 'gpt-3.5-turbo' },
          ],
        },
      ],
      now,
    )
    // dollars summed first, then → cents: total 0.21424765 → 21¢
    expect(p.monthToDateCents).toBe(21)
    // gpt-4o-mini 0.20649165 → 21¢ (NOT lost to per-row rounding); 3.5 → 1¢
    expect(p.breakdown).toEqual([
      { name: 'gpt-4o-mini', amountCents: 21 },
      { name: 'gpt-3.5-turbo', amountCents: 1 },
    ])
  })
})
