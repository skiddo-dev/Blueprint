// Pure bank-deposit math — no database. Customer payments can land in 1050
// Undeposited Funds (checks in hand); a Deposit groups N of them into the one
// ledger line the bank statement will actually show: Dr bank / Cr 1050.
import { type Cents, cents, sum } from '$lib/money'
import { ACCT } from './invoicing'
import type { JournalLine } from './types'

export function depositTotal(payments: { amount: Cents }[]): Cents {
  return sum(payments.map((p) => p.amount))
}

/** One deposit entry: Dr the bank account / Cr Undeposited Funds. */
export function depositJournalLines(total: Cents, bankAccountId: string): JournalLine[] {
  return [
    { account_id: bankAccountId, debit: total, credit: cents(0) },
    { account_id: ACCT.undeposited, debit: cents(0), credit: total },
  ]
}
