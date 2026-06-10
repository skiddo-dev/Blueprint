// Pure financial-statement logic — no database. The server aggregates posted
// journal lines into per-account balances (date-filtered for the P&L period,
// cumulative as-of a date for the balance sheet); these functions structure
// those balances into an Income Statement and a Balance Sheet.
//
// Each section shows accounts in the direction they carry a positive balance
// (assets/expenses are debit-positive; liabilities/equity/income are
// credit-positive). Contra accounts need no special handling: they're typed by
// their parent section but carry the opposite balance, so they net correctly.
import { type Cents, cents } from '$lib/money'
import type { Account, AccountType } from './types'
import { isCashLike } from './coa'

export type Balance = { account_id: string; debit: Cents; credit: Cents }
export type StatementLine = { account_id: string; name: string; amount: Cents }
export type StatementSection = { title: string; lines: StatementLine[]; total: Cents }

const DEBIT_POSITIVE: Record<AccountType, boolean> = {
  asset: true, expense: true, liability: false, equity: false, income: false,
}

function amountFor(type: AccountType, b: { debit: number; credit: number }): number {
  return DEBIT_POSITIVE[type] ? b.debit - b.credit : b.credit - b.debit
}

function balanceMap(balances: Balance[]): Map<string, { debit: number; credit: number }> {
  return new Map(balances.map((b) => [b.account_id, { debit: b.debit, credit: b.credit }]))
}

/** Lines + total for the accounts matching `filter`. Accounts with no activity in
 *  the period are skipped so the statement stays readable. */
function sectionLines(
  accounts: Account[],
  byId: Map<string, { debit: number; credit: number }>,
  filter: (a: Account) => boolean,
): { lines: StatementLine[]; total: number } {
  const lines: StatementLine[] = []
  let total = 0
  for (const a of accounts.filter(filter)) {
    const b = byId.get(a._id)
    if (!b || (b.debit === 0 && b.credit === 0)) continue
    const amt = amountFor(a.type, b)
    lines.push({ account_id: a._id, name: a.name, amount: cents(amt) })
    total += amt
  }
  return { lines, total }
}

const section = (title: string, s: { lines: StatementLine[]; total: number }): StatementSection => ({
  title, lines: s.lines, total: cents(s.total),
})

function sumType(accounts: Account[], byId: Map<string, { debit: number; credit: number }>, type: AccountType): number {
  return accounts
    .filter((a) => a.type === type)
    .reduce((t, a) => t + amountFor(type, byId.get(a._id) ?? { debit: 0, credit: 0 }), 0)
}

/** Income Statement (P&L) for a period: Revenue − COGS = Gross Profit; less
 *  Operating Expenses = Net Income. */
export function incomeStatement(balances: Balance[], accounts: Account[]): {
  revenue: StatementSection
  cogs: StatementSection
  grossProfit: Cents
  expenses: StatementSection
  netIncome: Cents
} {
  const byId = balanceMap(balances)
  const revenue = sectionLines(accounts, byId, (a) => a.type === 'income')
  const cogs = sectionLines(accounts, byId, (a) => a.type === 'expense' && a.subtype === 'cogs')
  const expenses = sectionLines(accounts, byId, (a) => a.type === 'expense' && a.subtype !== 'cogs')
  const grossProfit = revenue.total - cogs.total
  const netIncome = grossProfit - expenses.total
  return {
    revenue: section('Revenue', revenue),
    cogs: section('Cost of Goods Sold', cogs),
    grossProfit: cents(grossProfit),
    expenses: section('Operating Expenses', expenses),
    netIncome: cents(netIncome),
  }
}

/** Balance Sheet as of a date: Assets = Liabilities + Equity. Net income for the
 *  period (income − expenses, not yet closed to retained earnings) is folded into
 *  equity so the statement balances. */
export function balanceSheet(balances: Balance[], accounts: Account[]): {
  assets: StatementSection
  liabilities: StatementSection
  equity: StatementSection
  netIncome: Cents
  totalLiabilitiesAndEquity: Cents
  balanced: boolean
} {
  const byId = balanceMap(balances)
  const assets = sectionLines(accounts, byId, (a) => a.type === 'asset')
  const liabilities = sectionLines(accounts, byId, (a) => a.type === 'liability')
  const equityAccts = sectionLines(accounts, byId, (a) => a.type === 'equity')
  const netIncome = sumType(accounts, byId, 'income') - sumType(accounts, byId, 'expense')
  const equityLines: StatementLine[] = [
    ...equityAccts.lines,
    { account_id: '_net_income', name: 'Net income (current period)', amount: cents(netIncome) },
  ]
  const equityTotal = equityAccts.total + netIncome
  const totalLE = liabilities.total + equityTotal
  return {
    assets: section('Assets', assets),
    liabilities: section('Liabilities', liabilities),
    equity: { title: 'Equity', lines: equityLines, total: cents(equityTotal) },
    netIncome: cents(netIncome),
    totalLiabilitiesAndEquity: cents(totalLE),
    balanced: assets.total === totalLE,
  }
}

