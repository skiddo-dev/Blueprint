import type { PageServerLoad } from './$types'
import { getBankAccounts, getBankTransactions, listReconciliations } from '$lib/server/reconciliation'
import { getAccounts } from '$lib/server/accounting'
import { categoryAccounts } from '$lib/accounting/categorize'
import { aiConfigured } from '$lib/server/booksAi'

// Admin-only (page guard in hooks.server.ts). Reconcile one bank account at a
// time (?account=); defaults to the first bank account. Also ships the
// expense/income accounts so unmatched statement lines can be categorized and
// recorded in place.
export const load: PageServerLoad = async ({ url }) => {
  const [accounts, all] = await Promise.all([getBankAccounts(), getAccounts()])
  const { expense, income } = categoryAccounts(all)
  const slim = (a: { _id: string; code: string; name: string }) => ({ _id: a._id, code: a.code, name: a.name })
  const category = { expense: expense.map(slim), income: income.map(slim) }
  const ai = aiConfigured()
  const accountId = url.searchParams.get('account') || accounts[0]?._id || ''
  if (!accountId) {
    return { accounts, accountId: '', uncleared: [], clearedBalance: 0, bookBalance: 0, history: [], category, ai }
  }
  const [{ txns, clearedBalance, bookBalance }, history] = await Promise.all([
    getBankTransactions(accountId),
    listReconciliations(accountId),
  ])
  return { accounts, accountId, uncleared: txns.filter((t) => !t.cleared), clearedBalance, bookBalance, history, category, ai }
}
