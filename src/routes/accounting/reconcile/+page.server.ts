import type { PageServerLoad } from './$types'
import { getBankAccounts, getBankTransactions, listReconciliations } from '$lib/server/reconciliation'

// Admin-only (page guard in hooks.server.ts). Reconcile one bank account at a
// time (?account=); defaults to the first bank account.
export const load: PageServerLoad = async ({ url }) => {
  const accounts = await getBankAccounts()
  const accountId = url.searchParams.get('account') || accounts[0]?._id || ''
  if (!accountId) {
    return { accounts, accountId: '', uncleared: [], clearedBalance: 0, bookBalance: 0, history: [] }
  }
  const [{ txns, clearedBalance, bookBalance }, history] = await Promise.all([
    getBankTransactions(accountId),
    listReconciliations(accountId),
  ])
  return { accounts, accountId, uncleared: txns.filter((t) => !t.cleared), clearedBalance, bookBalance, history }
}
