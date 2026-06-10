// Server-side cash-flow statement. Pulls the posted entries that touched a bank
// account in the period and runs them through the pure cashFlow() attribution;
// beginning cash is the bank balance before the period (reusing getLedgerBalances).
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { getAccounts, getLedgerBalances } from './accounting'
import { cashFlow, type CashFlowCategory, type CashFlowSection } from '$lib/accounting/cashflow'
import { isCashLike } from '$lib/accounting/coa'
import { dayBefore } from '$lib/accounting/format'
import { type Cents, cents } from '$lib/money'
import type { JournalEntry } from '$lib/accounting/types'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

export async function getCashFlow(from: string, to: string): Promise<{
  sections: Record<CashFlowCategory, CashFlowSection>
  netChange: Cents
  beginningCash: Cents
  endingCash: Cents
}> {
  const accounts = await getAccounts()
  // Cash set = bank accounts + Undeposited Funds, so a payment into 1050 counts
  // as operating inflow on its payment date and the later deposit entry
  // (1000 <-> 1050, both in the set) nets to zero instead of double-counting.
  const bankIds = new Set(accounts.filter(isCashLike).map((a) => a._id))

  if (USE_MOCK) {
    const cf = cashFlow([], bankIds, accounts)
    return { ...cf, beginningCash: cents(0), endingCash: cents(0) }
  }

  const d = await getDb()
  const entries = (await col('journalEntries', d)
    .find({ status: 'posted', date: { $gte: from, $lte: to }, 'lines.account_id': { $in: [...bankIds] } })
    .sort({ date: 1 })
    .toArray()) as JournalEntry[]

  const cf = cashFlow(entries, bankIds, accounts)
  const before = await getLedgerBalances({ to: dayBefore(from) })
  const beginning = before.filter((b) => bankIds.has(b.account_id)).reduce((t, b) => t + (b.debit - b.credit), 0)
  return { ...cf, beginningCash: cents(beginning), endingCash: cents(beginning + cf.netChange) }
}
