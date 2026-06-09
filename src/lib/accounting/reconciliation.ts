// Pure bank-reconciliation logic — no database. A reconciliation ties the cleared
// book balance of a bank account to a bank statement's ending balance: you tick
// off the recorded transactions that have cleared the bank, and it reconciles
// when (already-cleared balance + newly-ticked) equals the statement balance.
import { type Cents, cents, sum as sumCents } from '$lib/money'

export interface BankTxn {
  entry_id: string
  date: string
  memo?: string
  source: string
  amount: Cents      // signed effect on the bank account (debit − credit on it); + deposit, − payment
  cleared: boolean   // already reconciled in a prior statement
}

/** Signed effect of an entry on one account: (debit − credit) summed over its
 *  lines on that account. Positive increases a bank (debit-normal asset). */
export function accountEffect(
  entry: { lines: { account_id: string; debit: Cents; credit: Cents }[] },
  accountId: string,
): Cents {
  let n = 0
  for (const l of entry.lines) if (l.account_id === accountId) n += l.debit - l.credit
  return cents(n)
}

export interface ReconcileInput {
  beginningBalance: Cents  // cleared book balance before this reconciliation
  statementBalance: Cents  // statement ending balance
  clearedAmounts: Cents[]  // signed amounts of the newly-ticked transactions
}

/** The live reconciliation math. Reconciles when difference is zero. */
export function reconcileSummary(input: ReconcileInput): {
  clearedTotal: Cents       // sum of newly-ticked amounts
  reconciledBalance: Cents  // beginning + clearedTotal
  difference: Cents         // statementBalance − reconciledBalance
  balanced: boolean
} {
  const clearedTotal = sumCents(input.clearedAmounts)
  const reconciledBalance = cents(input.beginningBalance + clearedTotal)
  const difference = cents(input.statementBalance - reconciledBalance)
  return { clearedTotal, reconciledBalance, difference, balanced: difference === 0 }
}
