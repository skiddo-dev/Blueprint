import type { PageServerLoad } from './$types'
import { getAccounts } from '$lib/server/accounting'

// Admin-only (page guard in hooks.server.ts). The form needs the chart of
// accounts for its line-item dropdowns.
export const load: PageServerLoad = async () => {
  return { accounts: await getAccounts() }
}
