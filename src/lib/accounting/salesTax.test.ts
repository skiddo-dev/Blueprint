import { describe, expect, it } from 'vitest'
import { cents } from '$lib/money'
import type { JournalEntry, JournalSource } from './types'
import { salesTaxSummary, remittanceJournalLines, SALES_TAX_ACCT } from './salesTax'
import { isBalanced } from './ledger'

function entry(source: JournalSource, date: string, lines: { a: string; d?: number; c?: number }[], status: 'posted' | 'void' = 'posted'): JournalEntry {
  return {
    _id: crypto.randomUUID(), date, period: date.slice(0, 7), source, status,
    lines: lines.map((l) => ({ account_id: l.a, debit: cents(l.d ?? 0), credit: cents(l.c ?? 0) })),
    created_at: `${date}T00:00:00.000Z`,
  } as JournalEntry
}

describe('salesTaxSummary', () => {
  it('buckets collected, credited, and remitted by month with a running balance', () => {
    const entries = [
      // Jan: two taxed invoices collect $60 + $30
      entry('invoice', '2026-01-10', [{ a: '1100', d: 1060 }, { a: '4000', c: 1000 }, { a: SALES_TAX_ACCT, c: 60 }]),
      entry('invoice', '2026-01-20', [{ a: '1100', d: 530 }, { a: '4000', c: 500 }, { a: SALES_TAX_ACCT, c: 30 }]),
      // Feb: credit memo gives $10 of tax back; remittance pays $60
      entry('credit-memo', '2026-02-05', [{ a: '4900', d: 167 }, { a: SALES_TAX_ACCT, d: 10 }, { a: '1100', c: 177 }]),
      entry('sales-tax-remittance', '2026-02-20', [{ a: SALES_TAX_ACCT, d: 60 }, { a: '1000', c: 60 }]),
    ]
    const { months, balance } = salesTaxSummary(entries)
    expect(months).toHaveLength(2)
    expect(months[0]).toMatchObject({ period: '2026-01', collected: 90, credited: 0, remitted: 0, net: 90 })
    expect(months[1]).toMatchObject({ period: '2026-02', collected: 0, credited: 10, remitted: 60, net: -70 })
    expect(balance).toBe(90 - 10 - 60)
  })

  it('nets a voided invoice via its reversal (reversals keep the source)', () => {
    const entries = [
      entry('invoice', '2026-01-10', [{ a: '1100', d: 1060 }, { a: '4000', c: 1000 }, { a: SALES_TAX_ACCT, c: 60 }]),
      // the void posts a reversal in March, still source 'invoice'
      entry('invoice', '2026-03-02', [{ a: '1100', c: 1060 }, { a: '4000', d: 1000 }, { a: SALES_TAX_ACCT, d: 60 }]),
    ]
    const { months, balance } = salesTaxSummary(entries)
    expect(months.find((m) => m.period === '2026-01')?.collected).toBe(60)
    expect(months.find((m) => m.period === '2026-03')?.collected).toBe(-60)
    expect(balance).toBe(0)
  })

  it('ignores entries not touching 2200 and void-status entries', () => {
    const entries = [
      entry('invoice', '2026-01-10', [{ a: '1100', d: 500 }, { a: '4000', c: 500 }]), // untaxed
      entry('invoice', '2026-01-11', [{ a: '1100', d: 106 }, { a: '4000', c: 100 }, { a: SALES_TAX_ACCT, c: 6 }], 'void'),
    ]
    const { months, balance } = salesTaxSummary(entries)
    expect(months).toHaveLength(0)
    expect(balance).toBe(0)
  })
})

describe('remittanceJournalLines', () => {
  it('builds a balanced Dr 2200 / Cr bank entry', () => {
    const lines = remittanceJournalLines(cents(12345), '1000')
    expect(isBalanced(lines)).toBe(true)
    expect(lines[0]).toMatchObject({ account_id: SALES_TAX_ACCT, debit: 12345 })
    expect(lines[1]).toMatchObject({ account_id: '1000', credit: 12345 })
  })
})
