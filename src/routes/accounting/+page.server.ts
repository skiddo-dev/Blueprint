import type { PageServerLoad } from './$types'
import { getTrialBalance, listJournalEntries, getCloseThrough } from '$lib/server/accounting'

// Admin-only (enforced by the page guard in hooks.server.ts). Loads the trial
// balance, recent ledger entries, and the period-close date server-side, the same
// way the dashboard loads its data.
export const load: PageServerLoad = async () => {
  const [trialBalance, entries, closeThrough] = await Promise.all([
    getTrialBalance(),
    listJournalEntries(25),
    getCloseThrough(),
  ])
  return { trialBalance, entries, closeThrough }
}
