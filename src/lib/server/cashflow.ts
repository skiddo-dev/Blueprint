// Server-side cash-flow statement. Pulls the posted entries that touched a bank
// account in the period and runs them through the pure cashFlow() attribution;
// beginning cash is the bank balance before the period (reusing getLedgerBalances).
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { getAccounts, getLedgerBalances } from './accounting'
import { cashFlow, type CashFlowCategory, type CashFlowSection } from '$lib/accounting/cashflow'
import { type Cents, cents } from '$lib/money'
import type { JournalEntry } from '$lib/accounting/types'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export async function getCashFlow(from: string, to: string): Promise<{
  sections: Record<CashFlowCategory, CashFlowSection>
  netChange: Cents
  beginningCash: Cents
  endingCash: Cents
}> {
  const accounts = await getAccounts()
  const bankIds = new Set(accounts.filter((a) => a.subtype === 'bank').map((a) => a._id))

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
