import { describe, it, expect } from 'vitest'
import { cents, type Cents } from '$lib/money'
import { entryTotals, isBalanced, validateEntry, periodOf, buildReversingEntry, trialBalance, accountRegister, generalLedger } from './ledger'
import type { JournalEntry, JournalLine } from './types'

// Helpers to build lines/entries tersely in tests.
const dr = (account_id: string, n: number): JournalLine => ({ account_id, debit: cents(n), credit: cents(0) })
const cr = (account_id: string, n: number): JournalLine => ({ account_id, debit: cents(0), credit: cents(n) })

function posted(lines: JournalLine[], over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    _id: over._id ?? 'e1',
    date: '2026-06-09',
    period: '2026-06',
    source: 'manual',
    status: 'posted',
    created_at: '2026-06-09T00:00:00.000Z',
    lines,
    ...over,
  }
}

describe('entryTotals / isBalanced', () => {
  it('sums each side and detects balance', () => {
    const lines = [dr('1100', 10000), cr('4000', 9434), cr('2200', 566)]
    expect(entryTotals(lines)).toEqual({ debit: 10000, credit: 10000 })
    expect(isBalanced(lines)).toBe(true)
  })
  it('flags an imbalance', () => {
    expect(isBalanced([dr('1100', 10000), cr('4000', 9999)])).toBe(false)
  })
})

describe('validateEntry', () => {
  const base = { date: '2026-06-09', source: 'manual' as const }

  it('accepts a balanced, well-formed entry', () => {
    expect(validateEntry({ ...base, lines: [dr('1100', 500), cr('4000', 500)] })).toEqual([])
  })
  it('rejects an unbalanced entry', () => {
    const problems = validateEntry({ ...base, lines: [dr('1100', 500), cr('4000', 400)] })
    expect(problems.some((p) => /does not balance/.test(p))).toBe(true)
  })
  it('rejects a line with both a debit and a credit', () => {
    const both: JournalLine = { account_id: '1100', debit: cents(500), credit: cents(500) }
    const problems = validateEntry({ ...base, lines: [both, cr('4000', 500)] })
    expect(problems.some((p) => /not both/.test(p))).toBe(true)
  })
  it('rejects a line with neither a debit nor a credit', () => {
    const neither: JournalLine = { account_id: '1100', debit: cents(0), credit: cents(0) }
    const problems = validateEntry({ ...base, lines: [neither, dr('4000', 500)] })
    expect(problems.some((p) => /must have a debit or a credit/.test(p))).toBe(true)
  })
  it('rejects negative amounts', () => {
    const neg: JournalLine = { account_id: '1100', debit: -100 as Cents, credit: cents(0) }
    const problems = validateEntry({ ...base, lines: [neg, cr('4000', 100)] })
    expect(problems.some((p) => /cannot be negative/.test(p))).toBe(true)
  })
  it('requires at least two lines, a date, and some amount', () => {
    expect(validateEntry({ ...base, lines: [dr('1100', 100)] }).some((p) => /two lines/.test(p))).toBe(true)
    expect(validateEntry({ date: 'nope', source: 'manual', lines: [dr('1100', 1), cr('4000', 1)] })
      .some((p) => /ISO/.test(p))).toBe(true)
    expect(validateEntry({ ...base, lines: [dr('1100', 0), cr('4000', 0)] })
      .some((p) => /no amounts/.test(p))).toBe(true)
  })
})

describe('periodOf', () => {
  it('extracts YYYY-MM', () => {
    expect(periodOf('2026-06-09')).toBe('2026-06')
    expect(periodOf('2025-12-31')).toBe('2025-12')
  })
})

describe('buildReversingEntry', () => {
  it('swaps debit and credit on every line and references the original', () => {
    const original = posted([dr('1100', 10000), cr('4000', 10000)], { _id: 'orig', memo: 'Invoice 5' })
    const rev = buildReversingEntry(original)
    expect(rev.lines).toEqual([
      { account_id: '1100', debit: cents(0), credit: cents(10000), memo: undefined },
      { account_id: '4000', debit: cents(10000), credit: cents(0), memo: undefined },
    ])
    expect(rev.memo).toBe('Reversal of orig')
    expect(isBalanced(rev.lines)).toBe(true)
  })
  it('drops source_ref so it cannot collide with the original idempotency slot', () => {
    const original = posted([dr('1100', 500), cr('4000', 500)], { source: 'invoice', source_ref: 'inv_1' })
    const rev = buildReversingEntry(original)
    expect(rev.source).toBe('invoice')
    expect(rev.source_ref).toBeUndefined()
  })
  it('honors an override date/memo', () => {
    const original = posted([dr('1100', 500), cr('4000', 500)])
    const rev = buildReversingEntry(original, { date: '2026-07-01', memo: 'undo' })
    expect(rev.date).toBe('2026-07-01')
    expect(rev.memo).toBe('undo')
  })
})

