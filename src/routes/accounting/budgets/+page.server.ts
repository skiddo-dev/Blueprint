import type { PageServerLoad } from './$types'
import { getBudget } from '$lib/server/budgets'
import { getAccounts } from '$lib/server/accounting'

// Admin-only (page guard in hooks.server.ts). The budget grid for one year
// (?year=, default current): income + expense accounts × 12 months.
export const load: PageServerLoad = async ({ url }) => {
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear()
  const [budget, accounts] = await Promise.all([getBudget(year), getAccounts()])
  const pl = accounts.filter((a) => (a.type === 'income' || a.type === 'expense') && (a.active || (budget?.amounts[a._id]?.some((n) => n > 0) ?? false)))
  return { year, budget, accounts: pl }
}
