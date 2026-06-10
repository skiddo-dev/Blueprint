// Pure sales-tax math — no database. Sales tax collected on invoices sits in
// the Sales Tax Payable liability (2200, see invoicing.ts ACCT) until it's
// remitted to the state. This module folds the 2200 activity into a monthly
// collected / credited / remitted view and builds the remittance posting.
//
// Source attribution leans on a ledger invariant: reversals KEEP the original
// entry's `source` (buildReversingEntry), so a voided invoice's reversal shows
// up here as negative `collected` in the month of the void — the report
// self-corrects without special-casing voids.
import { type Cents, cents } from '$lib/money'
import type { JournalEntry, JournalLine } from './types'

export const SALES_TAX_ACCT = '2200'

export interface SalesTaxMonth {
  period: string    // "YYYY-MM"
  collected: Cents  // net Cr 2200 from invoice activity (voids net out)
  credited: Cents   // net Dr 2200 from credit memos (tax handed back)
  remitted: Cents   // net Dr 2200 from remittances (voided remittances net out)
  net: Cents        // collected − credited − remitted
}

/** Monthly 2200 activity + the running liability balance. `entries` is every
 *  posted entry touching 2200 (any window); months come back sorted. */
export function salesTaxSummary(entries: JournalEntry[]): { months: SalesTaxMonth[]; balance: Cents } {
  const byMonth = new Map<string, { collected: number; credited: number; remitted: number }>()
  let balance = 0
  for (const e of entries) {
    if (e.status !== 'posted') continue
    for (const l of e.lines) {
      if (l.account_id !== SALES_TAX_ACCT) continue
      const m = byMonth.get(e.period) ?? { collected: 0, credited: 0, remitted: 0 }
      const credit = l.credit - l.debit // liability: credit grows the balance
      balance += credit
      if (e.source === 'invoice') m.collected += credit
      else if (e.source === 'credit-memo') m.credited -= credit // Dr side → positive "given back"
      else if (e.source === 'sales-tax-remittance') m.remitted -= credit
      else m.collected += credit // manual adjustments count as collected activity
      byMonth.set(e.period, m)
    }
  }
  const months = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([period, m]) => ({
      period,
      collected: cents(m.collected),
      credited: cents(m.credited),
      remitted: cents(m.remitted),
      net: cents(m.collected - m.credited - m.remitted),
    }))
  return { months, balance: cents(balance) }
}

/** Remitting collected tax to the state: Dr Sales Tax Payable / Cr the bank
 *  account the check came from. */
export function remittanceJournalLines(amount: Cents, bankAccountId: string): JournalLine[] {
  return [
    { account_id: SALES_TAX_ACCT, debit: amount, credit: cents(0) },
    { account_id: bankAccountId, debit: cents(0), credit: amount },
  ]
}
