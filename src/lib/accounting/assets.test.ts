import { describe, expect, it } from 'vitest'
import { cents } from '$lib/money'
import { depreciationSchedule, periodsToPost, depreciationLines, disposalLines, monthEndISO, nextPeriod, ASSET_ACCT } from './assets'
import { isBalanced } from './ledger'

const C = (n: number) => cents(n)

describe('depreciationSchedule', () => {
  it('sums exactly to cost − salvage across odd pennies', () => {
    // $36,001 − $1 salvage over 36 months: 3,600,000¢ / 36 = clean 100,000;
    // make it gnarly instead: $10,000 − $1 over 36 → 999,900¢... use a truly odd base
    const rows = depreciationSchedule({ in_service: '2026-01', cost: C(1000001), salvage: C(100), life_months: 36 })
    expect(rows).toHaveLength(36)
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(1000001 - 100)
    expect(rows.at(-1)!.accumulated).toBe(1000001 - 100)
    expect(rows[0].period).toBe('2026-01')
    expect(rows.at(-1)!.period).toBe('2028-12')
  })

  it('is empty when salvage ≥ cost or life ≤ 0', () => {
    expect(depreciationSchedule({ in_service: '2026-01', cost: C(100), salvage: C(100), life_months: 12 })).toEqual([])
    expect(depreciationSchedule({ in_service: '2026-01', cost: C(100), salvage: C(0), life_months: 0 })).toEqual([])
  })
})

describe('periodsToPost', () => {
  const a = { in_service: '2026-01', cost: C(120000), salvage: C(0), life_months: 12 }
  it('respects posted_through and the through cap', () => {
    expect(periodsToPost({ ...a }, '2026-03').map((p) => p.period)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(periodsToPost({ ...a, posted_through: '2026-02' }, '2026-05').map((p) => p.period)).toEqual(['2026-03', '2026-04', '2026-05'])
  })
  it('caps at the schedule end and no-ops before in_service', () => {
    expect(periodsToPost({ ...a, posted_through: '2026-12' }, '2027-06')).toEqual([])
    expect(periodsToPost(a, '2025-12')).toEqual([])
  })
})

describe('lines builders', () => {
  it('depreciationLines balance Dr 6160 / Cr 1510', () => {
    const l = depreciationLines(C(10000))
    expect(isBalanced(l)).toBe(true)
    expect(l[0].account_id).toBe(ASSET_ACCT.expense)
    expect(l[1].account_id).toBe(ASSET_ACCT.accumulated)
  })

  it('disposal: gain, loss, and break-even all balance with the right 4950 side', () => {
    // cost 1000, accum 800, proceeds 300 → gain 100 (credit 4950)
    const gain = disposalLines({ cost: C(100000), accumulated: C(80000), proceeds: C(30000), assetAccount: '1500' })
    expect(isBalanced(gain)).toBe(true)
    expect(gain.find((l) => l.account_id === '4950')?.credit).toBe(10000)
    // proceeds 100 → loss 100 (debit 4950)
    const loss = disposalLines({ cost: C(100000), accumulated: C(80000), proceeds: C(10000), assetAccount: '1500' })
    expect(isBalanced(loss)).toBe(true)
    expect(loss.find((l) => l.account_id === '4950')?.debit).toBe(10000)
    // proceeds 200 → break-even, no 4950 line
    const even = disposalLines({ cost: C(100000), accumulated: C(80000), proceeds: C(20000), assetAccount: '1500' })
    expect(isBalanced(even)).toBe(true)
    expect(even.some((l) => l.account_id === '4950')).toBe(false)
    // zero proceeds early disposal → big loss, no cash line
    const early = disposalLines({ cost: C(100000), accumulated: C(20000), proceeds: C(0), assetAccount: '1500' })
    expect(isBalanced(early)).toBe(true)
    expect(early.some((l) => l.account_id === '1000')).toBe(false)
    expect(early.find((l) => l.account_id === '4950')?.debit).toBe(80000)
  })
})

describe('period helpers', () => {
  it('nextPeriod rolls the year; monthEndISO handles leap years', () => {
    expect(nextPeriod('2026-12')).toBe('2027-01')
    expect(monthEndISO('2026-02')).toBe('2026-02-28')
    expect(monthEndISO('2028-02')).toBe('2028-02-29')
    expect(monthEndISO('2026-04')).toBe('2026-04-30')
  })
})
