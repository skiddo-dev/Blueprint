// Accounting collection setup: indexes + the chart-of-accounts seed. Kept
// separate from accounting.ts (the runtime operations) so db.ts can import the
// index/seed wiring WITHOUT a circular import — db.ts → accounting-schema is the
// only edge; accounting.ts → db.ts is the other. Neither file imports both.
import type { Db } from 'mongodb'
import { DEFAULT_CHART_OF_ACCOUNTS } from '$lib/accounting/coa'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(d: Db, name: string) { return d.collection<any>(name) }

/** Performance indexes for the accounting hot paths. Idempotent (createIndex is a
 *  no-op when an equivalent index exists), so it's safe on every cold connect.
 *  Best-effort — a failure here only slows queries, never corrupts data — so db.ts
 *  calls this inside its non-fatal perf-index batch. The uniqueness/idempotency
 *  guards live in {@link ensureAccountingConstraints} instead. */
export async function ensureAccountingIndexes(d: Db): Promise<void> {
  await Promise.all([
    col(d, 'accounts').createIndex({ type: 1, code: 1 }),
    col(d, 'journalEntries').createIndex({ date: -1 }),         // ledger listing
    col(d, 'journalEntries').createIndex({ period: 1 }),        // period reports / close
    col(d, 'journalEntries').createIndex({ 'lines.account_id': 1 }), // trial balance + per-account ledger
    col(d, 'creditMemos').createIndex({ invoice_id: 1 }),   // credits listed on the invoice detail
    col(d, 'vendorCredits').createIndex({ bill_id: 1 }),    // mirrors for A/P
    // ── Accounts receivable (Phase 2) ──
    col(d, 'customers').createIndex({ name_lower: 1 }),        // find-or-create by name
    col(d, 'invoices').createIndex({ status: 1, due_date: 1 }), // A/R aging scan
    col(d, 'invoices').createIndex({ customer_id: 1 }),
    col(d, 'invoices').createIndex({ quote_id: 1 }),           // won-quote → invoice link
    col(d, 'payments').createIndex({ invoice_id: 1 }),         // payments for an invoice
    // ── Accounts payable (Phase 3) ──
    col(d, 'vendors').createIndex({ name_lower: 1 }),          // find-or-create by name
    col(d, 'bills').createIndex({ status: 1, due_date: 1 }),   // A/P aging scan
    col(d, 'bills').createIndex({ vendor_id: 1 }),
    col(d, 'billPayments').createIndex({ bill_id: 1 }),        // payments for a bill
    col(d, 'reconciliations').createIndex({ account_id: 1, statement_date: -1 }), // bank rec history

    col(d, 'auditLog').createIndex({ entity_type: 1, entity_id: 1, at: -1 }), // per-document activity feed
    col(d, 'auditLog').createIndex({ at: -1 }),                               // the audit page's newest-first scan
  ])
}

/** Integrity-critical uniqueness/idempotency indexes — correctness, not speed.
 *  Without them a race could post a journal entry twice or mint a duplicate
 *  invoice/bill number, so db.ts treats a failure here as FATAL (the app reads
 *  not-ready rather than serve without the safeguard). Idempotent, same as above.
 *  A duplicate-key error here means existing data already violates the constraint
 *  — that's the signal to fix the data, not to drop the guard. */
export async function ensureAccountingConstraints(d: Db): Promise<void> {
  await Promise.all([
    // Idempotency: a given source doc (invoice/payment/…) posts its entry at most
    // once. Partial so manual entries and reversals — which carry no source_ref —
    // are exempt from the uniqueness constraint.
    col(d, 'journalEntries').createIndex(
      { source: 1, source_ref: 1 },
      { unique: true, partialFilterExpression: { source_ref: { $exists: true } } },
    ),
    col(d, 'invoices').createIndex({ year: 1, number: 1 }, { unique: true }), // sequential per year
    col(d, 'bills').createIndex({ year: 1, number: 1 }, { unique: true }),    // sequential per year
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
