import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getTrialBalance } from '$lib/server/accounting'
import { trialBalanceCsv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'

// Admin-only CSV of the trial balance, mirroring the hub's collapsible table.
// ?asOf= bounds it to a date (default: all postings).
export const GET: RequestHandler = async ({ locals, url }) => {
  await requireAdmin(locals)
  const asOf = url.searchParams.get('asOf') || undefined
  const tb = await getTrialBalance(asOf ? { asOf } : {})
  const csv = trialBalanceCsv(tb.rows, tb.totalDebit, tb.totalCredit)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`trial-balance_${asOf ?? 'all'}.csv`),
    },
  })
}
