// Pure cash-flow logic — no database. Derives the period's cash movement straight
// from the ledger: for every posted entry that touches a bank account, the cash
// delta is attributed to the entry's NON-bank counterpart account(s), then
// classified Operating / Investing / Financing by that counterpart's type.
//
// Direct-ish method (not the indirect/working-capital reconciliation) — derivable
// and honest for a contractor's books.
import { type Cents, cents } from '$lib/money'
import type { Account, JournalEntry } from './types'

export type CashFlowCategory = 'operating' | 'investing' | 'financing'
const CATEGORIES: CashFlowCategory[] = ['operating', 'investing', 'financing']
const TITLES: Record<CashFlowCategory, string> = {
  operating: 'Operating activities',
  investing: 'Investing activities',
  financing: 'Financing activities',
}

/** Which cash-flow section a counterpart account belongs to. Fixed assets =
 *  investing; long-term debt + equity = financing; everything else = operating. */
export function categorize(account: Account | undefined): CashFlowCategory {
  if (!account) return 'operating'
  if (account.subtype === 'fixed-asset') return 'investing'
  if (account.type === 'equity' || account.subtype === 'long-term-liability') return 'financing'
  return 'operating'
}

export interface CashFlowLine { account_id: string; name: string; amount: Cents }
export interface CashFlowSection { category: CashFlowCategory; title: string; lines: CashFlowLine[]; total: Cents }

/** Attribute each bank-affecting entry's cash delta to its counterpart accounts
 *  and group into the three sections. `netChange` always equals the total cash
 *  moved across the bank accounts in the period. */
export function cashFlow(
  entries: JournalEntry[],
  bankIds: Set<string>,
  accounts: Account[],
): { sections: Record<CashFlowCategory, CashFlowSection>; netChange: Cents } {
  const accById = new Map(accounts.map((a) => [a._id, a]))
  const byCounterpart = new Map<string, number>()

  for (const e of entries) {
    if (e.status !== 'posted') continue
    let bankDelta = 0
    const nonBank: { account_id: string; debit: number; credit: number }[] = []
    for (const l of e.lines) {
      if (bankIds.has(l.account_id)) bankDelta += l.debit - l.credit
      else nonBank.push(l)
    }
    if (bankDelta === 0) continue // entry doesn't move cash (e.g. an internal accrual)
    // For a balanced entry, bankDelta === -Σ(nonBank debit−credit); so the cash
    // attributable to each counterpart is −(its debit−credit).
    for (const nb of nonBank) {
      byCounterpart.set(nb.account_id, (byCounterpart.get(nb.account_id) ?? 0) - (nb.debit - nb.credit))
    }
  }

  const sections = Object.fromEntries(
    CATEGORIES.map((c) => [c, { category: c, title: TITLES[c], lines: [] as CashFlowLine[], total: cents(0) }]),
  ) as Record<CashFlowCategory, CashFlowSection>

  let net = 0
  for (const [accId, amount] of byCounterpart) {
    if (amount === 0) continue
    const acc = accById.get(accId)
    sections[categorize(acc)].lines.push({ account_id: accId, name: acc?.name ?? accId, amount: cents(amount) })
    net += amount
  }
  for (const c of CATEGORIES) {
    sections[c].lines.sort((a, b) => a.account_id.localeCompare(b.account_id))
    sections[c].total = cents(sections[c].lines.reduce((t, l) => t + l.amount, 0))
  }
  return { sections, netChange: cents(net) }
}
