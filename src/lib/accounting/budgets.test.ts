import { describe, expect, it } from 'vitest'
import { cents } from '$lib/money'
import type { Account } from './types'
import type { PeriodBalance } from './statements'
import { budgetVsActual, validateBudgetAmounts, type BudgetDoc } from './budgets'

const ACCOUNTS = [
  { _id: '4000', code: '4000', name: 'Contract Revenue', type: 'income', normal: 'credit', active: true },
  { _id: '4900', code: '4900', name: 'Sales Discounts & Credits', type: 'income', normal: 'debit', contra: true, active: true },
  { _id: '6100', code: '6100', name: 'Rent', type: 'expense', normal: 'debit', subtype: 'opex', active: true },
  { _id: '1000', code: '1000', name: 'Cash', type: 'asset', normal: 'debit', subtype: 'bank', active: true },
] as Account[]

const pb = (period: string, account_id: string, debit: number, credit: number): PeriodBalance =>
  ({ period, account_id, debit: cents(debit), credit: cents(credit) }) as PeriodBalance

const budget = (amounts: Record<string, number[]>): BudgetDoc =>
  ({ _id: '2026', year: 2026, amounts, updated_at: '' })

const flat = (monthly: number) => new Array(12).fill(monthly)

describe('budgetVsActual', () => {
  it('computes favorable variance in both directions', () => {
    const period = [
      pb('2026-01', '4000', 0, 120000), // revenue $1,200 vs $1,000 budget → favorable +200
      pb('2026-01', '6100', 60000, 0),  // rent $600 vs $500 budget → unfavorable −100
    ]
    const { rows } = budgetVsActual(period, budget({ '4000': flat(100000), '6100': flat(50000) }), ACCOUNTS, 2026, 1)
    const rev = rows.find((r) => r.account_id === '4000')!
    const rent = rows.find((r) => r.account_id === '6100')!
    expect(rev.varianceYtd).toBe(20000)
    expect(rent.varianceYtd).toBe(-10000)
  })

  it('nets contra income (4900) against revenue sign-correctly', () => {
    const period = [pb('2026-02', '4900', 5000, 0)] // credit memos reduce income
    const { rows, totals } = budgetVsActual(period, budget({}), ACCOUNTS, 2026, 2)
    expect(rows.find((r) => r.account_id === '4900')!.actual[1]).toBe(-5000)
    expect(totals.income.actualYtd).toBe(-5000)
  })

  it('YTD cutoff ignores months past `through`', () => {
    const period = [pb('2026-01', '4000', 0, 10000), pb('2026-06', '4000', 0, 99999)]
    const { rows } = budgetVsActual(period, budget({ '4000': flat(10000) }), ACCOUNTS, 2026, 3)
    const rev = rows.find((r) => r.account_id === '4000')!
    expect(rev.actualYtd).toBe(10000)        // June ignored
    expect(rev.budgetYtd).toBe(30000)        // 3 months of budget
  })

  it('missing budget doc → zero budgets; other years and non-P&L accounts ignored', () => {
    const period = [pb('2025-12', '4000', 0, 7777), pb('2026-01', '1000', 5000, 0)]
    const { rows } = budgetVsActual(period, null, ACCOUNTS, 2026, 12)
    expect(rows).toHaveLength(0)
  })
})

describe('validateBudgetAmounts', () => {
  it('accepts a clean grid and rejects bad rows', () => {
    expect(validateBudgetAmounts({ '4000': flat(100) }, ACCOUNTS)).toEqual([])
    expect(validateBudgetAmounts({ '9999': flat(100) }, ACCOUNTS)[0]).toMatch('unknown')
    expect(validateBudgetAmounts({ '1000': flat(100) }, ACCOUNTS)[0]).toMatch('not an income/expense')
    expect(validateBudgetAmounts({ '4000': [1, 2] }, ACCOUNTS)[0]).toMatch('12 monthly')
    expect(validateBudgetAmounts({ '4000': flat(-5) }, ACCOUNTS)[0]).toMatch('non-negative')
  })
})
