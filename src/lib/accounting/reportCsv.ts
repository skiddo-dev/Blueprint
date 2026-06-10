// Pure CSV builders for the report exports — no database, unit-tested like the
// rest of $lib/accounting. Money is emitted as a plain 2-dp decimal (no $ or
// thousands separators) so spreadsheets parse numbers; every text cell goes
// through csvCell (RFC-4180 quoting + formula-injection guard).
import { csvCell } from '$lib/sanitize'
import type { Account, JournalEntry, TrialBalanceRow } from './types'
import type { GeneralLedgerGroup, RegisterRow } from './ledger'
import type { incomeStatement, balanceSheet, StatementSection } from './statements'

/** Cents → "1234.56" / "-1234.56". Numbers stay unquoted so spreadsheets sum them. */
export function moneyCell(c: number): string {
  return (c / 100).toFixed(2)
}

function row(cells: string[]): string {
  return cells.join(',')
}

export function trialBalanceCsv(
  rows: (TrialBalanceRow & { name?: string })[],
  totalDebit: number,
  totalCredit: number,
): string {
  const out = [row(['Account', 'Name', 'Debit', 'Credit'])]
  for (const r of rows) {
    out.push(row([csvCell(r.account_id), csvCell(r.name ?? ''), moneyCell(r.debit), moneyCell(r.credit)]))
  }
  out.push(row(['Total', '', moneyCell(totalDebit), moneyCell(totalCredit)]))
  return out.join('\n')
}

function statementSection(out: string[], s: StatementSection): void {
  for (const l of s.lines) {
    out.push(row([csvCell(s.title), csvCell(l.account_id), csvCell(l.name), moneyCell(l.amount)]))
  }
  out.push(row([csvCell(`Total ${s.title}`), '', '', moneyCell(s.total)]))
}

export function incomeStatementCsv(
  stmt: ReturnType<typeof incomeStatement>,
  from: string,
  to: string,
): string {
  const out = [
    row(['Income Statement', csvCell(from), csvCell(to), '']),
    row(['Section', 'Account', 'Name', 'Amount']),
  ]
  statementSection(out, stmt.revenue)
  statementSection(out, stmt.cogs)
  out.push(row(['Gross Profit', '', '', moneyCell(stmt.grossProfit)]))
  statementSection(out, stmt.expenses)
  out.push(row(['Net Income', '', '', moneyCell(stmt.netIncome)]))
  return out.join('\n')
}

export function balanceSheetCsv(bs: ReturnType<typeof balanceSheet>, asOf: string): string {
  const out = [
    row(['Balance Sheet', csvCell(asOf), '', '']),
    row(['Section', 'Account', 'Name', 'Amount']),
  ]
  statementSection(out, bs.assets)
  statementSection(out, bs.liabilities)
  statementSection(out, bs.equity) // equity lines include the "Net income (current period)" row
  out.push(row(['Total Liabilities & Equity', '', '', moneyCell(bs.totalLiabilitiesAndEquity)]))
  return out.join('\n')
}

export function generalLedgerCsv(groups: GeneralLedgerGroup[]): string {
  const out = [row(['Account', 'Account name', 'Date', 'Entry', 'Source', 'Memo', 'Debit', 'Credit'])]
  for (const g of groups) {
    for (const r of g.rows) {
      out.push(row([
        csvCell(g.account_id), csvCell(g.name), csvCell(r.date), csvCell(r.entry_id),
        csvCell(r.source), csvCell(r.memo ?? ''), moneyCell(r.debit), moneyCell(r.credit),
      ]))
    }
    out.push(row([csvCell(g.account_id), csvCell(`Total ${g.name}`), '', '', '', '', moneyCell(g.totalDebit), moneyCell(g.totalCredit)]))
  }
  return out.join('\n')
}

/** One row per journal LINE — the flat shape accountants pivot on. */
export function journalCsv(entries: JournalEntry[], nameByAccount: Map<string, string>): string {
  const out = [row(['Date', 'Entry', 'Source', 'Memo', 'Account', 'Account name', 'Debit', 'Credit'])]
  for (const e of entries) {
    for (const l of e.lines) {
      out.push(row([
        csvCell(e.date), csvCell(e._id), csvCell(e.source), csvCell(e.memo ?? ''),
        csvCell(l.account_id), csvCell(nameByAccount.get(l.account_id) ?? ''),
        moneyCell(l.debit), moneyCell(l.credit),
      ]))
    }
  }
  return out.join('\n')
}

export function registerCsv(
  rows: RegisterRow[],
  account: Pick<Account, '_id' | 'name'>,
  opening: number,
): string {
  const out = [
    row([csvCell(`Register — ${account._id} ${account.name}`), '', '', '', '', '', '']),
    row(['Date', 'Entry', 'Source', 'Memo', 'Debit', 'Credit', 'Balance']),
    row(['', '', '', 'Opening balance', '', '', moneyCell(opening)]),
  ]
  for (const r of rows) {
    out.push(row([
      csvCell(r.date), csvCell(r.entry_id), csvCell(r.source), csvCell(r.memo ?? ''),
      moneyCell(r.debit), moneyCell(r.credit), moneyCell(r.balance),
    ]))
  }
  return out.join('\n')
}
