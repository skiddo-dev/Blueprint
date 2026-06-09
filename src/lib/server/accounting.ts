// Runtime accounting operations: read the chart of accounts, post journal
// entries, reverse them, and compute the trial balance. The balancing rules and
// math live in the pure module ($lib/accounting/ledger); this layer persists.
import type { ClientSession } from 'mongodb'
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { DEFAULT_CHART_OF_ACCOUNTS } from '$lib/accounting/coa'
import { buildReversingEntry, periodOf, validateEntry } from '$lib/accounting/ledger'
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

  // Idempotency fast-path: a source-generated entry posts at most once.
  if (input.source_ref) {
    const existing = await entries.findOne(
      { source: input.source, source_ref: input.source_ref },
      { session: opts.session },
    )
    if (existing) return { ...existing, _id: String(existing._id) } as JournalEntry
  }

  const entry: JournalEntry = {
    _id: crypto.randomUUID(),
    date: input.date,
    period: periodOf(input.date),
    ...(input.memo !== undefined ? { memo: input.memo } : {}),
    source: input.source,
    ...(input.source_ref ? { source_ref: input.source_ref } : {}),
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
