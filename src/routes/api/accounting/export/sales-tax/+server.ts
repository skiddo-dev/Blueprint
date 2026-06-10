import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getSalesTaxReport } from '$lib/server/salesTax'
import { salesTaxCsv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'

// Admin-only CSV of the sales-tax monthly summary (all months on record).
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals)
  const { months, balance } = await getSalesTaxReport()
  return new Response(salesTaxCsv(months, balance), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition('sales-tax.csv'),
    },
  })
}
