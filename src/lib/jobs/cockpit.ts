// Pure Job-Cockpit rollup — no database, no Svelte. Joins the three things
// Blueprint already tracks about a job into one per-store view:
//
//   • quotes  → contract (won), pipeline (open), lost  — money the job is worth
//   • cards   → field status, attachments, last activity — how the work is going
//   • books   → billed (invoices), cost (bills+expenses), margin — the real P&L
//
// Raves has no first-class "job" record; the store number is the natural key.
// Quotes and cards carry it directly (`store_number` / `store_numbers[]`); books
// docs carry a free-text `job` tag, so we match a books doc to a store when the
// tag equals the store or contains it as a whole digit-token ("Store 412",
// "412 — Kroger remodel"). Books docs that match no known store but look
// store-like get their own row; the rest pool under "Unassigned" so no money
// silently disappears. Money is integer cents throughout — quote dollars are
// converted on the way in (see $lib/money).
import { type Cents, cents, fromDollars } from '$lib/money'

export const UNASSIGNED = 'Unassigned'

// Margin bands for the headline health pill. Tuned for remodel/GC work where
// sub-15% net is thin and negative is a job that's losing money.
export const THIN_MARGIN = 0.15

export type JobHealth =
  | 'profit'   // billed, margin ≥ THIN_MARGIN
  | 'thin'     // billed, 0 ≤ margin < THIN_MARGIN
  | 'loss'     // billed, costs exceed revenue
  | 'unbilled' // quotes/cards but nothing invoiced yet

export type JobCockpitRow = {
  store: string
  // Contract & pipeline (from quotes).
  contract: Cents     // sum of won quotes — what the job is worth
  pipeline: Cents     // sum of open quotes — still in play
  lost: Cents         // sum of lost quotes
  quoteCount: number
  // Books actuals (from invoices/bills/expenses tagged to the store).
  billed: Cents       // non-void invoice totals
  cost: Cents         // non-void bill totals + job-tagged expenses
  profit: Cents       // billed − cost
  margin: number | null            // profit / billed; null when nothing billed
  billedPctOfContract: number | null // billed / contract; null when no contract
  // Operations (from cards).
  cards: number
  openCards: number   // not Done / Cancelled
  doneCards: number
  byStatus: Record<string, number>
  attachments: number
  lastActivity: string | null // ISO of the most recent card touch
  health: JobHealth
}

export type Portfolio = {
  jobs: number        // distinct real stores (excludes Unassigned)
  contract: Cents
  pipeline: Cents
  billed: Cents
  cost: Cents
  profit: Cents
  margin: number | null
  openCards: number
}

// ── Narrow structural inputs (no server/$lib coupling) ───────────────────────
export type CockpitQuoteInput = { store_number?: string | null; amount: number; status?: string | null }
export type CockpitTaskInput = {
  store_numbers?: string[] | null
  status: string
  attachment_ids?: string[] | null
  attachments?: { id: string }[] | null
  created_at: string
  updated_at?: string | null
}
export type CockpitBooksInput = {
  invoices: { job?: string; total: number; status: string }[]
  bills: { job?: string; total: number; status: string }[]
  expenses: { job?: string; amount: number }[]
}

const DONE_STATES = new Set(['Done', 'Cancelled'])

/** A store key, or UNASSIGNED for blank/"N/A". */
function storeKey(s: string | null | undefined): string {
  const t = (s ?? '').trim()
  if (!t || t.toUpperCase() === 'N/A') return UNASSIGNED
  return t
}

/** Whole digit-runs in a string: "412 — Kroger" → ["412"]. Avoids "412"
 *  spuriously matching "4127". */
function digitTokens(s: string | undefined | null): string[] {
  return (s ?? '').match(/\d+/g) ?? []
}

/** Does a books `job` tag belong to this store? Exact trimmed match, or the
 *  store appears as a whole digit-token in the tag. */
export function jobMatchesStore(job: string | undefined | null, store: string): boolean {
  if (!job) return false
  const j = job.trim()
  if (j === store) return true
  if (/^\d+$/.test(store)) return digitTokens(j).includes(store)
  return false
}

type Bucket = {
  contract: number; pipeline: number; lost: number; quoteCount: number
  billed: number; cost: number
  cards: number; openCards: number; doneCards: number
  byStatus: Record<string, number>
  attachments: number
  lastActivity: string | null
}

function emptyBucket(): Bucket {
  return {
    contract: 0, pipeline: 0, lost: 0, quoteCount: 0,
    billed: 0, cost: 0,
    cards: 0, openCards: 0, doneCards: 0, byStatus: {},
    attachments: 0, lastActivity: null,
  }
}

