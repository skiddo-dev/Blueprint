import type { PageServerLoad } from './$types'
import { getAccounts } from '$lib/server/accounting'
import { listVendors } from '$lib/server/payables'

// Admin-only (page guard in hooks.server.ts). Accounts for the quick-expense
// form: expense accounts to book against, bank accounts to pay from, and the
// vendor list for the payee datalist.
export const load: PageServerLoad = async () => {
  const [accounts, vendors] = await Promise.all([getAccounts(), listVendors()])
  return {
    expenseAccounts: accounts.filter((a) => a.type === 'expense' && a.active),
    bankAccounts: accounts.filter((a) => a.subtype === 'bank' && a.active),
    vendors,
  }
}