/** Whether an entry dated `dateISO` falls in a closed period. */
export function isPeriodClosed(dateISO: string, closedThroughISO: string | null | undefined): boolean {
  return !!closedThroughISO && dateISO <= closedThroughISO
}

export type PeriodBalance = Balance & { period: string } // "YYYY-MM"
export type MonthActivity = {
  month: string // "YYYY-MM"
  revenue: Cents
  expenses: Cents // COGS + opex together — the trend chart doesn't split them
  net: Cents
  bankNet: Cents // net movement on bank-subtype accounts (cash in − cash out)
}

/** Month-by-month P&L + cash movement for the hub's trend chart and sparkline.
 *  Months with no postings are absent — the caller decides how to pad. Contra
 *  accounts net correctly for the same reason as the statements above. */
export function monthlyActivity(rows: PeriodBalance[], accounts: Account[]): MonthActivity[] {
  const kind = new Map(accounts.map((a) => [a._id, { type: a.type, bank: a.type === 'asset' && isCashLike(a) }]))
  const byMonth = new Map<string, { revenue: number; expenses: number; bankNet: number }>()
  for (const r of rows) {
    const k = kind.get(r.account_id)
    if (!k) continue
    const m = byMonth.get(r.period) ?? { revenue: 0, expenses: 0, bankNet: 0 }
    if (k.type === 'income') m.revenue += r.credit - r.debit
    else if (k.type === 'expense') m.expenses += r.debit - r.credit
    if (k.bank) m.bankNet += r.debit - r.credit
    byMonth.set(r.period, m)
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, m]) => ({
      month,
      revenue: cents(m.revenue),
      expenses: cents(m.expenses),
      net: cents(m.revenue - m.expenses),
      bankNet: cents(m.bankNet),
    }))
}

export type ComparativeRow = { account_id: string; name: string; cells: Cents[]; total: Cents }
export type ComparativePnl = {
  months: string[] // "YYYY-MM", oldest → newest
  revenue: { rows: ComparativeRow[]; totals: Cents[]; total: Cents }
  expenses: { rows: ComparativeRow[]; totals: Cents[]; total: Cents }
  net: { cells: Cents[]; total: Cents } // revenue − expenses per month
}

/** P&L with one column per month (the accountant's comparative view). Rows are
 *  income/expense accounts with activity in the window; amounts are presented
 *  in each section's positive direction, so contra accounts net correctly. */
export function comparativePnl(
  rows: PeriodBalance[],
  accounts: Account[],
  months: string[],
): ComparativePnl {
  const monthIndex = new Map(months.map((m, i) => [m, i]))
  const byType = new Map(accounts.map((a) => [a._id, a]))

  function section(type: AccountType): { rows: ComparativeRow[]; totals: Cents[]; total: Cents } {
    const acc = new Map<string, number[]>()
    for (const r of rows) {
      const a = byType.get(r.account_id)
      if (!a || a.type !== type) continue
      const i = monthIndex.get(r.period)
      if (i === undefined) continue
      const cells = acc.get(r.account_id) ?? new Array(months.length).fill(0)
      cells[i] += amountFor(type, r)
      acc.set(r.account_id, cells)
    }
    const out: ComparativeRow[] = [...acc.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([account_id, cells]) => ({
        account_id,
        name: byType.get(account_id)?.name ?? account_id,
        cells: cells.map((c) => cents(c)),
        total: cents(cells.reduce((s, c) => s + c, 0)),
      }))
    const totals = months.map((_, i) => cents(out.reduce((s, r) => s + r.cells[i], 0)))
    return { rows: out, totals, total: cents(totals.reduce((s, c) => s + c, 0)) }
  }

  const revenue = section('income')
  const expenses = section('expense')
  return {
    months,
    revenue,
    expenses,
    net: {
      cells: months.map((_, i) => cents(revenue.totals[i] - expenses.totals[i])),
      total: cents(revenue.total - expenses.total),
    },
  }
}