function classifyHealth(billed: number, margin: number | null): JobHealth {
  if (billed <= 0) return 'unbilled'
  if (margin === null) return 'unbilled'
  if (margin < 0) return 'loss'
  if (margin < THIN_MARGIN) return 'thin'
  return 'profit'
}

export function buildJobCockpit(input: {
  quotes: CockpitQuoteInput[]
  tasks: CockpitTaskInput[]
  books: CockpitBooksInput
}): { rows: JobCockpitRow[]; portfolio: Portfolio } {
  const buckets = new Map<string, Bucket>()
  const get = (key: string) => {
    let b = buckets.get(key)
    if (!b) { b = emptyBucket(); buckets.set(key, b) }
    return b
  }

  // 1) Quotes → contract / pipeline / lost (dollars → cents).
  for (const q of input.quotes) {
    const b = get(storeKey(q.store_number))
    const c = fromDollars(q.amount)
    b.quoteCount += 1
    if (q.status === 'won') b.contract += c
    else if (q.status === 'lost') b.lost += c
    else b.pipeline += c // open / unknown counts as still-in-play
  }

  // 2) Cards → field status, attachments, last activity.
  for (const t of input.tasks) {
    const stores = (t.store_numbers ?? []).filter((s) => storeKey(s) !== UNASSIGNED)
    const keys = stores.length ? [...new Set(stores.map(storeKey))] : [UNASSIGNED]
    const touchedAt = t.updated_at || t.created_at || null
    const attachCount = t.attachments?.length ?? t.attachment_ids?.length ?? 0
    for (const key of keys) {
      const b = get(key)
      b.cards += 1
      if (DONE_STATES.has(t.status)) b.doneCards += 1
      else b.openCards += 1
      b.byStatus[t.status] = (b.byStatus[t.status] ?? 0) + 1
      b.attachments += attachCount
      if (touchedAt && (!b.lastActivity || touchedAt > b.lastActivity)) b.lastActivity = touchedAt
    }
  }

  // Stores we already know about from quotes/cards — the match universe for books.
  const knownStores = [...buckets.keys()].filter((k) => k !== UNASSIGNED).sort()
  const resolveBooksKey = (job: string | undefined): string => {
    const match = knownStores.find((s) => jobMatchesStore(job, s))
    if (match) return match
    // No known store — keep a store-like tag as its own row, else pool it.
    const tag = (job ?? '').trim()
    if (!tag) return UNASSIGNED
    const tokens = digitTokens(tag)
    return tokens.length === 1 ? tokens[0] : UNASSIGNED
  }

  // 3) Books → billed (invoices) and cost (bills + job-tagged expenses).
  for (const inv of input.books.invoices) {
    if (inv.status === 'void') continue
    get(resolveBooksKey(inv.job)).billed += inv.total
  }
  for (const bill of input.books.bills) {
    if (bill.status === 'void') continue
    get(resolveBooksKey(bill.job)).cost += bill.total
  }
  for (const exp of input.books.expenses) {
    get(resolveBooksKey(exp.job)).cost += exp.amount
  }

  const rows: JobCockpitRow[] = [...buckets.entries()].map(([store, b]) => {
    const profit = b.billed - b.cost
    const margin = b.billed > 0 ? profit / b.billed : null
    return {
      store,
      contract: cents(b.contract),
      pipeline: cents(b.pipeline),
      lost: cents(b.lost),
      quoteCount: b.quoteCount,
      billed: cents(b.billed),
      cost: cents(b.cost),
      profit: cents(profit),
      margin,
      billedPctOfContract: b.contract > 0 ? b.billed / b.contract : null,
      cards: b.cards,
      openCards: b.openCards,
      doneCards: b.doneCards,
      byStatus: b.byStatus,
      attachments: b.attachments,
      lastActivity: b.lastActivity,
      health: classifyHealth(b.billed, margin),
    }
  })

  // Biggest jobs first (contract + billed); Unassigned always sinks to the bottom.
  rows.sort((a, b) => {
    if (a.store === UNASSIGNED) return 1
    if (b.store === UNASSIGNED) return -1
    return (b.contract + b.billed) - (a.contract + a.billed)
  })

  const sum = (pick: (r: JobCockpitRow) => number) => rows.reduce((s, r) => s + pick(r), 0)
  const billed = sum((r) => r.billed)
  const cost = sum((r) => r.cost)
  return {
    rows,
    portfolio: {
      jobs: rows.filter((r) => r.store !== UNASSIGNED).length,
      contract: cents(sum((r) => r.contract)),
      pipeline: cents(sum((r) => r.pipeline)),
      billed: cents(billed),
      cost: cents(cost),
      profit: cents(billed - cost),
      margin: billed > 0 ? (billed - cost) / billed : null,
      openCards: sum((r) => r.openCards),
    },
  }
}
