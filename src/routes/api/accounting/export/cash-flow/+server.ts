import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getCashFlow } from '$lib/server/cashflow'
import { cashFlowCsv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'

// Admin-only CSV of the cash-flow statement. Mirrors the cash-flow page load:
// defaults to year-to-date, ?from=&to= override. No basis param — the statement
// is derived from actual bank movement, so it has no accrual/cash toggle.
export const GET: RequestHandler = async ({ locals, url }) => {
  await requireAdmin(locals)
  const today = new Date().toISOString().slice(0, 10)
  const from = url.searchParams.get('from') || `${today.slice(0, 4)}-01-01`
  const to = url.searchParams.get('to') || today
  const csv = cashFlowCsv(await getCashFlow(from, to), from, to)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`cash-flow_${from}_${to}.csv`),
    },
  })
}
