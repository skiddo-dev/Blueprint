import type { PageServerLoad } from './$types'
import {
  getTrialBalance,
  listJournalEntries,
  getCloseThrough,
  getLedgerBalances,
  getAccounts,
} from '$lib/server/accounting'
import { getArAging } from '$lib/server/invoicing'
import { getApAging } from '$lib/server/payables'
import { incomeStatement } from '$lib/accounting/statements'

// Admin-only (enforced by the page guard in hooks.server.ts). Loads the trial
// balance, recent ledger entries, and the period-close date — plus the V2 hub
// KPIs (cash on hand, A/R & A/P aging, net income MTD/YTD). Everything composes
// existing accounting libs; no new server logic.
export const load: PageServerLoad = async () => {
  const today = new Date().toISOString().slice(0, 10)
  const year = today.slice(0, 4)
  const monthStart = `${today.slice(0, 7)}-01`

  const [trialBalance, entries, closeThrough, accounts, arAging, apAging, ytdBalances, mtdBalances] =
    await Promise.all([
      getTrialBalance(),
      listJournalEntries(10),
      getCloseThrough(),
      getAccounts(),
      getArAging(),
      getApAging(),
      getLedgerBalances({ from: `${year}-01-01`, to: today, excludeClosing: true }),
      getLedgerBalances({ from: monthStart, to: today, excludeClosing: true }),
    ])

  // Cash on hand = net (debit-normal) balance of the bank-subtype accounts,
  // read off the trial balance we already have.
  const bankIds = new Set(accounts.filter((a) => a.subtype === 'bank' && a.active).map((a) => a._id))
  const cashOnHand = trialBalance.rows.reduce((sum, r) => sum + (bankIds.has(r.account_id) ? r.net : 0), 0)

  const kpis = {
    cashOnHand,
    ar: { total: arAging.total, overdue: arAging.total - arAging.buckets.current },
    ap: { total: apAging.total, overdue: apAging.total - apAging.buckets.current },
    netIncomeYtd: incomeStatement(ytdBalances, accounts).netIncome,
    netIncomeMtd: incomeStatement(mtdBalances, accounts).netIncome,
  }

  return { trialBalance, entries, closeThrough, kpis, arAging, apAging }
}
