// Pure CSV builders for the report exports — no database, unit-tested like the
// rest of $lib/accounting. Money is emitted as a plain 2-dp decimal (no $ or
// thousands separators) so spreadsheets parse numbers; every text cell goes
// through csvCell (RFC-4180 quoting + formula-injection guard).
import { csvCell } from '$lib/sanitize'
import type { Account, JournalEntry, TrialBalanceRow } from './types'
import type { GeneralLedgerGroup, RegisterRow } from './ledger'
import type { incomeStatement, balanceSheet, StatementSection } from './statements'
import type { CashFlowCategory, CashFlowSection } from './cashflow'
import { AGING_BUCKETS, type AgingBucket, type AgingRow } from './invoicing'

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

export function cashFlowCsv(
  cf: { sections: Record<CashFlowCategory, CashFlowSection>; netChange: number; beginningCash: number; endingCash: number },
  from: string,
  to: string,
): string {
  const out = [
    row(['Statement of Cash Flows', csvCell(from), csvCell(to), '']),
    row(['Section', 'Account', 'Name', 'Amount']),
    row(['Cash at start of period', '', '', moneyCell(cf.beginningCash)]),
  ]
  for (const cat of ['operating', 'investing', 'financing'] as CashFlowCategory[]) {
    const s = cf.sections[cat]
    for (const l of s.lines) {
      out.push(row([csvCell(s.title), csvCell(l.account_id), csvCell(l.name), moneyCell(l.amount)]))
    }
    out.push(row([csvCell(`Net cash from ${s.title.toLowerCase()}`), '', '', moneyCell(s.total)]))
  }
  out.push(row(['Net change in cash', '', '', moneyCell(cf.netChange)]))
  out.push(row(['Cash at end of period', '', '', moneyCell(cf.endingCash)]))
  return out.join('\n')
}

/** A/R or A/P aging: the open-document rows, then the bucket totals. */
export function agingCsv(
  aging: { buckets: Record<AgingBucket, number>; total: number; rows: AgingRow[] },
  kind: 'ar' | 'ap',
  asOf: string,
): string {
  const out = [
    row([csvCell(`${kind === 'ar' ? 'A/R' : 'A/P'} Aging`), csvCell(asOf), '', '', '']),
    row(['Number', kind === 'ar' ? 'Customer' : 'Vendor', 'Due', 'Bucket', 'Balance']),
  ]
  for (const r of aging.rows) {
    out.push(row([String(r.number), csvCell(r.name), csvCell(r.due_date), csvCell(r.bucket), moneyCell(r.balance)]))
  }
  for (const b of AGING_BUCKETS) {
    out.push(row([csvCell(`Total ${b}`), '', '', '', moneyCell(aging.buckets[b])]))
  }
  out.push(row(['Total outstanding', '', '', '', moneyCell(aging.total)]))
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

export function salesTaxCsv(months: { period: string; collected: number; credited: number; remitted: number; net: number }[], balance: number): string {
  const out = [row(['Month', 'Collected', 'Credited back', 'Remitted', 'Net'])]
  for (const m of months) {
    out.push(row([csvCell(m.period), moneyCell(m.collected), moneyCell(m.credited), moneyCell(m.remitted), moneyCell(m.net)]))
  }
  out.push(row(['Balance owed', '', '', '', moneyCell(balance)]))
  return out.join('\n')
}

export function ten99Csv(rows: { name: string; tax_id?: string; paymentCount: number; total: number; overThreshold: boolean }[], year: number, total: number): string {
  const out = [
    row([csvCell(`1099 vendor payments ${year}`), '', '', '', '']),
    row(['Vendor', 'Tax ID', 'Payments', 'Total paid', '1099 required']),
  ]
  for (const r of rows) {
    out.push(row([csvCell(r.name), csvCell(r.tax_id ?? ''), String(r.paymentCount), moneyCell(r.total), r.overThreshold ? 'YES' : 'no']))
  }
  out.push(row(['Total', '', '', moneyCell(total), '']))
  return out.join('\n')
}

export function budgetVsActualCsv(
  rows: { account_id: string; name: string; type: string; actualYtd: number; budgetYtd: number; varianceYtd: number }[],
  totals: { netActualYtd: number; netBudgetYtd: number },
  year: number,
  through: number,
): string {
  const out = [
    row([csvCell(`Budget vs Actual ${year} (through month ${through})`), '', '', '']),
    row(['Account', 'Name', 'Actual YTD', 'Budget YTD']),
  ]
  // Variance carried as the 5th column on data rows; header row kept to 4 + 1 for clarity
  out[1] = row(['Account', 'Name', 'Actual YTD', 'Budget YTD', 'Variance'])
  out[0] = row([csvCell(`Budget vs Actual ${year} (through month ${through})`), '', '', '', ''])
  for (const r of rows) {
    out.push(row([csvCell(r.account_id), csvCell(r.name), moneyCell(r.actualYtd), moneyCell(r.budgetYtd), moneyCell(r.varianceYtd)]))
  }
  out.push(row(['Net income', '', moneyCell(totals.netActualYtd), moneyCell(totals.netBudgetYtd), moneyCell(totals.netActualYtd - totals.netBudgetYtd)]))
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
