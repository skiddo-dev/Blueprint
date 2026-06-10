import type { PageServerLoad } from './$types'
import { listCustomers } from '$lib/server/invoicing'
import { listJobs } from '$lib/server/jobs'
import { getQuotes } from '$lib/server/db'

// Admin-only (page guard in hooks.server.ts). The form needs existing customers
// (for the name autocomplete) and won quotes (to optionally prefill an invoice).
export const load: PageServerLoad = async () => {
  const [customers, quotes, jobs] = await Promise.all([listCustomers(), getQuotes(), listJobs()])
  return {
    customers,
    wonQuotes: quotes.filter((q) => q.status === 'won'),
    jobs,
  }
}
