import type { PageServerLoad } from './$types'
import { get1099Data } from '$lib/server/payables'
import { build1099Report, maskTaxId } from '$lib/accounting/ten99'

// Admin-only (page guard in hooks.server.ts). Cash paid to 1099-flagged vendors
// per calendar year (?year=, default current). Bill payments only — quick
// expenses carry no vendor link. Tax ids are masked HERE so the raw value never
// rides the page payload — the CSV export is the one deliberate full-id channel.
export const load: PageServerLoad = async ({ url }) => {
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear()
  const { payments, billsById, vendors } = await get1099Data(year)
  const flaggedCount = vendors.filter((v) => v.is_1099).length
  const report = build1099Report(payments, billsById, vendors, year)
  const rows = report.rows.map((r) => ({ ...r, ...(r.tax_id ? { tax_id: maskTaxId(r.tax_id) } : {}) }))
  return { year, flaggedCount, rows, total: report.total }
}
