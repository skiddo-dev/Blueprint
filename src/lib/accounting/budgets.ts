// Pure budget logic — no database. A budget is one document per fiscal year
// (= calendar year, matching close/1099 conventions): for each income/expense
// account, twelve monthly cents. Budget-vs-actual folds getPeriodBalances()
// rows against it, signed the same way the statements are (income
// credit-positive, expense debit-positive — contra accounts net correctly for
// free).
import { type Cents, cents } from '$lib/money'
import type { Account, AccountType } from './types'
import type { PeriodBalance } from './statements'

export interface BudgetDoc {
  _id: string                       // String(year)
  year: number
  amounts: Record<string, number[]> // account_id → 12 monthly cents
  updated_by?: string
  updated_at: string
}

export interface BudgetRow {
  account_id: string
  name: string
  type: AccountType
  actual: Cents[]      // 12 months
  budget: Cents[]      // 12 months
  actualYtd: Cents     // through `throughMonth`
  budgetYtd: Cents
  varianceYtd: Cents   // favorable is positive: actual−budget for income, budget−actual for expense
}

const signed = (type: AccountType, b: { debit: number; credit: number }): number =>
  type === 'income' ? b.credit - b.debit : b.debit - b.credit

/** Budget vs actual for one year. `throughMonth` is 1-12 — YTD columns stop
 *  there so a June review isn't "under budget" merely because July hasn't
 *  happened. Accounts appear if they have budget OR activity; deactivated
 *  accounts with history still render. */
export function budgetVsActual(
  period: PeriodBalance[],
  budget: BudgetDoc | null,
  accounts: Account[],
  year: number,
  throughMonth: number,
): { rows: BudgetRow[]; totals: { income: BudgetRow; expense: BudgetRow; netActualYtd: Cents; netBudgetYtd: Cents } } {
  const byId = new Map(accounts.map((a) => [a._id, a]))
  const months = Math.min(12, Math.max(1, Math.floor(throughMonth)))

  const actuals = new Map<string, number[]>()
  for (const r of period) {
    if (!r.period.startsWith(`${year}-`)) continue
    const a = byId.get(r.account_id)
    if (!a || (a.type !== 'income' && a.type !== 'expense')) continue
    const idx = Number(r.period.slice(5, 7)) - 1
    const arr = actuals.get(r.account_id) ?? new Array(12).fill(0)
    arr[idx] += signed(a.type, r)
    actuals.set(r.account_id, arr)
  }

  const ids = new Set<string>([...actuals.keys(), ...Object.keys(budget?.amounts ?? {})])
  const rows: BudgetRow[] = []
  for (const id of ids) {
    const a = byId.get(id)
    if (!a || (a.type !== 'income' && a.type !== 'expense')) continue
    const actual = (actuals.get(id) ?? new Array(12).fill(0)).map((n) => cents(n))
    const bud = (budget?.amounts[id] ?? new Array(12).fill(0)).map((n) => cents(n))
    const actualYtd = actual.slice(0, months).reduce((s, n) => s + n, 0)
    const budgetYtd = bud.slice(0, months).reduce((s, n) => s + n, 0)
    rows.push({
      account_id: id,
      name: a.name,
      type: a.type,
      actual,
      budget: bud,
      actualYtd: cents(actualYtd),
      budgetYtd: cents(budgetYtd),
      varianceYtd: cents(a.type === 'income' ? actualYtd - budgetYtd : budgetYtd - actualYtd),
    })
  }
  rows.sort((a, b) => a.account_id.localeCompare(b.account_id))

  const totalOf = (type: AccountType): BudgetRow => {
    const of = rows.filter((r) => r.type === type)
    const actual = Array.from({ length: 12 }, (_, i) => cents(of.reduce((s, r) => s + r.actual[i], 0)))
    const bud = Array.from({ length: 12 }, (_, i) => cents(of.reduce((s, r) => s + r.budget[i], 0)))
    const actualYtd = cents(of.reduce((s, r) => s + r.actualYtd, 0))
    const budgetYtd = cents(of.reduce((s, r) => s + r.budgetYtd, 0))
    return {
      account_id: `_total_${type}`, name: `Total ${type}`, type,
      actual, budget: bud, actualYtd, budgetYtd,
      varianceYtd: cents(type === 'income' ? actualYtd - budgetYtd : budgetYtd - actualYtd),
    }
  }
  const income = totalOf('income')
  const expense = totalOf('expense')
  return {
    rows,
    totals: {
      income,
      expense,
      netActualYtd: cents(income.actualYtd - expense.actualYtd),
      netBudgetYtd: cents(income.budgetYtd - expense.budgetYtd),
    },
  }
}

/** Validate a grid before saving: known income/expense accounts only, exactly
 *  12 non-negative safe integers per row. Returns problems (empty = valid). */
export function validateBudgetAmounts(
  amounts: Record<string, number[]>,
  accounts: Account[],
): string[] {
  const byId = new Map(accounts.map((a) => [a._id, a]))
  const problems: string[] = []
  for (const [id, arr] of Object.entries(amounts)) {
    const a = byId.get(id)
    if (!a) problems.push(`unknown account ${id}`)
    else if (a.type !== 'income' && a.type !== 'expense') problems.push(`${id} is not an income/expense account`)
    if (!Array.isArray(arr) || arr.length !== 12) problems.push(`${id}: needs exactly 12 monthly amounts`)
    else if (arr.some((n) => !Number.isSafeInteger(n) || n < 0)) problems.push(`${id}: amounts must be non-negative cents`)
  }
  return problems
}
