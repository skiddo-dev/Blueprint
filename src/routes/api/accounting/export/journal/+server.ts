import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getAccounts, listPostedEntries } from '$lib/server/accounting'
import { journalCsv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'

// Admin-only CSV of the Journal report, one row per posted LINE — mirrors the
// report page load. Defaults to YTD; ?from=&to= override.
export const GET: RequestHandler = async ({ locals, url }) => {
  await requireAdmin(locals)
  const today = new Date().toISOString().slice(0, 10)
  const from = url.searchParams.get('from') || `${today.slice(0, 4)}-01-01`
  const to = url.searchParams.get('to') || today
  const [entries, accounts] = await Promise.all([listPostedEntries({ from, to }), getAccounts()])
  const names = new Map(accounts.map((a) => [a._id, a.name]))
  const csv = journalCsv(entries, names)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`journal_${from}_${to}.csv`),
    },
  })
}
