import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { categorize, cashFlow } from './cashflow'
import type { Account, JournalEntry } from './types'

const accounts: Account[] = [
  { _id: '1000', code: '1000', name: 'Cash — Operating', type: 'asset', normal: 'debit', subtype: 'bank', active: true },
  { _id: '1100', code: '1100', name: 'Accounts Receivable', type: 'asset', normal: 'debit', subtype: 'receivable', active: true },
  { _id: '2000', code: '2000', name: 'Accounts Payable', type: 'liability', normal: 'credit', subtype: 'payable', active: true },
  { _id: '1500', code: '1500', name: 'Vehicles & Equipment', type: 'asset', normal: 'debit', subtype: 'fixed-asset', active: true },
  { _id: '2600', code: '2600', name: 'Loans Payable', type: 'liability', normal: 'credit', subtype: 'long-term-liability', active: true },
  { _id: '3000', code: '3000', name: "Owner's Equity", type: 'equity', normal: 'credit', active: true },
]
const bankIds = new Set(['1000'])

const line = (account_id: string, debit: number, credit: number) => ({ account_id, debit: cents(debit), credit: cents(credit) })
const entry = (lines: { account_id: string; debit: number; credit: number }[]): JournalEntry => ({
  _id: Math.random().toString(36), date: '2026-06-09', period: '2026-06', source: 'manual', status: 'posted',
  created_at: '2026-06-09T00:00:00Z', lines: lines as JournalEntry['lines'],
})

describe('categorize', () => {
  it('routes fixed assets → investing, long-term debt/equity → financing, else operating', () => {
    expect(categorize(accounts.find((a) => a._id === '1500'))).toBe('investing')
    expect(categorize(accounts.find((a) => a._id === '2600'))).toBe('financing')
    expect(categorize(accounts.find((a) => a._id === '3000'))).toBe('financing')
    expect(categorize(accounts.find((a) => a._id === '1100'))).toBe('operating')
    expect(categorize(undefined)).toBe('operating')
  })
})

describe('cashFlow', () => {
  it('attributes cash deltas to counterparts and classifies them; netChange = total cash moved', () => {
    const entries = [
      entry([line('1000', 200000, 0), line('1100', 0, 200000)]),  // +$2,000 collected from A/R → operating
      entry([line('2000', 50000, 0), line('1000', 0, 50000)]),    // −$500 paid on A/P → operating
      entry([line('1500', 300000, 0), line('1000', 0, 300000)]),  // −$3,000 bought equipment → investing
      entry([line('1000', 1000000, 0), line('2600', 0, 1000000)]),// +$10,000 loan proceeds → financing
    ]
    const cf = cashFlow(entries, bankIds, accounts)
    expect(cf.sections.operating.total).toBe(150000)   // +2000 − 500
    expect(cf.sections.investing.total).toBe(-300000)  // −3000
    expect(cf.sections.financing.total).toBe(1000000)  // +10000
    expect(cf.netChange).toBe(850000)                  // 1500 − 3000 + 10000 = $8,500
    // net change equals the sum of section totals
    expect(cf.sections.operating.total + cf.sections.investing.total + cf.sections.financing.total).toBe(cf.netChange)
    expect(cf.sections.operating.lines.map((l) => l.account_id)).toEqual(['1100', '2000'])
    expect(cf.sections.investing.lines[0].name).toBe('Vehicles & Equipment')
  })
  it('ignores entries that do not move cash', () => {
    const cf = cashFlow([entry([line('1100', 5000, 0), line('4000' /* not in chart */, 0, 5000)])], bankIds, accounts)
    expect(cf.netChange).toBe(0)
    expect(cf.sections.operating.lines).toHaveLength(0)
  })
})
