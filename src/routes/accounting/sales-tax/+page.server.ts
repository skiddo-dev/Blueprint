import type { PageServerLoad } from './$types'
import { getSalesTaxReport, listRemittances } from '$lib/server/salesTax'
import { getBankAccounts } from '$lib/server/reconciliation'

// Admin-only (page guard in hooks.server.ts). Sales tax collected/credited/
// remitted by month, the current liability balance, and remittance history.
export const load: PageServerLoad = async () => {
  const [report, remittances, bankAccounts] = await Promise.all([
    getSalesTaxReport(),
    listRemittances(),
    getBankAccounts(),
  ])
  return { ...report, remittances, bankAccounts }
}
