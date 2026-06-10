import type { PageServerLoad } from './$types'
import { getAccounts, getPeriodBalances } from '$lib/server/accounting'
import { comparativePnl } from '$lib/accounting/statements'

function shiftMonth(yyyyMM: string, monthsAgo: number): string {
  const d = new Date(`${yyyyMM}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - monthsAgo)
  return d.toISOString().slice(0, 7)
}

// Admin-only (page guard in hooks.server.ts). Comparative P&L — one column per
// month ending with the current one. ?months=3|6|12 picks the window.
export const load: PageServerLoad = async ({ url }) => {
  const span = Math.min(24, Math.max(2, Number(url.searchParams.get('months')) || 6))
  const thisMonth = new Date().toISOString().slice(0, 7)
  const months = Array.from({ length: span }, (_, i) => shiftMonth(thisMonth, span - 1 - i))

  const [balances, accounts] = await Promise.all([getPeriodBalances(), getAccounts()])
  return { months: span, pnl: comparativePnl(balances, accounts, months) }
}
