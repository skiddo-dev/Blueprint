// Runtime accounting operations: read the chart of accounts, post journal
// entries, reverse them, and compute the trial balance. The balancing rules and
// math live in the pure module ($lib/accounting/ledger); this layer persists.
import type { ClientSession } from 'mongodb'
import { env } from '$env/dynamic/private'
import { getDb, getMeta, setMeta } from './db'
import { writeAudit } from './audit'
import { DEFAULT_CHART_OF_ACCOUNTS } from '$lib/accounting/coa'
import { buildReversingEntry, periodOf, validateEntry } from '$lib/accounting/ledger'
import { isPeriodClosed, type Balance, type PeriodBalance } from '$lib/accounting/statements'
import { closingEntryLines } from '$lib/accounting/closing'
import type { Cents } from '$lib/money'
import type { Account, JournalEntry, JournalEntryInput, TrialBalanceRow } from '$lib/accounting/types'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

function isDupKey(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000
}

/** The chart of accounts, sorted by code. In mock mode returns the seed so the
 *  UI renders without Mongo. */
export async function getAccounts(): Promise<Account[]> {
  if (USE_MOCK) return DEFAULT_CHART_OF_ACCOUNTS
  const d = await getDb()
  const rows = await col('accounts', d).find({}).sort({ code: 1 }).toArray()
  return rows.map((a) => ({ ...a, _id: String(a._id) })) as Account[]
}

/** Most-recent journal entries (newest accounting date first), for the ledger
 *  listing. Empty in mock mode. */
export async function listJournalEntries(limit = 50): Promise<JournalEntry[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('journalEntries', d)
    .find({})
    .sort({ date: -1, created_at: -1 })
    .limit(limit)
    .toArray()
  return rows.map((e) => ({ ...e, _id: String(e._id) })) as JournalEntry[]
}

/** Post a journal entry. Validates it balances, fills the server fields, and
 *  inserts it as a single atomic document (the embedded lines mean a debit can
 *  never commit without its credit, even without a transaction). Idempotent on
 *  (source, source_ref): re-posting the same source doc's entry returns the
 *  existing one instead of duplicating, including under a concurrent race.
 *  Pass `session` to enlist the insert in a caller's transaction — e.g. an
 *  invoice and its entry committing together (requires the replica set). */
export async function postEntry(
  input: JournalEntryInput,
  opts: { session?: ClientSession } = {},
): Promise<JournalEntry> {
  const problems = validateEntry(input)
  if (problems.length) {
    throw new Error(`Refusing to post an invalid journal entry: ${problems.join('; ')}`)
  }
  const d = await getDb()
  const entries = col('journalEntries', d)

  // Idempotency fast-path FIRST: a source-generated entry posts at most once,
  // and RETURNING an already-posted entry is not "posting into a closed
  // period" — recurring catch-up and depreciation replays across a close must
  // resolve to the existing entry instead of throwing.
  if (input.source_ref) {
    const existing = await entries.findOne(
      { source: input.source, source_ref: input.source_ref },
      { session: opts.session },
    )
    if (existing) return { ...existing, _id: String(existing._id) } as JournalEntry
  }

  // Don't let anything post into a closed period (guards manual entries, invoices,
  // payments, bills — every path funnels through here).
  const closedThrough = await getCloseThrough()
  if (isPeriodClosed(input.date, closedThrough)) {
    throw new Error(`Accounting period is closed through ${closedThrough}; cannot post an entry dated ${input.date}`)
  }

  const entry: JournalEntry = {
    _id: crypto.randomUUID(),
    date: input.date,
    period: periodOf(input.date),
    ...(input.memo !== undefined ? { memo: input.memo } : {}),
    source: input.source,
    ...(input.source_ref ? { source_ref: input.source_ref } : {}),
    ...(input.job ? { job: input.job.trim() } : {}),
    lines: input.lines,
    status: 'posted',
    ...(input.created_by !== undefined ? { created_by: input.created_by } : {}),
    created_at: new Date().toISOString(),
  }

  try {
    await entries.insertOne(entry, { session: opts.session })
  } catch (e) {
    // Lost an idempotency race — the unique index rejected the duplicate. Return
    // the winner rather than surfacing a dup-key error to the caller.
    if (input.source_ref && isDupKey(e)) {
      const winner = await entries.findOne(
        { source: input.source, source_ref: input.source_ref },
        { session: opts.session },
      )
      if (winner) return { ...winner, _id: String(winner._id) } as JournalEntry
    }
    throw e
  }
  return entry
}

