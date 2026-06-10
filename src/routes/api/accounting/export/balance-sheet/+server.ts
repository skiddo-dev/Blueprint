import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getLedgerBalances, getAccounts } from '$lib/server/accounting'
import { getCashBasisBalances } from '$lib/server/cashbasis'
import { balanceSheet } from '$lib/accounting/statements'
import { balanceSheetCsv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'

// Admin-only CSV of the balance sheet as of a date (?asOf=, default today) —
// mirrors the balance-sheet page load.
export const GET: RequestHandler = async ({ locals, url }) => {
  await requireAdmin(locals)
  const asOf = url.searchParams.get('asOf') || new Date().toISOString().slice(0, 10)
  const cash = url.searchParams.get('basis') === 'cash'
  const [balances, accounts] = await Promise.all([
    cash ? getCashBasisBalances({ to: asOf, excludeClosing: true }) : getLedgerBalances({ to: asOf }),
    getAccounts(),
  ])
  const csv = balanceSheetCsv(balanceSheet(balances, accounts), asOf)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`balance-sheet_${asOf}.csv`),
    },
  })
}
