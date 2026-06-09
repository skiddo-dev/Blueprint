// Accounting collection setup: indexes + the chart-of-accounts seed. Kept
// separate from accounting.ts (the runtime operations) so db.ts can import the
// index/seed wiring WITHOUT a circular import — db.ts → accounting-schema is the
// only edge; accounting.ts → db.ts is the other. Neither file imports both.
import type { Db } from 'mongodb'
import { DEFAULT_CHART_OF_ACCOUNTS } from '$lib/accounting/coa'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(d: Db, name: string) { return d.collection<any>(name) }

/** Indexes the accounting hot paths depend on. Idempotent (createIndex is a
 *  no-op when an equivalent index exists), so it's safe on every cold connect —
 *  called from db.ts's ensureIndexes alongside the core collections. */
export async function ensureAccountingIndexes(d: Db): Promise<void> {
  await Promise.all([
    col(d, 'accounts').createIndex({ type: 1, code: 1 }),
    col(d, 'journalEntries').createIndex({ date: -1 }),         // ledger listing
    col(d, 'journalEntries').createIndex({ period: 1 }),        // period reports / close
    col(d, 'journalEntries').createIndex({ 'lines.account_id': 1 }), // trial balance + per-account ledger
    // Idempotency: a given source doc (invoice/payment/…) posts its entry at most
    // once. Partial so manual entries and reversals — which carry no source_ref —
    // are exempt from the uniqueness constraint.
    col(d, 'journalEntries').createIndex(
      { source: 1, source_ref: 1 },
      { unique: true, partialFilterExpression: { source_ref: { $exists: true } } },
    ),
  ])
}

/** Migration 0004: seed the default chart of accounts. Idempotent — only inserts
 *  accounts whose code isn't already present, so re-running (or running after a
 *  user has added accounts) never duplicates or clobbers. */
export async function seedChartOfAccounts(d: Db): Promise<void> {
  const existing = new Set(
    (await col(d, 'accounts').find({}, { projection: { _id: 1 } }).toArray()).map((a) => String(a._id)),
  )
  const missing = DEFAULT_CHART_OF_ACCOUNTS.filter((a) => !existing.has(a._id))
  if (!missing.length) return
  await col(d, 'accounts').insertMany(missing, { ordered: false })
}
