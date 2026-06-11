import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getApAging } from '$lib/server/payables'
import { agingCsv } from '$lib/accounting/reportCsv'
import { contentDisposition } from '$lib/sanitize'

// Admin-only CSV of A/P aging as of today — mirrors the ap-aging page load.
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals)
  const today = new Date().toISOString().slice(0, 10)
  const csv = agingCsv(await getApAging(), 'ap', today)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(`ap-aging_${today}.csv`),
    },
  })
}
