// Pure side of AI bank-line categorization — no database, no LLM. The model
// only ever SUGGESTS an account for an unmatched statement line; everything
// here is the deterministic frame around it: which accounts a suggestion may
// use, how the payee→account history is built from past documents, and how a
// model response is sanitized before the UI sees it. Posting stays with the
// existing expense/journal endpoints — the human confirms every line.
import type { Account, Bill, JournalEntry } from './types'

/** One statement line up for categorization. `amount` is signed cents the way
 *  statement-import parses them: positive = deposit, negative = withdrawal. */
export interface CategoryLine {
  date: string
  description: string
  amount: number
}

export interface LineSuggestion {
  index: number
  account_id: string | null // null = the model (or the sanitizer) declined to guess
  confidence: number        // 0–1
  reason: string
}

export interface PayeeHistoryRow {
  payee: string      // lowercased payee/vendor name
  account_id: string
  count: number
}

/** Accounts a suggestion may target, by money direction: withdrawals land on
 *  expense/COGS accounts, deposits on income accounts. Anything fancier (a
 *  loan draw, an owner contribution) is exactly the case the human should
 *  route by hand via the journal form. */
export function categoryAccounts(accounts: Account[]): { expense: Account[]; income: Account[] } {
  const active = accounts.filter((a) => a.active)
  return {
    expense: active.filter((a) => a.type === 'expense'),
    income: active.filter((a) => a.type === 'income'),
  }
}

const directionOk = (line: CategoryLine, account: Account): boolean =>
  line.amount < 0 ? account.type === 'expense' : account.type === 'income'

/** Clamp a raw model response onto the lines it was asked about: unknown or
 *  inactive accounts become null, an expense suggestion on a deposit (or vice
 *  versa) becomes null, confidence clamps to 0–1, one suggestion per line. */
export function sanitizeSuggestions(
  raw: unknown,
  lines: CategoryLine[],
  accounts: Account[],
): LineSuggestion[] {
  const byId = new Map(accounts.map((a) => [a._id, a]))
  const seen = new Set<number>()
  const out: LineSuggestion[] = []
  const items = Array.isArray(raw) ? raw : []
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    const index = typeof r.index === 'number' && Number.isInteger(r.index) ? r.index : -1
    if (index < 0 || index >= lines.length || seen.has(index)) continue
    seen.add(index)
    let account_id: string | null = typeof r.account_id === 'string' ? r.account_id : null
    if (account_id) {
      const account = byId.get(account_id)
      if (!account || !account.active || !directionOk(lines[index], account)) account_id = null
    }
    const confidence =
      typeof r.confidence === 'number' && Number.isFinite(r.confidence)
        ? Math.min(1, Math.max(0, r.confidence))
        : 0
    out.push({
      index,
      account_id,
      confidence: account_id ? confidence : 0,
      reason: String(r.reason ?? '').slice(0, 120),
    })
  }
  return out.sort((a, b) => a.index - b.index)
}

/** Fold past documents into payee→account counts, the strongest signal the
 *  model gets. Bills carry an explicit vendor; quick expenses encode the payee
 *  as the memo's leading segment (`payee — memo`, the format the expense
 *  endpoint writes). Most-used mappings first, capped to keep the prompt small. */
export function buildPayeeHistory(
  bills: Pick<Bill, 'vendor_name' | 'lines' | 'status'>[],
  expenseEntries: Pick<JournalEntry, 'memo' | 'lines' | 'source' | 'status'>[],
  cap = 150,
): PayeeHistoryRow[] {
  const counts = new Map<string, number>() // "payee|account_id" → count
  const bump = (payee: string, account_id: string) => {
    const p = payee.trim().toLowerCase()
    if (!p || !account_id) return
    const key = `${p}|${account_id}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const b of bills) {
    if (b.status === 'void') continue
    for (const l of b.lines) bump(b.vendor_name, l.account_id)
  }
  for (const e of expenseEntries) {
    if (e.status !== 'posted' || e.source !== 'expense') continue
    const payee = (e.memo ?? '').split('—')[0]
    const debit = e.lines.find((l) => l.debit > 0)
    if (debit) bump(payee, debit.account_id)
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const sep = key.lastIndexOf('|')
      return { payee: key.slice(0, sep), account_id: key.slice(sep + 1), count }
    })
    .sort((a, b) => b.count - a.count || a.payee.localeCompare(b.payee))
    .slice(0, cap)
}
