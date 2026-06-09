import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { incomeStatement, balanceSheet, isPeriodClosed, monthlyActivity, type Balance } from './statements'
import type { Account } from './types'

// A small chart covering each type + a contra account in each direction.
const accounts: Account[] = [
  { _id: '1000', code: '1000', name: 'Cash', type: 'asset', normal: 'debit', active: true },
  { _id: '1100', code: '1100', name: 'A/R', type: 'asset', normal: 'debit', active: true },
  { _id: '1510', code: '1510', name: 'Accum. Depreciation', type: 'asset', normal: 'credit', contra: true, active: true },
  { _id: '2000', code: '2000', name: 'A/P', type: 'liability', normal: 'credit', active: true },
  { _id: '3000', code: '3000', name: "Owner's Equity", type: 'equity', normal: 'credit', active: true },
  { _id: '3200', code: '3200', name: "Owner's Draw", type: 'equity', normal: 'debit', contra: true, active: true },
  { _id: '4000', code: '4000', name: 'Contract Revenue', type: 'income', normal: 'credit', active: true },
  { _id: '4900', code: '4900', name: 'Sales Discounts', type: 'income', normal: 'debit', contra: true, active: true },
  { _id: '5000', code: '5000', name: 'Job Materials', type: 'expense', normal: 'debit', subtype: 'cogs', active: true },
  { _id: '6100', code: '6100', name: 'Rent', type: 'expense', normal: 'debit', subtype: 'opex', active: true },
]

const bal = (account_id: string, debit: number, credit: number): Balance =>
  ({ account_id, debit: cents(debit), credit: cents(credit) })

describe('incomeStatement', () => {
  it('computes revenue (net of contra), COGS, gross profit, opex, net income', () => {
    const balances = [
      bal('4000', 0, 10000),  // revenue 10,000
      bal('4900', 500, 0),    // contra-revenue (discount) reduces revenue by 500
      bal('5000', 3000, 0),   // COGS 3,000
      bal('6100', 2000, 0),   // opex 2,000
    ]
    const pl = incomeStatement(balances, accounts)
    expect(pl.revenue.total).toBe(9500)   // 10000 − 500
    expect(pl.cogs.total).toBe(3000)
    expect(pl.grossProfit).toBe(6500)     // 9500 − 3000
    expect(pl.expenses.total).toBe(2000)
    expect(pl.netIncome).toBe(4500)       // 6500 − 2000
    // COGS and opex are separated by subtype.
    expect(pl.cogs.lines.map((l) => l.account_id)).toEqual(['5000'])
    expect(pl.expenses.lines.map((l) => l.account_id)).toEqual(['6100'])
  })
  it('skips accounts with no activity', () => {
    const pl = incomeStatement([bal('4000', 0, 1000)], accounts)
    expect(pl.revenue.lines).toHaveLength(1)
    expect(pl.cogs.lines).toHaveLength(0)
    expect(pl.expenses.lines).toHaveLength(0)
  })
})

describe('balanceSheet', () => {
  it('balances: Assets = Liabilities + Equity (incl. net income)', () => {
    // A consistent (balancing) trial balance: ΣDr = ΣCr = 6000.
    const balances = [
      bal('1000', 5000, 0),  // cash
      bal('1100', 1000, 0),  // A/R
      bal('2000', 0, 2000),  // A/P
      bal('3000', 0, 1000),  // owner's equity
      bal('4000', 0, 4000),  // revenue
      bal('5000', 1000, 0),  // COGS
    ]
    const bs = balanceSheet(balances, accounts)
    expect(bs.assets.total).toBe(6000)                // 5000 + 1000
    expect(bs.liabilities.total).toBe(2000)
    expect(bs.netIncome).toBe(3000)                   // revenue 4000 − COGS 1000
    expect(bs.equity.total).toBe(4000)                // owner's equity 1000 + net income 3000
    expect(bs.totalLiabilitiesAndEquity).toBe(6000)
    expect(bs.balanced).toBe(true)
  })
  it('nets contra accounts the right way (accum. deprec reduces assets, draw reduces equity)', () => {
    const balances = [
      bal('1000', 10000, 0),   // cash
      bal('1510', 0, 1000),    // accumulated depreciation (contra-asset) → −1000
      bal('3000', 0, 9300),    // owner's equity
      bal('3200', 300, 0),     // owner's draw (contra-equity) → −300
    ]
    const bs = balanceSheet(balances, accounts)
    expect(bs.assets.total).toBe(9000)   // 10000 − 1000
    expect(bs.netIncome).toBe(0)
    expect(bs.equity.total).toBe(9000)   // 9300 − 300 + 0
    expect(bs.balanced).toBe(true)
  })
})

describe('isPeriodClosed', () => {
  it('is true only for dates on/before the close-through date', () => {
    expect(isPeriodClosed('2026-05-31', '2026-05-31')).toBe(true)
    expect(isPeriodClosed('2026-05-15', '2026-05-31')).toBe(true)
    expect(isPeriodClosed('2026-06-01', '2026-05-31')).toBe(false)
    expect(isPeriodClosed('2026-05-15', null)).toBe(false)
    expect(isPeriodClosed('2026-05-15', undefined)).toBe(false)
  })
})

describe('monthlyActivity', () => {
  // Local chart: monthlyActivity also needs a bank-subtype account for cash flow.
  const acc: Account[] = [
    { _id: '1000', code: '1000', name: 'Cash — Operating', type: 'asset', normal: 'debit', subtype: 'bank', active: true },
    { _id: '1100', code: '1100', name: 'A/R', type: 'asset', normal: 'debit', subtype: 'receivable', active: true },
    { _id: '4000', code: '4000', name: 'Contract Revenue', type: 'income', normal: 'credit', active: true },
    { _id: '4900', code: '4900', name: 'Sales Discounts', type: 'income', normal: 'debit', contra: true, active: true },
    { _id: '5000', code: '5000', name: 'Job Materials', type: 'expense', normal: 'debit', subtype: 'cogs', active: true },
    { _id: '6100', code: '6100', name: 'Rent', type: 'expense', normal: 'debit', subtype: 'opex', active: true },
  ]
  const row = (period: string, account_id: string, debit: number, credit: number) =>
    ({ period, account_id, debit: cents(debit), credit: cents(credit) })

  it('buckets revenue, expenses (COGS+opex), net and bank movement by month, sorted', () => {
    const rows = [
      // Feb listed before Jan to prove sorting.
      row('2026-02', '4000', 0, 8000),
      row('2026-02', '5000', 2500, 0),
      row('2026-02', '1000', 6000, 500),
      row('2026-01', '4000', 0, 10000),
      row('2026-01', '4900', 500, 0),   // contra-revenue nets against revenue
      row('2026-01', '5000', 3000, 0),
      row('2026-01', '6100', 2000, 0),  // opex folds into expenses
      row('2026-01', '1000', 4000, 1000),
      row('2026-01', '1100', 10000, 4000), // A/R is not a bank account — no bankNet
    ]
    const months = monthlyActivity(rows, acc)
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02'])
    expect(months[0]).toEqual({ month: '2026-01', revenue: 9500, expenses: 5000, net: 4500, bankNet: 3000 })
    expect(months[1]).toEqual({ month: '2026-02', revenue: 8000, expenses: 2500, net: 5500, bankNet: 5500 })
  })

  it('ignores rows for unknown accounts and returns [] for no rows', () => {
    expect(monthlyActivity([], acc)).toEqual([])
    expect(monthlyActivity([row('2026-01', '9999', 100, 0)], acc)).toEqual([])
  })
})
