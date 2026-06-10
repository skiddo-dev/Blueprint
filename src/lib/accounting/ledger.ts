// Pure double-entry ledger logic — no database. The server module
// (src/lib/server/accounting.ts) wraps these to persist; keeping them pure means
// the balancing rules, reversal, and trial-balance math are unit-tested without a
// live Mongo.
import { type Cents, cents, sum as sumCents } from '$lib/money'
import type { JournalEntry, JournalEntryInput, JournalLine, TrialBalanceRow } from './types'

/** Total debits and credits across an entry's lines. */
export function entryTotals(lines: JournalLine[]): { debit: Cents; credit: Cents } {
  return {
    debit: sumCents(lines.map((l) => l.debit)),
    credit: sumCents(lines.map((l) => l.credit)),
  }
}

/** An entry balances when its debits equal its credits. */
export function isBalanced(lines: JournalLine[]): boolean {
  const { debit, credit } = entryTotals(lines)
  return debit === credit
}

/** Validate an entry before posting. Returns human-readable problems; an empty
 *  array means valid. Rules: ISO date; at least two lines; every line has a
 *  non-negative debit XOR credit (not both, not neither); the entry isn't a
 *  no-op (some amount > 0); and debits === credits. */
export function validateEntry(input: JournalEntryInput): string[] {
  const problems: string[] = []
  const lines = input.lines ?? []
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    problems.push('date must be an ISO YYYY-MM-DD string')
  }
  if (lines.length < 2) problems.push('an entry needs at least two lines')
  lines.forEach((l, i) => {
    if (!l.account_id) problems.push(`line ${i + 1}: missing account_id`)
    if (l.debit < 0 || l.credit < 0) problems.push(`line ${i + 1}: amounts cannot be negative`)
    const hasDebit = l.debit > 0
    const hasCredit = l.credit > 0
    if (hasDebit && hasCredit) problems.push(`line ${i + 1}: a line has either a debit or a credit, not both`)
    if (!hasDebit && !hasCredit) problems.push(`line ${i + 1}: a line must have a debit or a credit`)
  })
  const { debit, credit } = entryTotals(lines)
  if (debit === 0 && credit === 0) problems.push('entry has no amounts')
  if (debit !== credit) problems.push(`entry does not balance: debits ${debit} ≠ credits ${credit}`)
  return problems
}

/** "YYYY-MM" accounting period for an ISO date. */
export function periodOf(dateISO: string): string {
  return dateISO.slice(0, 7)
}

/** Build the reversing entry for a posted entry: swap debit and credit on every
 *  line. Corrections are reversals, never edits. The reversal deliberately drops
 *  `source_ref` so it doesn't collide with the original's idempotency slot; the
 *  caller links the two via reverses/reversed_by. */
export function buildReversingEntry(
  original: JournalEntry,
  opts: { date?: string; memo?: string } = {},
): JournalEntryInput {
  return {
    date: opts.date ?? original.date,
    memo: opts.memo ?? `Reversal of ${original._id}`,
    source: original.source,
    created_by: original.created_by,
    lines: original.lines.map((l) => ({
      account_id: l.account_id,
      debit: l.credit,
      credit: l.debit,
      memo: l.memo,
    })),
  }
}

/** Compute a trial balance from a set of entries. Only `posted` entries count
 *  (void / reversed-out entries are netted by their reversal, which is itself a
 *  posted entry). Pure — the server passes whatever slice it queried. Returns one
 *  row per account touched, sorted by account_id, plus grand totals that must be
 *  equal. */
