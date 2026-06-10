import { describe, expect, it } from 'vitest'
import { cents } from '$lib/money'
import type { JournalEntry } from './types'
import { incomeStatement, balanceSheet } from './statements'
import { generalLedger, trialBalance, accountRegister } from './ledger'
import {
  moneyCell, trialBalanceCsv, incomeStatementCsv, balanceSheetCsv,
  generalLedgerCsv, journalCsv, registerCsv,
} from './reportCsv'

const ACCOUNTS = [
  { _id: '1000', name: 'Cash — Operating', type: 'asset', normal: 'debit', subtype: 'bank', active: true },
  { _id: '1100', name: 'Accounts Receivable', type: 'asset', normal: 'debit', subtype: 'receivable', active: true },
  { _id: '4000', name: 'Contract Revenue', type: 'income', normal: 'credit', active: true },
  { _id: '6100', name: 'Rent', type: 'expense', normal: 'debit', subtype: 'opex', active: true },
] as never[]

function entry(id: string, date: string, lines: { a: string; d?: number; c?: number }[], memo?: string): JournalEntry {
  return {
    _id: id, date, period: date.slice(0, 7), source: 'manual', status: 'posted',
    ...(memo !== undefined ? { memo } : {}),
    lines: lines.map((l) => ({ account_id: l.a, debit: cents(l.d ?? 0), credit: cents(l.c ?? 0) })),
    created_at: `${date}T00:00:00.000Z`,
  } as JournalEntry
}

const ENTRIES = [
  entry('e1', '2026-01-10', [{ a: '1100', d: 50000 }, { a: '4000', c: 50000 }], 'Invoice #1'),
  entry('e2', '2026-01-20', [{ a: '1000', d: 50000 }, { a: '1100', c: 50000 }], 'Payment, with comma'),
  entry('e3', '2026-02-01', [{ a: '6100', d: 12000 }, { a: '1000', c: 12000 }], '=SUM(A1) rent'),
]

describe('moneyCell', () => {
  it('renders cents as plain 2-dp decimals', () => {
    expect(moneyCell(123456)).toBe('1234.56')
    expect(moneyCell(0)).toBe('0.00')
    expect(moneyCell(-5)).toBe('-0.05')
  })
})

describe('trialBalanceCsv', () => {
  it('emits one row per account and a totals row matching the section totals', () => {
    const tb = trialBalance(ENTRIES)
    const csv = trialBalanceCsv(tb.rows.map((r) => ({ ...r, name: 'X' })), tb.totalDebit, tb.totalCredit)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Account,Name,Debit,Credit')
    expect(lines).toHaveLength(1 + tb.rows.length + 1)
    const total = lines.at(-1)!.split(',')
    expect(total[0]).toBe('Total')
    expect(total[2]).toBe(moneyCell(tb.totalDebit))
    expect(total[3]).toBe(moneyCell(tb.totalCredit))
    // a balanced ledger exports balanced totals
    expect(total[2]).toBe(total[3])
  })
})

describe('incomeStatementCsv', () => {
  it('section totals in the CSV equal the statement totals', () => {
    const balances = trialBalance(ENTRIES).rows
    const stmt = incomeStatement(balances, ACCOUNTS as never)
    const csv = incomeStatementCsv(stmt, '2026-01-01', '2026-02-28')
    expect(csv).toContain(`Total Revenue,,,${moneyCell(stmt.revenue.total)}`)
    expect(csv).toContain(`Gross Profit,,,${moneyCell(stmt.grossProfit)}`)
    expect(csv).toContain(`Net Income,,,${moneyCell(stmt.netIncome)}`)
    expect(stmt.netIncome).toBe(50000 - 12000)
  })
})

describe('balanceSheetCsv', () => {
  it('carries the equity net-income line and the L+E total', () => {
    const balances = trialBalance(ENTRIES).rows
    const bs = balanceSheet(balances, ACCOUNTS as never)
    const csv = balanceSheetCsv(bs, '2026-02-28')
    expect(csv).toContain('Net income (current period)')
    expect(csv).toContain(`Total Liabilities & Equity,,,${moneyCell(bs.totalLiabilitiesAndEquity)}`)
  })
})

describe('generalLedgerCsv', () => {
  it('groups rows per account with a total line each', () => {
    const groups = generalLedger(ENTRIES, ACCOUNTS as never)
    const csv = generalLedgerCsv(groups)
    for (const g of groups) {
      expect(csv).toContain(`Total ${g.name}`)
    }
    // memo with a comma is quoted, not split
    expect(csv).toContain('"Payment, with comma"')
  })
})

describe('journalCsv', () => {
  it('emits one row per line and defuses formula-leading memos', () => {
    const names = new Map(ACCOUNTS.map((a) => [(a as { _id: string })._id, (a as { name: string }).name]))
    const csv = journalCsv(ENTRIES, names)
    const lines = csv.split('\n')
    const lineCount = ENTRIES.reduce((n, e) => n + e.lines.length, 0)
    expect(lines).toHaveLength(1 + lineCount)
    // formula-injection guard: leading = gets an apostrophe prefix
    expect(csv).toContain("'=SUM(A1) rent")
    expect(csv).not.toMatch(/(^|,)=SUM/m)
  })
})

describe('registerCsv', () => {
  it('opens with the opening balance and tracks the running balance column', () => {
    const reg = accountRegister(ENTRIES, '1000', cents(1000), 'debit')
    const csv = registerCsv(reg.rows, { _id: '1000', name: 'Cash — Operating' }, 1000)
    const lines = csv.split('\n')
    expect(lines[2]).toContain('Opening balance')
    expect(lines[2].split(',').at(-1)).toBe('10.00')
    expect(lines.at(-1)!.split(',').at(-1)).toBe(moneyCell(reg.closing))
  })
})
