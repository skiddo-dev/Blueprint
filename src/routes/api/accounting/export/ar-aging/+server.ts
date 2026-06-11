import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getArAging } from '$lib/server/invoicing'
import { agingCsv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'

// Admin-only CSV of A/R aging as of today — mirrors the aging page load.
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals)
  const today = new Date().toISOString().slice(0, 10)
  const csv = agingCsv(await getArAging(), 'ar', today)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`ar-aging_${today}.csv`),
    },
  })
}