describe('trialBalance', () => {
  it('aggregates posted entries by account and balances overall', () => {
    const entries = [
      posted([dr('1100', 10000), cr('4000', 10000)], { _id: 'a' }),     // invoice
      posted([dr('1000', 10000), cr('1100', 10000)], { _id: 'b' }),     // payment
    ]
    const tb = trialBalance(entries)
    expect(tb.totalDebit).toBe(tb.totalCredit)
    const ar = tb.rows.find((r) => r.account_id === '1100')!
    expect(ar).toMatchObject({ debit: 10000, credit: 10000, net: 0 })   // AR opened and cleared
    const cash = tb.rows.find((r) => r.account_id === '1000')!
    expect(cash.net).toBe(10000)                                        // cash up $100
    expect(tb.rows.map((r) => r.account_id)).toEqual(['1000', '1100', '4000']) // sorted
  })

  it('ignores non-posted (void) entries', () => {
    const entries = [
      posted([dr('1100', 500), cr('4000', 500)], { _id: 'a' }),
      posted([dr('1100', 999), cr('4000', 999)], { _id: 'b', status: 'void' }),
    ]
    const tb = trialBalance(entries)
    expect(tb.totalDebit).toBe(500)
  })

  it('is empty for no entries', () => {
    expect(trialBalance([])).toEqual({ rows: [], totalDebit: 0, totalCredit: 0 })
  })
})

describe('accountRegister', () => {
  const entry = (id: string, date: string, lines: [string, number, number][], memo?: string): JournalEntry => ({
    _id: id, date, period: date.slice(0, 7), source: 'manual', lines: lines.map(([account_id, debit, credit]) => ({ account_id, debit: cents(debit), credit: cents(credit) })), status: 'posted', created_at: date,
    ...(memo !== undefined ? { memo } : {}),
  })

  it('folds a running balance in the account normal direction and merges multi-line hits', () => {
    const entries = [
      entry('e1', '2026-01-05', [['1000', 5000, 0], ['4000', 0, 5000]], 'sale'),
      entry('e2', '2026-01-10', [['1000', 0, 2000], ['6100', 2000, 0]], 'rent'),
      entry('e3', '2026-01-15', [['1000', 1000, 0], ['1000', 500, 0], ['4000', 0, 1500]], 'two cash lines'),
      entry('e4', '2026-01-20', [['6100', 300, 0], ['2000', 0, 300]], 'no cash involvement'),
    ]
    const { rows, closing } = accountRegister(entries, '1000', cents(1000), 'debit')
    expect(rows.map((r) => r.balance)).toEqual([6000, 4000, 5500]) // opening 1000 → +5000 → −2000 → +1500
    expect(rows[2].debit).toBe(1500) // merged lines
    expect(rows.find((r) => r.memo === 'no cash involvement')).toBeUndefined()
    expect(closing).toBe(5500)
  })

  it('presents credit-normal accounts positive when in credit', () => {
    const entries = [entry('e1', '2026-01-05', [['6100', 700, 0], ['2000', 0, 700]])]
    const { rows, closing } = accountRegister(entries, '2000', cents(0), 'credit')
    expect(rows[0].balance).toBe(700)
    expect(closing).toBe(700)
  })

  it('empty input returns opening as closing', () => {
    expect(accountRegister([], '1000', cents(250), 'debit')).toEqual({ rows: [], closing: 250 })
  })
})

describe('generalLedger', () => {
  const accounts = [
    { _id: '1000', name: 'Cash' },
    { _id: '4000', name: 'Revenue' },
  ]
  it('groups lines per account in code order with totals', () => {
    const entries: JournalEntry[] = [
      { _id: 'e1', date: '2026-01-05', period: '2026-01', source: 'manual', status: 'posted', created_at: '', lines: [
        { account_id: '4000', debit: cents(0), credit: cents(900) },
        { account_id: '1000', debit: cents(900), credit: cents(0) },
      ] },
      { _id: 'e2', date: '2026-01-09', period: '2026-01', source: 'manual', status: 'posted', created_at: '', lines: [
        { account_id: '1000', debit: cents(0), credit: cents(400) },
        { account_id: '9999', debit: cents(400), credit: cents(0) },
      ] },
    ]
    const groups = generalLedger(entries, accounts)
    expect(groups.map((g) => g.account_id)).toEqual(['1000', '4000', '9999'])
    const cash = groups[0]
    expect(cash.name).toBe('Cash')
    expect(cash.rows).toHaveLength(2)
    expect(cash.totalDebit).toBe(900)
    expect(cash.totalCredit).toBe(400)
    expect(cash.net).toBe(500)
    expect(groups[2].name).toBe('9999') // unknown account falls back to its code
  })
})
