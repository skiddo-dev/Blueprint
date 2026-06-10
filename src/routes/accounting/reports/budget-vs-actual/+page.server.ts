import type { PageServerLoad } from './$types'
import { getBudget } from '$lib/server/budgets'
import { getAccounts, getPeriodBalances } from '$lib/server/accounting'
import { budgetVsActual } from '$lib/accounting/budgets'

// Admin-only (page guard in hooks.server.ts). Budget vs actual for one year
// (?year=), YTD through ?through= (1-12, default the current/last month of
// that year).
export const load: PageServerLoad = async ({ url }) => {
  const now = new Date()
  const year = Number(url.searchParams.get('year')) || now.getFullYear()
  const defaultThrough = year === now.getFullYear() ? now.getMonth() + 1 : 12
  const through = Math.min(12, Math.max(1, Number(url.searchParams.get('through')) || defaultThrough))
  const [period, budget, accounts] = await Promise.all([getPeriodBalances(), getBudget(year), getAccounts()])
  return { year, through, hasBudget: !!budget, ...budgetVsActual(period, budget, accounts, year, through) }
}