/** Reverse a posted entry (corrections are reversals, never edits). No-op-safe:
 *  if the entry has already been reversed, returns the existing reversal. */
export async function postReversal(
  entryId: string,
  opts: { date?: string; memo?: string; created_by?: string } = {},
): Promise<JournalEntry> {
  const d = await getDb()
  const entries = col('journalEntries', d)
  const original = await entries.findOne({ _id: entryId })
  if (!original) throw new Error(`No journal entry ${entryId}`)
  if (original.status !== 'posted') throw new Error(`Entry ${entryId} is ${original.status}, not posted`)
  if (original.reversed_by) {
    const existing = await entries.findOne({ _id: original.reversed_by })
    if (existing) return { ...existing, _id: String(existing._id) } as JournalEntry
  }

  const input = buildReversingEntry({ ...original, _id: String(original._id) } as JournalEntry, opts)
  const reversal: JournalEntry = {
    _id: crypto.randomUUID(),
    date: input.date,
    period: periodOf(input.date),
    ...(input.memo !== undefined ? { memo: input.memo } : {}),
    source: input.source,
    lines: input.lines,
    status: 'posted',
    reverses: entryId,
    ...((opts.created_by ?? input.created_by) !== undefined ? { created_by: opts.created_by ?? input.created_by } : {}),
    created_at: new Date().toISOString(),
  }
  await entries.insertOne(reversal)
  await entries.updateOne({ _id: entryId }, { $set: { reversed_by: reversal._id } })
  return reversal
}

/** Trial balance over posted entries, optionally as-of a date or for one period.
 *  Aggregates in Mongo (the 'lines.account_id' index serves the unwind/group) and
 *  joins account names for display. Mirrors the pure trialBalance() helper. */
export async function getTrialBalance(opts: { asOf?: string; period?: string } = {}): Promise<{
  rows: (TrialBalanceRow & { name?: string })[]
  totalDebit: number
  totalCredit: number
}> {
  if (USE_MOCK) return { rows: [], totalDebit: 0, totalCredit: 0 }
  const d = await getDb()
  const match: Record<string, unknown> = { status: 'posted' }
  if (opts.asOf) match.date = { $lte: opts.asOf }
  if (opts.period) match.period = opts.period

  const grouped = await col('journalEntries', d).aggregate([
    { $match: match },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.account_id', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
    { $sort: { _id: 1 } },
  ]).toArray()

  const nameByCode = new Map((await getAccounts()).map((a) => [a._id, a.name]))
  const rows = grouped.map((g) => ({
    account_id: String(g._id),
    name: nameByCode.get(String(g._id)),
    debit: g.debit as Cents,
    credit: g.credit as Cents,
    net: (g.debit - g.credit) as Cents,
  }))
  return {
    rows,
    totalDebit: rows.reduce((a, r) => a + r.debit, 0),
    totalCredit: rows.reduce((a, r) => a + r.credit, 0),
  }
}

/** Per-account debit/credit totals over posted entries, optionally date-bounded.
 *  Feeds the financial statements: a from..to range for the P&L period, or just
 *  `to` (cumulative as-of) for the balance sheet. */
export async function getLedgerBalances(
  opts: { from?: string; to?: string; excludeClosing?: boolean } = {},
): Promise<Balance[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const match: Record<string, unknown> = { status: 'posted' }
  // The income statement excludes closing entries so a closed period still shows
  // its real income; the balance sheet includes them so Retained Earnings reflects them.
  if (opts.excludeClosing) match.source = { $ne: 'closing' }
  if (opts.from || opts.to) {
    const range: Record<string, string> = {}
    if (opts.from) range.$gte = opts.from
    if (opts.to) range.$lte = opts.to
    match.date = range
  }
  const grouped = await col('journalEntries', d).aggregate([
    { $match: match },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.account_id', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
  ]).toArray()
  return grouped.map((g) => ({ account_id: String(g._id), debit: g.debit as Cents, credit: g.credit as Cents }))
}

