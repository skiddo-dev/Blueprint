import type { PageServerLoad } from './$types'
import { listVendors } from '$lib/server/payables'
import { getAccounts } from '$lib/server/accounting'
import { listJobs } from '$lib/server/jobs'
import { aiConfigured } from '$lib/server/booksAi'

// Admin-only (page guard in hooks.server.ts). The form needs existing vendors
// (name autocomplete) and the expense/COGS accounts a bill line can be charged
// to; `ai` gates the scan-a-bill button.
export const load: PageServerLoad = async () => {
  const [vendors, accounts, jobs] = await Promise.all([listVendors(), getAccounts(), listJobs()])
  return {
    vendors,
    expenseAccounts: accounts.filter((a) => a.type === 'expense' && a.active),
    jobs,
    ai: aiConfigured(),
  }
}