export function trialBalance(entries: JournalEntry[]): {
  rows: TrialBalanceRow[]
  totalDebit: Cents
  totalCredit: Cents
} {
  const byAccount = new Map<string, { debit: number; credit: number }>()
  for (const e of entries) {
    if (e.status !== 'posted') continue
    for (const l of e.lines) {
      const acc = byAccount.get(l.account_id) ?? { debit: 0, credit: 0 }
      acc.debit += l.debit
      acc.credit += l.credit
      byAccount.set(l.account_id, acc)
    }
  }
  const rows: TrialBalanceRow[] = [...byAccount.entries()]
    .map(([account_id, { debit, credit }]) => ({
      account_id,
      debit: cents(debit),
      credit: cents(credit),
      net: cents(debit - credit),
    }))
    .sort((a, b) => a.account_id.localeCompare(b.account_id))
  return {
    rows,
    totalDebit: cents(rows.reduce((a, r) => a + r.debit, 0)),
    totalCredit: cents(rows.reduce((a, r) => a + r.credit, 0)),
  }
}

// ── Account register + general ledger (V4) ───────────────────────────────────
// Pure folds over date-ordered posted entries; the server supplies the entries
// (lines.account_id index) and the opening balance (aggregation to the day
// before the window).

export type RegisterRow = {
  entry_id: string
  date: string
  memo?: string
  source: JournalEntry['source']
  source_ref?: string
  debit: Cents
  credit: Cents
  balance: Cents // running balance, presented in the account's normal direction
}

/** Fold the entries touching one account into register rows with a running
 *  balance. `opening` is the account's NET (debit − credit) balance before the
 *  first entry; rows present the balance in the account's `normal` direction
 *  (a healthy bank register and a healthy A/P register both read positive).
 *  An entry's multiple lines on the same account merge into one row. */
export function accountRegister(
  entries: JournalEntry[],
  accountId: string,
  opening: Cents,
  normal: 'debit' | 'credit' = 'debit',
): { rows: RegisterRow[]; closing: Cents } {
  const dir = normal === 'credit' ? -1 : 1
  let net: number = opening
  const rows: RegisterRow[] = []
  for (const e of entries) {
    let debit = 0
    let credit = 0
    for (const l of e.lines) {
      if (l.account_id !== accountId) continue
      debit += l.debit
      credit += l.credit
    }
    if (debit === 0 && credit === 0) continue
    net = net + debit - credit
    rows.push({
      entry_id: e._id,
      date: e.date,
      ...(e.memo !== undefined ? { memo: e.memo } : {}),
      source: e.source,
      ...(e.source_ref !== undefined ? { source_ref: e.source_ref } : {}),
      debit: cents(debit),
      credit: cents(credit),
      balance: cents(net * dir),
    })
  }
  return { rows, closing: cents(net * dir) }
}

export type GeneralLedgerGroup = {
  account_id: string
  name: string
  rows: { entry_id: string; date: string; memo?: string; source: JournalEntry['source']; debit: Cents; credit: Cents }[]
  totalDebit: Cents
  totalCredit: Cents
  net: Cents // debit − credit over the period
}

/** Group a period's entries per account, with per-account totals — the classic
 *  General Ledger report. Accounts with no activity are omitted; groups come
 *  back in account-code order. */
export function generalLedger(
  entries: JournalEntry[],
  accounts: { _id: string; name: string }[],
): GeneralLedgerGroup[] {
  const names = new Map(accounts.map((a) => [a._id, a.name]))
  const groups = new Map<string, GeneralLedgerGroup>()
  for (const e of entries) {
    for (const l of e.lines) {
      let g = groups.get(l.account_id)
      if (!g) {
        g = { account_id: l.account_id, name: names.get(l.account_id) ?? l.account_id, rows: [], totalDebit: cents(0), totalCredit: cents(0), net: cents(0) }
        groups.set(l.account_id, g)
      }
      g.rows.push({
        entry_id: e._id,
        date: e.date,
        ...(e.memo !== undefined ? { memo: e.memo } : {}),
        source: e.source,
        debit: l.debit,
        credit: l.credit,
      })
      g.totalDebit = cents(g.totalDebit + l.debit)
      g.totalCredit = cents(g.totalCredit + l.credit)
      g.net = cents(g.net + l.debit - l.credit)
    }
  }
  return [...groups.values()].sort((a, b) => (a.account_id < b.account_id ? -1 : 1))
}
