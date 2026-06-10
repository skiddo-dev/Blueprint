import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getAccounts, getLedgerBalances, listPostedEntries } from '$lib/server/accounting'
import { accountRegister } from '$lib/accounting/ledger'
import { cents } from '$lib/money'
import { dayBefore } from '$lib/accounting/format'

// Admin-only (page guard in hooks.server.ts). One account's transaction history
// with a running balance — QuickBooks' "account register". Defaults to all
// activity; ?from=&to= narrows the window (the opening row then carries
// everything before it).
export const load: PageServerLoad = async ({ params, url }) => {
  const accounts = await getAccounts()
  const account = accounts.find((a) => a._id === params.account)
  if (!account) throw error(404, `No account ${params.account}`)

  const from = url.searchParams.get('from') || undefined
  const to = url.searchParams.get('to') || undefined

  let opening = 0
  if (from) {
    const before = await getLedgerBalances({ to: dayBefore(from) })
    const b = before.find((r) => r.account_id === account._id)
    opening = b ? b.debit - b.credit : 0
  }

  const entries = await listPostedEntries({ account: account._id, from, to })
  const register = accountRegister(entries, account._id, cents(opening), account.normal)

  return {
    account,
    accounts: accounts.filter((a) => a.active),
    from: from ?? '',
    to: to ?? '',
    opening: account.normal === 'credit' ? -opening : opening,
    register,
  }
}
