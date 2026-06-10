import type { PageServerLoad } from './$types'
import { getLedgerBalances, getAccounts } from '$lib/server/accounting'
import { getCashBasisBalances } from '$lib/server/cashbasis'
import { balanceSheet } from '$lib/accounting/statements'

// Admin-only (page guard in hooks.server.ts). Cumulative as-of a date (today by
// default; ?asOf= overrides).
export const load: PageServerLoad = async ({ url }) => {
  const asOf = url.searchParams.get('asOf') || new Date().toISOString().slice(0, 10)
  const basis = url.searchParams.get('basis') === 'cash' ? 'cash' : 'accrual'
  // Cash-basis BS excludes closing entries (their amounts are accrual-derived);
  // cumulative cash net income rides the "Net income (current period)" line.
  const [balances, accounts] = await Promise.all([
    basis === 'cash' ? getCashBasisBalances({ to: asOf, excludeClosing: true }) : getLedgerBalances({ to: asOf }),
    getAccounts(),
  ])
  return { asOf, basis, statement: balanceSheet(balances, accounts) }
}