/** Per-account totals bucketed by posting month (`period` on each entry), over
 *  ALL posted non-closing entries — the hub folds these into the monthly P&L
 *  trend and cash sparkline via monthlyActivity(). The books are young enough
 *  that returning every month is cheaper than two windowed queries. */
export async function getPeriodBalances(): Promise<PeriodBalance[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const grouped = await col('journalEntries', d).aggregate([
    { $match: { status: 'posted', source: { $ne: 'closing' } } },
    { $unwind: '$lines' },
    { $group: {
      _id: { period: '$period', account_id: '$lines.account_id' },
      debit: { $sum: '$lines.debit' },
      credit: { $sum: '$lines.credit' },
    } },
  ]).toArray()
  return grouped.map((g) => ({
    period: String((g._id as { period: string }).period),
    account_id: String((g._id as { account_id: string }).account_id),
    debit: g.debit as Cents,
    credit: g.credit as Cents,
  }))
}

/** Posted entries, optionally filtered to one account and/or a date range,
 *  oldest first — feeds the account register and the General Ledger / Journal
 *  reports. The books are small; a generous cap keeps a runaway query bounded. */
export async function listPostedEntries(
  opts: { account?: string; from?: string; to?: string } = {},
): Promise<JournalEntry[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const match: Record<string, unknown> = { status: 'posted' }
  if (opts.account) match['lines.account_id'] = opts.account
  if (opts.from || opts.to) {
    const range: Record<string, string> = {}
    if (opts.from) range.$gte = opts.from
    if (opts.to) range.$lte = opts.to
    match.date = range
  }
  const rows = await col('journalEntries', d)
    .find(match)
    .sort({ date: 1, created_at: 1 })
    .limit(5000)
    .toArray()
  return rows.map((e) => ({ ...e, _id: String(e._id) })) as JournalEntry[]
}

// ── Period close ──────────────────────────────────────────────────────────────
/** The date the books are locked through (no entry may post on/before it), or
 *  null if open. Stored as a single `meta` doc. */
export async function getCloseThrough(): Promise<string | null> {
  if (USE_MOCK) return null
  const m = await getMeta('accounting_lock')
  return (m?.closed_through as string) ?? null
}

/** Set (or, with null, clear) the close-through date. */
export async function setCloseThrough(date: string | null): Promise<void> {
  await setMeta('accounting_lock', { closed_through: date })
}

/** Year-end close: post a closing entry that zeroes income & expense into
 *  Retained Earnings as of `through`, then lock the period there. Posting happens
 *  before the lock is set, so the closing entry (dated `through`) is allowed; if
 *  there's nothing to close it just locks. Re-closing the same date is a no-op
 *  (balances already zeroed → no lines). */
export async function closeBooks(
  through: string,
  created_by?: string,
): Promise<{ posted: boolean; entry?: JournalEntry; closedThrough: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(through)) throw new Error('through must be ISO YYYY-MM-DD')
  const [accounts, balances] = await Promise.all([getAccounts(), getLedgerBalances({ to: through })])
  const lines = closingEntryLines(balances, accounts)
  let entry: JournalEntry | undefined
  if (lines.length) {
    entry = await postEntry({
      date: through,
      memo: `Year-end close through ${through}`,
      source: 'closing',
      lines,
      created_by,
    })
  }
  await setCloseThrough(through)
  await writeAudit({
    actor: created_by ?? 'system',
    action: 'close.books',
    entity_type: 'close',
    entity_id: through,
    summary: `Closed the books through ${through}${entry ? '' : ' (nothing to close — re-locked)'}`,
    ...(entry ? { meta: { closing_entry_id: entry._id } } : {}),
  })
  return { posted: lines.length > 0, entry, closedThrough: through }
}
