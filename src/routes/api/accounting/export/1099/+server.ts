import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { get1099Data } from '$lib/server/payables'
import { build1099Report } from '$lib/accounting/ten99'
import { ten99Csv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'

// Admin-only CSV of payments to 1099 vendors for a calendar year (?year=).
// Deliberately carries the FULL tax id — this export is what gets handed to
// the accountant to file the 1099s; the on-screen report masks it instead.
export const GET: RequestHandler = async ({ locals, url }) => {
  await requireAdmin(locals)
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear()
  const { payments, billsById, vendors } = await get1099Data(year)
  const { rows, total } = build1099Report(payments, billsById, vendors, year)
  return new Response(ten99Csv(rows, year, total), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`1099-payments_${year}.csv`),
    },
  })
}
