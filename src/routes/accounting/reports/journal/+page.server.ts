import type { PageServerLoad } from './$types'
import { getAccounts, listPostedEntries } from '$lib/server/accounting'

// Admin-only (page guard in hooks.server.ts). The Journal report: every entry
// in date order with its debit/credit lines. Defaults to YTD.
export const load: PageServerLoad = async ({ url }) => {
  const today = new Date().toISOString().slice(0, 10)
  const from = url.searchParams.get('from') || `${today.slice(0, 4)}-01-01`
  const to = url.searchParams.get('to') || today
  const [entries, accounts] = await Promise.all([
    listPostedEntries({ from, to }),
    getAccounts(),
  ])
  const names = Object.fromEntries(accounts.map((a) => [a._id, a.name]))
  return { from, to, entries, names }
}
