import type { PageServerLoad } from './$types'
import { getJobDocs } from '$lib/server/jobs'
import { jobProfitability } from '$lib/accounting/jobs'

// Admin-only (page guard in hooks.server.ts). Job profitability — the per-job
// P&L QuickBooks sells as "Projects". Accrual-by-document v1: invoice totals
// as revenue, bill totals + job-tagged quick expenses as costs.
export const load: PageServerLoad = async () => {
  const { invoices, bills, expenses } = await getJobDocs()
  return { report: jobProfitability(invoices, bills, expenses) }
}
