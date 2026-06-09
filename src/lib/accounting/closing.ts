// Pure year-end closing logic — no database. A closing entry zeroes every income
// and expense account and rolls the net (income − expense) into Retained
// Earnings, so the next period starts fresh and the balance sheet shows prior
// profit as retained earnings rather than a perpetually-growing "current period"
// line. Balanced by construction.
import { type Cents, cents } from '$lib/money'
import type { Account, JournalLine } from './types'
import type { Balance } from './statements'

export const RETAINED_EARNINGS = '3100'

/** Net income (income − expense) implied by a set of account balances. */
export function netIncomeFrom(balances: Balance[], accounts: Account[]): Cents {
  const accById = new Map(accounts.map((a) => [a._id, a]))
  let income = 0
  let expense = 0
  for (const b of balances) {
    const acc = accById.get(b.account_id)
    if (!acc) continue
    if (acc.type === 'income') income += b.credit - b.debit
    else if (acc.type === 'expense') expense += b.debit - b.credit
  }
  return cents(income - expense)
}

/** Closing-entry lines that zero income/expense and roll the net to Retained
 *  Earnings. `balances` are the account balances as of the close date. Returns []
 *  when there's nothing to close. */
export function closingEntryLines(balances: Balance[], accounts: Account[]): JournalLine[] {
  const accById = new Map(accounts.map((a) => [a._id, a]))
  const lines: JournalLine[] = []
  let sumD = 0 // Σ(debit − credit) over the closed accounts
  for (const b of balances) {
    const acc = accById.get(b.account_id)
    if (!acc || (acc.type !== 'income' && acc.type !== 'expense')) continue
    const d = b.debit - b.credit // the account's balance in debit terms
    if (d === 0) continue
    // Post the opposite side to zero the account out.
    if (d > 0) lines.push({ account_id: b.account_id, debit: cents(0), credit: cents(d) })
    else lines.push({ account_id: b.account_id, debit: cents(-d), credit: cents(0) })
    sumD += d
  }
  if (lines.length === 0) return []
  // Balance against Retained Earnings: its (debit − credit) must equal sumD.
  // (sumD < 0 = net profit → credit RE; sumD > 0 = net loss → debit RE.)
  if (sumD > 0) lines.push({ account_id: RETAINED_EARNINGS, debit: cents(sumD), credit: cents(0) })
  else if (sumD < 0) lines.push({ account_id: RETAINED_EARNINGS, debit: cents(0), credit: cents(-sumD) })
  return lines
}
