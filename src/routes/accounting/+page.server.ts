import type { PageServerLoad } from './$types'
import {
  getTrialBalance,
  listJournalEntries,
  getCloseThrough,
  getPeriodBalances,
  getAccounts,
} from '$lib/server/accounting'
import { getArAging } from '$lib/server/invoicing'
import { getApAging } from '$lib/server/payables'
import { monthlyActivity, type MonthActivity } from '$lib/accounting/statements'
import { dueWithin } from '$lib/accounting/invoicing'

const TREND_MONTHS = 6

/** "YYYY-MM" for `monthsAgo` months before the given month. */
function shiftMonth(yyyyMM: string, monthsAgo: number): string {
  const d = new Date(`${yyyyMM}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - monthsAgo)
  return d.toISOString().slice(0, 7)
}

/** Pad the sparse activity list into a continuous month range ending at `last`,
 *  so cumulative cash math and the chart's x-axis don't skip quiet months. */
function continuousMonths(activity: MonthActivity[], last: string, count: number): MonthActivity[] {
  const byMonth = new Map(activity.map((m) => [m.month, m]))
  const out: MonthActivity[] = []
  for (let i = count - 1; i >= 0; i--) {
    const month = shiftMonth(last, i)
    out.push(byMonth.get(month) ?? ({ month, revenue: 0, expenses: 0, net: 0, bankNet: 0 } as MonthActivity))
  }
  return out
}

// Admin-only (enforced by the page guard in hooks.server.ts). Loads the trial
// balance, recent ledger entries, and the period-close date — plus the V3 hub
// KPIs and trends. One month-bucketed aggregation (getPeriodBalances) feeds the
// revenue/expense trend, the cash sparkline, and the net-income MTD/YTD figures.
export const load: PageServerLoad = async () => {
  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)
  const year = today.slice(0, 4)

  const [trialBalance, entries, closeThrough, accounts, arAging, apAging, periodBalances] =
    await Promise.all([
      getTrialBalance(),
      listJournalEntries(10),
      getCloseThrough(),
      getAccounts(),
      getArAging(),
      getApAging(),
      getPeriodBalances(),
    ])

  const activity = monthlyActivity(periodBalances, accounts)

  // Cash on hand = net (debit-normal) balance of the bank-subtype accounts,
  // read off the trial balance we already have.
  const bankIds = new Set(accounts.filter((a) => a.subtype === 'bank' && a.active).map((a) => a._id))
  const cashOnHand = trialBalance.rows.reduce((sum, r) => sum + (bankIds.has(r.account_id) ? r.net : 0), 0)

  // Trend window + cash sparkline: cumulative bank movement at each month end.
  // Closing entries never touch bank accounts, so cumulative bankNet IS cash.
  const trend = continuousMonths(activity, thisMonth, TREND_MONTHS)
  const priorCash = activity
    .filter((m) => m.month < trend[0].month)
    .reduce((sum, m) => sum + m.bankNet, 0)
  const cashSpark: number[] = []
  let running = priorCash
  for (const m of trend) {
    running += m.bankNet
    cashSpark.push(running)
  }
  const cashDeltaMtd = trend[trend.length - 1].bankNet

  const netIncomeYtd = activity.filter((m) => m.month.startsWith(year)).reduce((s, m) => s + m.net, 0)
  const netIncomeMtd = activity.find((m) => m.month === thisMonth)?.net ?? 0

  const kpis = {
    cashOnHand,
    cashDeltaMtd,
    ar: { total: arAging.total, overdue: arAging.total - arAging.buckets.current },
    ap: { total: apAging.total, dueSoon: dueWithin(apAging.rows, today, 7) },
    netIncomeYtd,
    netIncomeMtd,
  }

  return { trialBalance, entries, closeThrough, kpis, trend, cashSpark, arAging, apAging }
}
