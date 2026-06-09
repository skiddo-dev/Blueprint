import type { PageServerLoad } from './$types'
import { getLedgerBalances, getAccounts } from '$lib/server/accounting'
import { balanceSheet } from '$lib/accounting/statements'

// Admin-only (page guard in hooks.server.ts). Cumulative as-of a date (today by
// default; ?asOf= overrides).
export const load: PageServerLoad = async ({ url }) => {
  const asOf = url.searchParams.get('asOf') || new Date().toISOString().slice(0, 10)
  const [balances, accounts] = await Promise.all([getLedgerBalances({ to: asOf }), getAccounts()])
  return { asOf, statement: balanceSheet(balances, accounts) }
}
