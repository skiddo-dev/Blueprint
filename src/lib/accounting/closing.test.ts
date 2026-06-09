import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { isBalanced } from './ledger'
import { closingEntryLines, netIncomeFrom, RETAINED_EARNINGS } from './closing'
import type { Account } from './types'
import type { Balance } from './statements'

const accounts: Account[] = [
  { _id: '1000', code: '1000', name: 'Cash', type: 'asset', normal: 'debit', subtype: 'bank', active: true },
  { _id: '3100', code: '3100', name: 'Retained Earnings', type: 'equity', normal: 'credit', active: true },
  { _id: '4000', code: '4000', name: 'Contract Revenue', type: 'income', normal: 'credit', active: true },
  { _id: '4900', code: '4900', name: 'Sales Discounts', type: 'income', normal: 'debit', contra: true, active: true },
  { _id: '5000', code: '5000', name: 'Job Materials', type: 'expense', normal: 'debit', subtype: 'cogs', active: true },
  { _id: '6100', code: '6100', name: 'Rent', type: 'expense', normal: 'debit', subtype: 'opex', active: true },
]
const bal = (account_id: string, debit: number, credit: number): Balance => ({ account_id, debit: cents(debit), credit: cents(credit) })

describe('netIncomeFrom', () => {
  it('is income (net of contra) minus expense', () => {
    const balances = [bal('4000', 0, 10000), bal('4900', 500, 0), bal('5000', 3000, 0), bal('6100', 2000, 0)]
    expect(netIncomeFrom(balances, accounts)).toBe(4500) // (10000 − 500) − (3000 + 2000)
  })
})

describe('closingEntryLines', () => {
  it('zeroes income & expense and credits Retained Earnings with the profit; balanced', () => {
    const balances = [bal('4000', 0, 10000), bal('5000', 3000, 0), bal('6100', 2000, 0)] // net income 5000
    const lines = closingEntryLines(balances, accounts)
    expect(isBalanced(lines)).toBe(true)
    // revenue zeroed by a debit, expenses by credits, RE credited the net
    expect(lines).toContainEqual({ account_id: '4000', debit: cents(10000), credit: cents(0) })
    expect(lines).toContainEqual({ account_id: '5000', debit: cents(0), credit: cents(3000) })
    expect(lines).toContainEqual({ account_id: '6100', debit: cents(0), credit: cents(2000) })
    expect(lines).toContainEqual({ account_id: RETAINED_EARNINGS, debit: cents(0), credit: cents(5000) })
  })
  it('debits Retained Earnings on a net loss', () => {
    const balances = [bal('4000', 0, 1000), bal('5000', 3000, 0)] // net loss 2000
    const lines = closingEntryLines(balances, accounts)
    expect(isBalanced(lines)).toBe(true)
    expect(lines).toContainEqual({ account_id: RETAINED_EARNINGS, debit: cents(2000), credit: cents(0) })
  })
  it('handles contra-revenue (debit-balance income account)', () => {
    const balances = [bal('4000', 0, 10000), bal('4900', 1500, 0)] // revenue 10000 − discounts 1500 = 8500 net
    const lines = closingEntryLines(balances, accounts)
    expect(isBalanced(lines)).toBe(true)
    expect(lines).toContainEqual({ account_id: '4900', debit: cents(0), credit: cents(1500) }) // zero the contra by crediting
    expect(lines).toContainEqual({ account_id: RETAINED_EARNINGS, debit: cents(0), credit: cents(8500) })
  })
  it('returns [] when there is nothing to close', () => {
    expect(closingEntryLines([bal('1000', 5000, 0)], accounts)).toEqual([])
  })
})
