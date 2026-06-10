import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getLedgerBalances, getAccounts } from '$lib/server/accounting'
import { getCashBasisBalances } from '$lib/server/cashbasis'
import { incomeStatement } from '$lib/accounting/statements'
import { incomeStatementCsv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'

// Admin-only CSV of the P&L. Mirrors the income-statement page load exactly:
// defaults to year-to-date, ?from=&to= override.
export const GET: RequestHandler = async ({ locals, url }) => {
  await requireAdmin(locals)
  const today = new Date().toISOString().slice(0, 10)
  const from = url.searchParams.get('from') || `${today.slice(0, 4)}-01-01`
  const to = url.searchParams.get('to') || today
  const cash = url.searchParams.get('basis') === 'cash'
  const [balances, accounts] = await Promise.all([
    cash ? getCashBasisBalances({ from, to, excludeClosing: true }) : getLedgerBalances({ from, to, excludeClosing: true }),
    getAccounts(),
  ])
  const csv = incomeStatementCsv(incomeStatement(balances, accounts), from, to)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`income-statement_${url.searchParams.get('basis') === 'cash' ? 'cash_' : ''}${from}_${to}.csv`),
    },
  })
}
