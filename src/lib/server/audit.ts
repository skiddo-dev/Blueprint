// Append-only audit log for the accounting module: who did what, to which
// document, when. Mutations call writeAudit inside their withTxn so the event
// commits (or aborts) with the books themselves; on the degraded standalone
// path (no session) a failed audit insert must never torpedo a mutation that
// already persisted, so it downgrades to a logged warning.
//
// The ledger itself is already immutable (corrections are reversals), so this
// log adds the WHO and WHY layer on top: invoice/bill lifecycle, payments,
// credits, voids, closes, reconciliations, recurring runs.
import type { ClientSession } from 'mongodb'
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { log } from './log'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

export interface AuditEvent {
  _id: string
  at: string            // ISO timestamp
  actor: string         // user email/name, or 'system' / 'recurring:<template>'
  action: string        // 'invoice.create' | 'payment.record' | 'bill.void' | …
  entity_type: string   // 'invoice' | 'bill' | 'customer' | 'vendor' | 'journal-entry' | 'reconciliation' | 'recurring-template' | 'close' | …
  entity_id: string
  summary: string       // one human-readable line for the activity feed
  meta?: Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coll(d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>('auditLog') }

/** Record one audit event. Pass the mutation's `session` so the event commits
 *  inside the same transaction (a failed insert then aborts the whole txn —
 *  that's the point of an audit trail). Without a session, failures are logged
 *  and swallowed so the already-persisted mutation isn't misreported as failed. */
export async function writeAudit(
  e: Omit<AuditEvent, '_id' | 'at'>,
  opts: { session?: ClientSession } = {},
): Promise<void> {
  if (USE_MOCK) return
  const event: AuditEvent = {
    _id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...e,
    actor: e.actor || 'system',
  }
  const d = await getDb()
  if (opts.session) {
    await coll(d).insertOne(event, { session: opts.session })
    return
  }
  try {
    await coll(d).insertOne(event)
  } catch (err) {
    log.warn('audit write failed', { action: e.action, entity: `${e.entity_type}/${e.entity_id}`, error: err instanceof Error ? err.message : String(err) })
  }
}

export interface AuditFilter {
  entity_type?: string
  entity_id?: string
  actor?: string
  action?: string
  from?: string // ISO date, inclusive
  to?: string   // ISO date, inclusive
  limit?: number
}

/** Newest-first audit events, optionally filtered. `from`/`to` are calendar
 *  dates compared against the timestamp's date part. */
export async function listAudit(f: AuditFilter = {}): Promise<AuditEvent[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const match: Record<string, unknown> = {}
  if (f.entity_type) match.entity_type = f.entity_type
  if (f.entity_id) match.entity_id = f.entity_id
  if (f.actor) match.actor = f.actor
  if (f.action) match.action = f.action
  if (f.from || f.to) {
    match.at = {
      ...(f.from ? { $gte: `${f.from}T00:00:00.000Z` } : {}),
      ...(f.to ? { $lte: `${f.to}T23:59:59.999Z` } : {}),
    }
  }
  const rows = await coll(d).find(match).sort({ at: -1 }).limit(f.limit ?? 200).toArray()
  return rows.map((r) => ({ ...r, _id: String(r._id) })) as AuditEvent[]
}

/** Distinct actors seen in the log — feeds the audit page's filter dropdown. */
export async function listAuditActors(): Promise<string[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const actors = await coll(d).distinct('actor')
  return (actors as string[]).sort()
}
