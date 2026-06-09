import type { PageServerLoad } from './$types'
import { getTrialBalance, listJournalEntries } from '$lib/server/accounting'

// Admin-only (enforced by the page guard in hooks.server.ts). Loads the trial
// balance and the recent ledger entries server-side, the same way the dashboard
// loads its data.
export const load: PageServerLoad = async () => {
  const [trialBalance, entries] = await Promise.all([
    getTrialBalance(),
    listJournalEntries(25),
  ])
  return { trialBalance, entries }
}
