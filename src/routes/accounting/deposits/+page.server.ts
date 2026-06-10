import type { PageServerLoad } from './$types'
import { listUndepositedPayments, listDeposits } from '$lib/server/deposits'
import { getBankAccounts } from '$lib/server/reconciliation'

// Admin-only (page guard in hooks.server.ts). Undeposited payments waiting to
// be grouped, plus deposit history.
export const load: PageServerLoad = async () => {
  const [undeposited, deposits, bankAccounts] = await Promise.all([
    listUndepositedPayments(),
    listDeposits(),
    getBankAccounts(),
  ])
  return { undeposited, deposits, bankAccounts }
}
