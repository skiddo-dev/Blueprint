import type { PageServerLoad } from './$types'
import { getAccounts, listPostedEntries } from '$lib/server/accounting'
import { generalLedger } from '$lib/accounting/ledger'

// Admin-only (page guard in hooks.server.ts). The classic General Ledger:
// every posting in the period grouped per account with totals. Defaults to YTD.
export const load: PageServerLoad = async ({ url }) => {
  const today = new Date().toISOString().slice(0, 10)
  const from = url.searchParams.get('from') || `${today.slice(0, 4)}-01-01`
  const to = url.searchParams.get('to') || today
  const [entries, accounts] = await Promise.all([
    listPostedEntries({ from, to }),
    getAccounts(),
  ])
  return { from, to, groups: generalLedger(entries, accounts) }
}
