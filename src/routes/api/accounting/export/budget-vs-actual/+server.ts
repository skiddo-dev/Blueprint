import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getBudget } from '$lib/server/budgets'
import { getAccounts, getPeriodBalances } from '$lib/server/accounting'
import { budgetVsActual } from '$lib/accounting/budgets'
import { budgetVsActualCsv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'

// Admin-only CSV of budget vs actual — mirrors the report page load.
export const GET: RequestHandler = async ({ locals, url }) => {
  await requireAdmin(locals)
  const now = new Date()
  const year = Number(url.searchParams.get('year')) || now.getFullYear()
  const defaultThrough = year === now.getFullYear() ? now.getMonth() + 1 : 12
  const through = Math.min(12, Math.max(1, Number(url.searchParams.get('through')) || defaultThrough))
  const [period, budget, accounts] = await Promise.all([getPeriodBalances(), getBudget(year), getAccounts()])
  const { rows, totals } = budgetVsActual(period, budget, accounts, year, through)
  return new Response(budgetVsActualCsv(rows, totals, year, through), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`budget-vs-actual_${year}_m${through}.csv`),
    },
  })
}
