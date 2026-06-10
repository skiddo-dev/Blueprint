import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { isBalanced } from './ledger'
import { ACCT_AP, billTotal, billJournalLines, billPaymentJournalLines, vendorCreditJournalLines } from './payables'
import type { BillLine } from './types'

const line = (account_id: string, amount: number, description = ''): BillLine => ({
  account_id, amount: cents(amount), description,
})

describe('billTotal', () => {
  it('sums line amounts', () => {
    expect(billTotal([line('5000', 30000), line('5010', 120000)])).toBe(150000)
    expect(billTotal([])).toBe(0)
  })
})

describe('billJournalLines', () => {
  it('debits each expense/COGS account and credits A/P for the total, balanced', () => {
    const lines = [line('5000', 30000, 'Drywall'), line('5010', 120000, 'Electrical sub')]
    const total = billTotal(lines)
    const journal = billJournalLines(lines, total)
    expect(journal).toEqual([
      { account_id: '5000', debit: 30000, credit: 0, memo: 'Drywall' },
      { account_id: '5010', debit: 120000, credit: 0, memo: 'Electrical sub' },
      { account_id: ACCT_AP.ap, debit: 0, credit: 150000 },
    ])
    expect(isBalanced(journal)).toBe(true)
  })
  it('omits a line memo when there is no description', () => {
    const journal = billJournalLines([line('5000', 5000)], cents(5000))
    expect(journal[0]).toEqual({ account_id: '5000', debit: 5000, credit: 0 })
    expect(isBalanced(journal)).toBe(true)
  })
})

describe('billPaymentJournalLines', () => {
  it('debits A/P and credits Cash, balanced', () => {
    const journal = billPaymentJournalLines(cents(50000))
    expect(journal).toEqual([
      { account_id: ACCT_AP.ap, debit: 50000, credit: 0 },
      { account_id: ACCT_AP.cash, debit: 0, credit: 50000 },
    ])
    expect(isBalanced(journal)).toBe(true)
  })
})

describe('vendorCreditJournalLines', () => {
  const line = (account_id: string, amount: number): BillLine => ({ account_id, description: '', amount: cents(amount) })
  it('debits A/P and credits the expense accounts pro-rata, balanced to the penny', () => {
    const lines = vendorCreditJournalLines(cents(3000), [line('5000', 6000), line('5010', 3000)])
    expect(lines[0]).toEqual({ account_id: '2000', debit: 3000, credit: 0 })
    expect(lines.slice(1)).toEqual([
      { account_id: '5000', debit: 0, credit: 2000 },
      { account_id: '5010', debit: 0, credit: 1000 },
    ])
  })
  it('odd-penny allocation still balances', () => {
    const lines = vendorCreditJournalLines(cents(1000), [line('5000', 333), line('5010', 333), line('5040', 334)])
    const cr = lines.reduce((s, l) => s + l.credit, 0)
    expect(cr).toBe(1000)
  })
})
