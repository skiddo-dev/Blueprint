import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getAccounts, getLedgerBalances, listPostedEntries } from '$lib/server/accounting'
import { accountRegister } from '$lib/accounting/ledger'
import { registerCsv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'
import { cents } from '$lib/money'
import { dayBefore } from '$lib/accounting/format'

// Admin-only CSV of one account's register — mirrors the register page load:
// all activity by default, ?from=&to= narrow the window (the opening balance
// then carries everything before it).
export const GET: RequestHandler = async ({ locals, params, url }) => {
  await requireAdmin(locals)
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
  const presentedOpening = account.normal === 'credit' ? -opening : opening
  const csv = registerCsv(register.rows, account, presentedOpening)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`register_${account._id}_${from ?? 'start'}_${to ?? 'now'}.csv`),
    },
  })
}
