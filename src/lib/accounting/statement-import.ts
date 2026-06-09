// Pure bank-statement import: parse a pasted CSV into signed transaction lines,
// and auto-match them by amount to the uncleared ledger transactions on a bank
// account. A convenience layer on the manual reconciliation — the matched ledger
// entries get pre-ticked; the rest is the usual check-off + Finish.
import { type Cents, parseMoney, cents } from '$lib/money'
import { parseCsvRecords } from '$lib/csv'

export interface StatementLine { date: string; description: string; amount: Cents } // + deposit, − withdrawal

// Find a column value by trying header-name synonyms (case-insensitive).
function pick(rec: Record<string, string>, names: string[]): string | undefined {
  const byLower: Record<string, string> = {}
  for (const k of Object.keys(rec)) byLower[k.toLowerCase().trim()] = k
  for (const want of names) {
    const key = byLower[want]
    if (key !== undefined && rec[key] !== undefined) return rec[key]
  }
  return undefined
}

/** Normalize a date cell to ISO YYYY-MM-DD (accepts ISO or M/D/YYYY). */
export function toIsoDate(s: string): string {
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yy}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return t
}

/** Parse a bank-export CSV. Supports a single signed `amount` column, or separate
 *  debit/withdrawal + credit/deposit columns (amount = credit − debit). Rows that
 *  don't parse are skipped. */
export function parseStatementCsv(text: string): StatementLine[] {
  const lines: StatementLine[] = []
  for (const rec of parseCsvRecords(text)) {
    try {
      const dateStr = pick(rec, ['date', 'transaction date', 'posted date', 'post date'])
      if (!dateStr || !dateStr.trim()) continue
      const desc = (pick(rec, ['description', 'memo', 'name', 'payee', 'details']) ?? '').trim()
      const amountStr = pick(rec, ['amount', 'transaction amount'])
      let amount: number
      if (amountStr !== undefined && amountStr.trim() !== '') {
        amount = parseMoney(amountStr)
      } else {
        const credit = pick(rec, ['credit', 'deposit', 'deposits', 'credits'])
        const debit = pick(rec, ['debit', 'withdrawal', 'withdrawals', 'debits'])
        const c = credit && credit.trim() ? parseMoney(credit) : 0
        const dbt = debit && debit.trim() ? parseMoney(debit) : 0
        amount = c - dbt
      }
      lines.push({ date: toIsoDate(dateStr), description: desc, amount: cents(amount) })
    } catch {
      // skip an unparseable row
    }
  }
  return lines
}

export interface MatchResult {
  matchedTxnIds: string[]            // uncleared ledger txns matched to a statement line
  unmatchedStatement: StatementLine[] // statement lines with no matching ledger txn
  matchedCount: number
}

/** Greedily match each statement line to an uncleared ledger transaction with the
 *  same signed amount (each ledger txn is used at most once). */
export function autoMatch(lines: StatementLine[], txns: { entry_id: string; amount: Cents }[]): MatchResult {
  const byAmount = new Map<number, string[]>()
  for (const t of txns) {
    const pool = byAmount.get(t.amount) ?? []
    pool.push(t.entry_id)
    byAmount.set(t.amount, pool)
  }
  const matchedTxnIds: string[] = []
  const unmatchedStatement: StatementLine[] = []
  for (const line of lines) {
    const pool = byAmount.get(line.amount)
    if (pool && pool.length) matchedTxnIds.push(pool.shift() as string)
    else unmatchedStatement.push(line)
  }
  return { matchedTxnIds, unmatchedStatement, matchedCount: matchedTxnIds.length }
}
