import { describe, expect, it } from 'vitest'
import { cents, type Cents } from '$lib/money'
import { poStatus, poTotal, remainingLines, poNumber } from './purchaseOrders'
import type { BillLine } from './types'

const C = (n: number) => cents(n)
const lines: BillLine[] = [
  { account_id: '5000', description: 'materials', amount: C(30000) },
  { account_id: '5010', description: 'subs', amount: C(10000) },
]

describe('poStatus', () => {
  it('walks open → partially-billed → closed as billing accumulates', () => {
    expect(poStatus(C(40000), C(0))).toBe('open')
    expect(poStatus(C(40000), C(15000))).toBe('partially-billed')
    expect(poStatus(C(40000), C(40000))).toBe('closed')
    expect(poStatus(C(40000), C(45000))).toBe('closed') // over-billed caps at closed
  })

  it('manual close and cancel override', () => {
    expect(poStatus(C(40000), C(100), { manuallyClosed: true })).toBe('closed')
    expect(poStatus(C(40000), C(0), { cancelled: true })).toBe('cancelled')
  })
})

describe('remainingLines', () => {
  it('returns the original lines untouched when nothing is billed', () => {
    expect(remainingLines(lines, C(40000), C(0))).toEqual(lines)
  })

  it('scales lines to the remaining fraction and sums exactly', () => {
    const rem = remainingLines(lines, C(40000), C(15000))
    expect(rem.reduce((s, l) => s + l.amount, 0)).toBe(25000)
    expect(rem[0].amount).toBeGreaterThan(rem[1].amount) // proportions kept
  })

  it('handles odd pennies without losing a cent', () => {
    const odd: BillLine[] = [
      { account_id: '5000', description: 'a', amount: C(3333) },
      { account_id: '5010', description: 'b', amount: C(3333) },
      { account_id: '5020', description: 'c', amount: C(3335) },
    ]
    const total = poTotal(odd)
    const rem = remainingLines(odd, total, C(5000))
    expect(rem.reduce((s, l) => s + l.amount, 0)).toBe(total - 5000)
  })

  it('is empty once fully billed or over-billed', () => {
    expect(remainingLines(lines, C(40000), C(40000))).toEqual([])
    expect(remainingLines(lines, C(40000), C(50000) as Cents)).toEqual([])
  })
})

describe('poNumber', () => {
  it('formats the per-year sequence', () => {
    expect(poNumber({ year: 2026, number: 7 })).toBe('PO-2026-0007')
  })
})
