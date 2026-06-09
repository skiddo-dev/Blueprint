// Pure accounts-payable logic — no database. Mirrors invoicing.ts for the money
// we owe. Bill status and aging reuse the AR helpers (the paid-vs-total and
// days-past-due math is identical); only the journal lines differ (which side
// A/P and Cash land on).
import { type Cents, cents, sum as sumCents } from '$lib/money'
import type { BillLine, JournalLine } from './types'

// Ledger accounts the AP flow posts to (codes from the seeded chart of accounts).
export const ACCT_AP = {
  ap: '2000',   // Accounts Payable
  cash: '1000', // Cash — Operating
} as const

/** Total of a bill: the sum of its line amounts. */
export function billTotal(lines: { amount: Cents }[]): Cents {
  return sumCents(lines.map((l) => l.amount))
}

/** Posting a bill: Dr each line's expense/COGS account / Cr A/P (total).
 *  Balances because the A/P credit equals the sum of the line debits. */
export function billJournalLines(lines: BillLine[], total: Cents): JournalLine[] {
  const debits: JournalLine[] = lines.map((l) => ({
    account_id: l.account_id,
    debit: l.amount,
    credit: cents(0),
    ...(l.description ? { memo: l.description } : {}),
  }))
  return [...debits, { account_id: ACCT_AP.ap, debit: cents(0), credit: total }]
}

/** Paying a bill: Dr A/P / Cr Cash. */
export function billPaymentJournalLines(amount: Cents): JournalLine[] {
  return [
    { account_id: ACCT_AP.ap, debit: amount, credit: cents(0) },
    { account_id: ACCT_AP.cash, debit: cents(0), credit: amount },
  ]
}
