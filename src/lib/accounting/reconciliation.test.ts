import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { accountEffect, reconcileSummary } from './reconciliation'

const line = (account_id: string, debit: number, credit: number) => ({ account_id, debit: cents(debit), credit: cents(credit) })

describe('accountEffect', () => {
  it('is positive for a deposit (debit to cash) and negative for a payment (credit to cash)', () => {
    const deposit = { lines: [line('1000', 200000, 0), line('1100', 0, 200000)] }   // Dr Cash / Cr A/R
    const payment = { lines: [line('2000', 50000, 0), line('1000', 0, 50000)] }      // Dr A/P / Cr Cash
    expect(accountEffect(deposit, '1000')).toBe(200000)
    expect(accountEffect(payment, '1000')).toBe(-50000)
  })
  it('is zero for an entry that does not touch the account', () => {
    expect(accountEffect({ lines: [line('1100', 100, 0), line('4000', 0, 100)] }, '1000')).toBe(0)
  })
  it('sums multiple lines on the same account', () => {
    expect(accountEffect({ lines: [line('1000', 300, 0), line('1000', 0, 100)] }, '1000')).toBe(200)
  })
})

describe('reconcileSummary', () => {
  it('reconciles when beginning + cleared equals the statement balance', () => {
    const r = reconcileSummary({ beginningBalance: cents(100000), statementBalance: cents(250000), clearedAmounts: [cents(200000), cents(-50000)] })
    expect(r.clearedTotal).toBe(150000)
    expect(r.reconciledBalance).toBe(250000)
    expect(r.difference).toBe(0)
    expect(r.balanced).toBe(true)
  })
  it('reports the difference when out of balance', () => {
    const r = reconcileSummary({ beginningBalance: cents(0), statementBalance: cents(100000), clearedAmounts: [cents(90000)] })
    expect(r.reconciledBalance).toBe(90000)
    expect(r.difference).toBe(10000) // still $100 short
    expect(r.balanced).toBe(false)
  })
  it('handles nothing ticked', () => {
    const r = reconcileSummary({ beginningBalance: cents(50000), statementBalance: cents(50000), clearedAmounts: [] })
    expect(r.balanced).toBe(true)
    expect(r.clearedTotal).toBe(0)
  })
})
