import { describe, it, expect } from 'vitest'
import { cents } from '$lib/money'
import { parseStatementCsv, autoMatch, toIsoDate } from './statement-import'

describe('toIsoDate', () => {
  it('normalizes ISO and M/D/YYYY', () => {
    expect(toIsoDate('2026-06-09')).toBe('2026-06-09')
    expect(toIsoDate('6/9/2026')).toBe('2026-06-09')
    expect(toIsoDate('06/09/26')).toBe('2026-06-09')
  })
})

describe('parseStatementCsv', () => {
  it('parses a signed amount column', () => {
    const csv = 'Date,Description,Amount\n2026-06-09,Customer deposit,2000.00\n2026-06-10,Check 1099,-500.00\n'
    expect(parseStatementCsv(csv)).toEqual([
      { date: '2026-06-09', description: 'Customer deposit', amount: cents(200000) },
      { date: '2026-06-10', description: 'Check 1099', amount: cents(-50000) },
    ])
  })
  it('parses separate debit/credit columns (amount = credit − debit) and M/D/YYYY dates', () => {
    const csv = 'Posted Date,Memo,Debit,Credit\n6/9/2026,Deposit,,2000\n6/10/2026,Withdrawal,500,\n'
    expect(parseStatementCsv(csv)).toEqual([
      { date: '2026-06-09', description: 'Deposit', amount: cents(200000) },
      { date: '2026-06-10', description: 'Withdrawal', amount: cents(-50000) },
    ])
  })
  it('skips unparseable / empty rows', () => {
    const csv = 'Date,Description,Amount\n,,\n2026-06-09,Good,100\n'
    expect(parseStatementCsv(csv)).toEqual([{ date: '2026-06-09', description: 'Good', amount: cents(10000) }])
  })
})

describe('autoMatch', () => {
  const txns = [
    { entry_id: 'a', amount: cents(200000) },
    { entry_id: 'b', amount: cents(-50000) },
    { entry_id: 'c', amount: cents(-50000) },
  ]
  it('matches statement lines to uncleared txns by signed amount, each used once', () => {
    const lines = [
      { date: '2026-06-09', description: 'dep', amount: cents(200000) },
      { date: '2026-06-10', description: 'chk', amount: cents(-50000) },
      { date: '2026-06-11', description: 'no match', amount: cents(-9999) },
    ]
    const r = autoMatch(lines, txns)
    expect(r.matchedCount).toBe(2)
    expect(r.matchedTxnIds).toEqual(['a', 'b']) // greedy: first -50000 txn consumed
    expect(r.unmatchedStatement.map((l) => l.amount)).toEqual([-9999])
  })
  it('consumes each ledger txn at most once for duplicate amounts', () => {
    const lines = [
      { date: '2026-06-10', description: 'chk1', amount: cents(-50000) },
      { date: '2026-06-11', description: 'chk2', amount: cents(-50000) },
      { date: '2026-06-12', description: 'chk3', amount: cents(-50000) }, // no third −500 txn
    ]
    const r = autoMatch(lines, txns)
    expect(r.matchedTxnIds.sort()).toEqual(['b', 'c'])
    expect(r.unmatchedStatement).toHaveLength(1)
  })
})
