import type { PageServerLoad } from './$types'
import { listVendors } from '$lib/server/payables'
import { getAccounts } from '$lib/server/accounting'
import { listJobs } from '$lib/server/jobs'

// Admin-only (page guard in hooks.server.ts). Mirrors the bill form's needs:
// vendor autocomplete + the expense/COGS accounts a PO line commits to.
export const load: PageServerLoad = async () => {
  const [vendors, accounts, jobs] = await Promise.all([listVendors(), getAccounts(), listJobs()])
  return {
    vendors,
    expenseAccounts: accounts.filter((a) => a.type === 'expense' && a.active),
    jobs,
  }
}
