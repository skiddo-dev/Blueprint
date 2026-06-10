import { MongoClient, type Db } from 'mongodb'
import { env } from '$env/dynamic/private'
import type { Task, User, Quote, Prospect, TimelineEntry, Attachment, ChecklistItem } from '$lib/types'
import { generateMockTasks, generateMockProspects, generateMockQuotes } from './mock'
import { PROSPECT_CENTER, PROSPECT_DEFAULTS, ARCHIVE_AFTER_DAYS } from '$lib/constants'
import { requireInProd } from './config'
import { ensureAccountingIndexes, ensureAccountingConstraints, seedChartOfAccounts } from './accounting-schema'
import { tombstoneKeysForTask } from './syncLogic'
import { rankBetween, spreadRanks } from '$lib/rank'
import { log } from './log'

let client: MongoClient | null = null
let db: Db | null = null
let connecting: Promise<Db> | null = null
let indexesEnsured = false
let migrationsRun = false

// Dev escape hatch: serve generated tasks instead of hitting Mongo. Lets the
// dashboard/board render with realistic data when no Atlas/seed is available.
const USE_MOCK = env.USE_MOCK_DATA === 'true'

export async function getDb(): Promise<Db> {
  if (db) return db
  // Memoize the in-flight connection so concurrent cold-start callers share a
  // single connect() instead of each constructing its own MongoClient — every
  // extra client opens its own pool and is then leaked, unreferenced. On
  // failure, clear the memo so the next call retries rather than awaiting a
  // permanently-rejected promise.
  if (!connecting) {
    connecting = (async () => {
      // Read via $env/dynamic/private, NOT process.env: under Vite 8 SSR process.env
      // is unpopulated from .env, so MONGODB_URI fell back to localhost and the app
      // silently used a local mongo instead of Atlas. Same root cause as src/lib/auth.ts.
      // localhost is a DEV-only convenience; in production a missing URI throws.
      const uri = requireInProd('MONGODB_URI', env.MONGODB_URI ?? env.MONGO_URI) ?? 'mongodb://localhost:27017/'
      const dbName = env.MONGODB_DB_NAME ?? env.MONGO_DB_NAME ?? 'blueprint'
      const c = new MongoClient(uri)
      await c.connect()
      const database = c.db(dbName)
      // Build indexes BEFORE publishing the connection: if an integrity-critical
      // (unique/idempotency) index can't be created, ensureIndexes throws here, so
      // `client`/`db` are never assigned — getDb stays un-memoized and retries on
      // the next call, while /readyz pings fail meanwhile so this replica isn't
      // handed traffic without the safeguards. Close the pool so a failed cold
      // connect doesn't leak it.
      try {
        await ensureIndexes(database)
      } catch (e) {
        await c.close().catch(() => {})
        throw e
      }
      // Publish BEFORE runMigrations — this ordering is load-bearing, not
      // cosmetic. runMigrations → tryAcquireLease/releaseLease re-enter getDb();
      // with `db` still unset they'd be handed this very `connecting` promise and
      // deadlock the whole DB layer (every request, /readyz included, hangs —
      // exactly what wedged the 2026-06-09 deploy's revision in Activating).
      // Migrations stay best-effort behind the publish: /readyz gates on
      // migrationsApplied() separately, so readiness is still correct.
      client = c
      db = database
      await runMigrations(database)
      return database
    })().catch((e) => {
      connecting = null
      throw e
    })
  }
  return connecting
}

/** The connected MongoClient — needed to start a session for a multi-document
 *  transaction (e.g. posting an invoice and its journal entry atomically).
 *  Ensures the connection first; only meaningful against a replica set (Atlas in
 *  prod; a local single-node replica set in dev — see README). */
export async function getClient(): Promise<MongoClient> {
  await getDb()
  if (!client) throw new Error('Mongo client not initialized')
  return client
}

// Our tasks use string UUIDs as _id (not MongoDB ObjectIds).
// We use `any` on the collection to avoid the strict ObjectId constraint in the driver's types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(d: Db, name: string) { return d.collection<any>(name) }

/** Lightweight connectivity check for the readiness probe (/readyz): connect and
 *  issue a `ping`. Returns false instead of throwing so the caller maps it to 503. */
export async function pingDb(): Promise<boolean> {
  try {
    const d = await getDb()
    await d.command({ ping: 1 })
    return true
  } catch {
    return false
  }
}

// Create the indexes the app's hot queries depend on. Idempotent — createIndex is
// a no-op when an equivalent index already exists — so it's safe to run on every
// cold connect, and it keeps the index set version-controlled (SSOT) instead of
// hand-applied per environment.
//
// Two tiers, with different failure handling:
//  • Performance indexes — best-effort. A failure only slows queries, so it's
//    logged (which now also alerts) and swallowed; a transient index issue can't
//    take the DB layer down.
//  • Integrity constraints (unique/idempotency) — FATAL. Serving without them
//    risks duplicate quote/invoice/bill numbers or a double-posted journal entry,
//    so a failure throws and the caller (getDb) leaves the connection unpublished
//    → /readyz reports not-ready until the next cold connect succeeds.
//
// The My Work query (getTasksForUser) is served by the created_by_email /
// assignee_email indexes; its legacy case-insensitive name regex is only a
// transition fallback for un-backfilled tasks (can't use a btree, but rare).
async function ensureIndexes(d: Db): Promise<void> {
  if (indexesEnsured) return
  // ── Performance tier (best-effort) ──
  try {
    await Promise.all([
      col(d, 'tasks').createIndex({ updated_at: -1 }),             // getTasksSignature — polled ~every 2s by every open client
      col(d, 'tasks').createIndex({ created_at: -1 }),             // getTasks / getTasksForUser sort
      col(d, 'tasks').createIndex({ status: 1, rank: 1 }),         // per-column order + insertTask's top-of-column rank lookup
      col(d, 'tasks').createIndex({ created_by_email: 1 }),        // getTasksForUser (My Work) — identity match
      col(d, 'tasks').createIndex({ assignee_email: 1 }),          // getTasksForUser (My Work) — identity match
      col(d, 'tasks').createIndex({ co_assignee_emails: 1 }),      // getTasksForUser (My Work) — co-assignee identity match (multikey)
      col(d, 'attachments').createIndex({ task_id: 1 }),           // deleteTask cascade + per-task attachment lookups
      col(d, 'attachments').createIndex({ source: 1, created_at: 1 }), // retention sweep — find expired email attachments cheaply
      col(d, 'attachments').createIndex({ owner_type: 1, owner_id: 1 }), // per-document attachment lists
      col(d, 'quotes').createIndex({ created_at: -1 }),            // getQuotes sort
      col(d, 'quotes').createIndex({ year: 1, quote_number: -1 }), // legacy quote-number lookup
      col(d, 'prospects').createIndex({ distance_miles: 1 }),      // getProspects sort
      col(d, 'users').createIndex({ role: 1, name: 1 }),           // getUsersByRole
    ])
    await ensureAccountingIndexes(d)                               // accounts + journalEntries listing indexes
  } catch (e) {
    log.error('ensureIndexes: performance indexes failed (degraded, non-fatal)', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
  // ── Integrity tier (fatal: a throw here propagates out of getDb) ──
  await ensureCriticalIndexes(d)
  indexesEnsured = true
}

// The uniqueness/idempotency guards: the per-year unique quote number (defense in
// depth atop the atomic counter) plus the accounting constraints (unique
// invoice/bill numbers, journal idempotency). Deliberately NOT wrapped in a
// try/catch — a failure must reach getDb so the instance reads not-ready rather
// than silently serve without the safeguard.
async function ensureCriticalIndexes(d: Db): Promise<void> {
  await col(d, 'quotes').createIndex(
    { year: 1, quote_number: 1 },
    { unique: true, partialFilterExpression: { quote_number: { $exists: true } } },
  )
  await ensureAccountingConstraints(d)
}

// ── Migrations ────────────────────────────────────────────────────────────────
// Ordered, run-once data migrations. Each records its id in the `migrations`
// collection so it never re-runs; the whole pass is single-flighted across
// replicas with a short lease and is best-effort (a failure logs, never fatal).
interface Migration { id: string; up: (d: Db) => Promise<void> }

const MIGRATIONS: Migration[] = [
  { id: '0001-backfill-task-owner-emails', up: backfillTaskOwnerEmails },
  { id: '0002-seed-quote-counters', up: seedQuoteCounters },
  { id: '0003-stamp-attachment-retention', up: stampAttachmentRetention },
  { id: '0004-seed-chart-of-accounts', up: seedChartOfAccounts },
  { id: '0005-backfill-task-rank-flow', up: backfillTaskRankAndFlow },
  // 1050 Undeposited Funds is cash-like but NOT a reconcilable bank account —
  // re-subtype it so the reconcile dropdown and quick-expense paid_from stop
  // offering it (the cash-flow/cash-sparkline consumers use isCashLike instead).
  { id: '0006-undeposited-funds-subtype', up: async (d) => {
    await d.collection<{ _id: string; subtype?: string }>('accounts').updateOne({ _id: '1050', subtype: 'bank' }, { $set: { subtype: 'undeposited' } })
  } },
  // Attachments grew owner_type/owner_id so accounting documents can hold files
  // too; existing rows are all task-owned. task_id stays for legacy queries.
  { id: '0007-attachment-owners', up: async (d) => {
    await d.collection('attachments').updateMany(
      { owner_type: { $exists: false } },
      [{ $set: { owner_type: 'task', owner_id: '$task_id' } }],
    )
  } },
  // 4950 Gain/Loss on Asset Disposal joined the chart; the seeder inserts only
  // missing codes, so a re-run is the whole migration.
  { id: '0008-reseed-coa', up: async (d) => { await seedChartOfAccounts(d) } },
]

// 0005: seed the board-V2 ordering/flow fields on existing tasks. (a) `rank` —
// per status column, evenly spaced keys assigned in the board's current display
// order (created_at desc), so the day this ships nothing visibly moves. (b)
// `status_changed_at` — best available proxy for when the card entered its
// column: updated_at, else created_at. Idempotent: only fills missing fields.
async function backfillTaskRankAndFlow(d: Db): Promise<void> {
  const tasks = await col(d, 'tasks')
    .find({}, { projection: { _id: 1, status: 1, rank: 1, created_at: 1, updated_at: 1, status_changed_at: 1 } })
    .toArray()
  const byStatus = new Map<string, typeof tasks>()
  for (const t of tasks) {
    const s = String(t.status ?? 'To Do')
    const list = byStatus.get(s) ?? []
    list.push(t)
    byStatus.set(s, list)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = []
  const now = new Date().toISOString()
  for (const list of byStatus.values()) {
    list.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    const ranks = spreadRanks(list.length)
    list.forEach((t, i) => {
      const set: Record<string, string> = {}
      if (!t.rank) set.rank = ranks[i]
      if (!t.status_changed_at) set.status_changed_at = String(t.updated_at ?? t.created_at ?? now)
      if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: t._id }, update: { $set: set } } })
    })
  }
  if (ops.length) await col(d, 'tasks').bulkWrite(ops, { ordered: false })
}

// 0003: prepare existing attachments for the retention policy. (a) Date + tag
// every legacy attachment doc that predates retention — manual upload is brand
// new, so anything already stored arrived by email; created_at (the retention
// clock) is taken from the owning task's created_at, the best proxy for when the
// email landed, falling back to now. (b) Rebuild each task's `attachments`
// manifest from its attachment docs so existing cards list files (and reflect
// purge state) — without loading a single blob. Idempotent: (a) only fills docs
// missing created_at; (b) rebuilds the manifest from current data each run.
async function stampAttachmentRetention(d: Db): Promise<void> {
  // (a) Backfill created_at + source on undated attachments.
  const tasks = await col(d, 'tasks').find({}, { projection: { _id: 1, created_at: 1 } }).toArray()
  const taskCreatedAt = new Map<string, string>()
  for (const t of tasks) taskCreatedAt.set(String(t._id), (t.created_at as string) ?? '')
  const now = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attOps: any[] = []
  const undated = col(d, 'attachments').find(
    { created_at: { $exists: false } },
    { projection: { _id: 1, task_id: 1 } },
  )
  for await (const a of undated) {
    attOps.push({
      updateOne: {
        filter: { _id: a._id },
        update: { $set: { created_at: taskCreatedAt.get(String(a.task_id)) || now, source: 'email' } },
      },
    })
  }
  if (attOps.length) await col(d, 'attachments').bulkWrite(attOps, { ordered: false })

  // (b) Rebuild the per-task `attachments` manifest — metadata only (no `data`
  // projected), plus a cheap id-only pass for which blobs are already stripped.
  const metas = await col(d, 'attachments')
    .find({}, { projection: { _id: 1, task_id: 1, filename: 1, size: 1, content_type: 1, source: 1 } })
    .toArray()
  const purgedRows = await col(d, 'attachments')
    .find({ data: { $exists: false } }, { projection: { _id: 1 } })
    .toArray()
  const purged = new Set(purgedRows.map((r) => String(r._id)))
  const byTask = new Map<string, Attachment[]>()
  for (const a of metas) {
    const t = String(a.task_id)
    const list = byTask.get(t) ?? []
    list.push({
      id: String(a._id),
      filename: (a.filename as string) ?? 'attachment',
      size: Number(a.size ?? 0),
      content_type: (a.content_type as string) ?? 'application/octet-stream',
      source: (a.source as 'email' | 'upload') ?? 'email',
      purged: purged.has(String(a._id)),
    })
    byTask.set(t, list)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskOps: any[] = []
  for (const [taskId, list] of byTask) {
    taskOps.push({ updateOne: { filter: { _id: taskId }, update: { $set: { attachments: list } } } })
  }
  if (taskOps.length) await col(d, 'tasks').bulkWrite(taskOps, { ordered: false })
}

// 0002: seed the per-year quote-number counters from the highest existing
// quote_number, so getNextQuoteNumber's atomic increment continues the sequence
// instead of restarting at 1. Idempotent — $max never lowers a counter.
async function seedQuoteCounters(d: Db): Promise<void> {
  const years = (await col(d, 'quotes').distinct('year')) as unknown[]
  for (const y of years) {
    const year = Number(y)
    if (!Number.isFinite(year)) continue
    const top = await col(d, 'quotes').find({ year }).sort({ quote_number: -1 }).limit(1).toArray()
    const max = top.length ? Number(top[0].quote_number ?? 0) : 0
    await col(d, 'counters').updateOne(
      { _id: `quote:${year}` },
      { $max: { seq: Number.isFinite(max) ? max : 0 } },
      { upsert: true },
    )
  }
}

async function runMigrations(d: Db): Promise<void> {
  if (migrationsRun) return
  if (!(await tryAcquireLease('migrations', 60_000))) return // another replica is applying them
  try {
    for (const m of MIGRATIONS) {
      if (await col(d, 'migrations').findOne({ _id: m.id })) continue
      await m.up(d)
      await col(d, 'migrations').insertOne({ _id: m.id, applied_at: new Date().toISOString() })
    }
    migrationsRun = true
  } catch (e) {
    log.error('runMigrations failed (non-fatal)', { error: e instanceof Error ? e.message : String(e) })
  } finally {
    await releaseLease('migrations')
  }
}

/** Whether every known migration has been recorded as applied. Surfaced by
 *  /readyz so a replica that booted before its data migration ran reads as
 *  not-ready. Best-effort: false on any error. */
export async function migrationsApplied(): Promise<boolean> {
  try {
    const d = await getDb()
    const applied = await col(d, 'migrations').countDocuments({ _id: { $in: MIGRATIONS.map((m) => m.id) } })
    return applied >= MIGRATIONS.length
  } catch {
    return false
  }
}

// 0001: backfill created_by_email / assignee_email on tasks that predate
// identity-based ownership, resolving the stored display names against the users
// collection (users._id is the login email). Names that don't map to a
// provisioned user are left null — those tasks keep the legacy name-based
// ownership fallback. Idempotent: only fills fields that are still empty.
async function backfillTaskOwnerEmails(d: Db): Promise<void> {
  const users = await col(d, 'users').find({}, { projection: { _id: 1, name: 1 } }).toArray()
  const byName = new Map<string, string>()
  for (const u of users) {
    const n = normName(u.name as string)
    if (n) byName.set(n, String(u._id).toLowerCase())
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = []
  const cursor = col(d, 'tasks').find(
    { $or: [{ created_by_email: { $in: [null, ''] } }, { assignee_email: { $in: [null, ''] } }] },
    { projection: { created_by: 1, assigned_to: 1, created_by_email: 1, assignee_email: 1 } },
  )
  for await (const t of cursor) {
    const set: Record<string, string> = {}
    if (!t.created_by_email) {
      const e = byName.get(normName(t.created_by as string))
      if (e) set.created_by_email = e
    }
    if (!t.assignee_email) {
      const e = byName.get(normName(t.assigned_to as string))
      if (e) set.assignee_email = e
    }
    if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: t._id }, update: { $set: set } } })
  }
  if (ops.length) await col(d, 'tasks').bulkWrite(ops, { ordered: false })
}

// Canonical form for comparing a person's name across sources (Entra display
// name vs. the "Assign to" dropdown vs. LLM-extracted text). Case- and
// surrounding-whitespace-insensitive so trivial drift doesn't hide a user's
// own tasks. Used by both getTasksForUser and the task ownership check.
export function normName(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeTask(t: Record<string, unknown>): Task {
  const id = String(t._id)
  return {
    ...t,
    _id: id,
    id,
    attachment_ids: ((t.attachment_ids as string[]) ?? []).map(String),
    attachments: (t.attachments as Attachment[]) ?? [],
  } as Task
}

// Board order: rank ascending within a status column (the client groups by
// status, so a flat rank sort is per-column order). Docs without a rank — only
// possible in the brief window before migration 0005 runs — sort as null, i.e.
// first, with created_at desc breaking ties: newest-at-top, the same place a
// fresh card's top-of-column rank would put it.
const TASK_SORT = { rank: 1, created_at: -1 } as const

/** The board serves live cards by default; `archived: true` flips to the
 *  archive (auto-archived stale Done/Cancelled — see archiveStaleClosedTasks). */
export interface TaskQueryOpts { archived?: boolean }

const archivedFilter = (opts?: TaskQueryOpts) =>
  opts?.archived ? { archived_at: { $exists: true } } : { archived_at: { $exists: false } }

export async function getTasks(opts?: TaskQueryOpts): Promise<Task[]> {
  if (USE_MOCK) return mockTasksFor(opts)
  const d = await getDb()
  const tasks = await col(d, 'tasks').find(archivedFilter(opts)).sort(TASK_SORT).toArray()
  return tasks.map(normalizeTask)
}

// Mock mode: serve a stable archive slice (a few Done/Cancelled cards re-tagged
// as archived) so the archived view renders offline too.
function mockTasksFor(opts?: TaskQueryOpts): Task[] {
  const all = generateMockTasks()
  if (!opts?.archived) return all
  return all
    .filter(t => t.status === 'Done' || t.status === 'Cancelled')
    .slice(0, 6)
    .map(t => ({ ...t, archived_at: new Date().toISOString() }))
}

export async function getTasksForUser(email: string | null | undefined, name: string, opts?: TaskQueryOpts): Promise<Task[]> {
  const target = normName(name)
  if (USE_MOCK) {
    return mockTasksFor(opts).filter(
      t => normName(t.assigned_to) === target || normName(t.created_by) === target ||
        (t.co_assignees ?? []).some(c => normName(c) === target),
    )
  }
  const d = await getDb()
  // Identity match (login email) against any owner field — primary assignee,
  // co-assignees, or creator. Plus a transition fallback: tasks that carry NO
  // identity yet (un-backfilled) still surface via the legacy case-insensitive,
  // whitespace-tolerant name match (escaped so regex metacharacters in a name
  // are treated literally; an array field matches when any element does).
  const e = normName(email)
  const nameP = { $regex: `^\\s*${escapeRegex(name.trim())}\\s*$`, $options: 'i' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const or: any[] = []
  if (e) or.push({ created_by_email: e }, { assignee_email: e }, { co_assignee_emails: e })
  or.push({
    created_by_email: { $in: [null, ''] },
    assignee_email: { $in: [null, ''] },
    $or: [{ assigned_to: nameP }, { created_by: nameP }, { co_assignees: nameP }],
  })
  const tasks = await col(d, 'tasks')
    .find({ $and: [archivedFilter(opts), { $or: or }] })
    .sort(TASK_SORT)
    .toArray()
  return tasks.map(normalizeTask)
}

export async function getTask(taskId: string): Promise<Task | null> {
  if (USE_MOCK) return generateMockTasks().find(t => t._id === taskId) ?? null
  const d = await getDb()
  const task = await col(d, 'tasks').findOne({ _id: taskId })
  return task ? normalizeTask(task) : null
}

export async function getTasksSignature(): Promise<string> {
  if (USE_MOCK) return 'mock'
  const d = await getDb()
  // Polled ~every 2s by every open client, so keep it cheap. estimatedDocumentCount
  // reads collection metadata (O(1)) instead of countDocuments' O(n) scan; it still
  // changes on any insert/delete, and the max(updated_at) — served by the
  // updated_at:-1 index — catches in-place edits. Run both in parallel.
  const [count, latest] = await Promise.all([
    col(d, 'tasks').estimatedDocumentCount(),
    col(d, 'tasks').findOne({}, { sort: { updated_at: -1 }, projection: { updated_at: 1 } }),
  ])
  return `${count}:${(latest?.updated_at as string) ?? ''}`
}

/** A rank that sorts a card to the top of `status`'s column (above its current
 *  smallest rank). One indexed point-read on {status, rank}. */
export async function topRankForStatus(status: string): Promise<string> {
  const d = await getDb()
  const top = await col(d, 'tasks')
    .find({ status, rank: { $type: 'string' } }, { projection: { rank: 1 } })
    .sort({ rank: 1 })
    .limit(1)
    .toArray()
  return rankBetween(null, (top[0]?.rank as string) ?? null)
}

export async function insertTask(task: Record<string, unknown>): Promise<string> {
  const d = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  // New cards (manual or email-synced) land at the top of their column, and
  // their aging clock starts now.
  const rank = (task.rank as string) ?? await topRankForStatus(String(task.status ?? 'To Do'))
  await col(d, 'tasks').insertOne({
    ...task,
    _id: id,
    rank,
    status_changed_at: task.status_changed_at ?? now,
    created_at: task.created_at ?? now,
    updated_at: now,
    attachment_ids: (task.attachment_ids as string[]) ?? [],
  })
  return id
}

export async function updateTaskField(taskId: string, field: string, value: unknown): Promise<boolean> {
  const d = await getDb()
  const result = await col(d, 'tasks').updateOne(
    { _id: taskId },
    { $set: { [field]: value, updated_at: new Date().toISOString() } },
  )
  return result.modifiedCount > 0
}

/** Set multiple fields at once and optionally append a timeline entry, atomically.
 *  Used by the email sync to apply a thread-reply patch or merge a parsed
 *  attachment without a read-modify-write race. `unset` removes fields in the
 *  same write (e.g. clearing archived_at when a status change restores a card). */
export async function patchTask(
  taskId: string,
  set: Record<string, unknown>,
  push?: TimelineEntry,
  unset?: string[],
): Promise<boolean> {
  const d = await getDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = { $set: { ...set, updated_at: new Date().toISOString() } }
  if (push) update.$push = { timeline: push }
  if (unset?.length) update.$unset = Object.fromEntries(unset.map(k => [k, '']))
  const result = await col(d, 'tasks').updateOne({ _id: taskId }, update)
  return result.modifiedCount > 0
}

// ── Auto-archive ──────────────────────────────────────────────────────────────
// Done/Cancelled cards that finished long ago stop earning their board pixels:
// after ARCHIVE_AFTER_DAYS in a terminal column they get archived_at stamped and
// drop out of the default queries (still in Mongo, still in global search; the
// board's Archived toggle lists them, and any status change restores them).
// Ran lazily from GET /api/tasks, throttled via the meta collection so the
// updateMany runs at most once an hour across all replicas — same pattern as
// the infra-spend cache.
const ARCHIVE_SWEEP_INTERVAL_MS = 60 * 60 * 1000

export async function archiveStaleClosedTasks(): Promise<number> {
  if (USE_MOCK) return 0
  const d = await getDb()
  const now = new Date()
  const meta = await col(d, 'meta').findOne({ _id: 'archive_sweep' })
  if (meta && now.getTime() - Date.parse(meta.last_run as string) < ARCHIVE_SWEEP_INTERVAL_MS) return 0
  await col(d, 'meta').updateOne(
    { _id: 'archive_sweep' },
    { $set: { last_run: now.toISOString() } },
    { upsert: true },
  )
  const cutoff = retentionCutoff(ARCHIVE_AFTER_DAYS, now)
  const r = await col(d, 'tasks').updateMany(
    {
      status: { $in: ['Done', 'Cancelled'] },
      archived_at: { $exists: false },
      // $lt on a string field only matches strings — docs that somehow lack
      // status_changed_at (pre-backfill) are left alone rather than archived.
      status_changed_at: { $lt: cutoff },
    },
    { $set: { archived_at: now.toISOString(), updated_at: now.toISOString() } },
  )
  if (r.modifiedCount > 0) log.info('archive sweep', { archived: r.modifiedCount })
  return r.modifiedCount
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const d = await getDb()
  // An email-synced card leaves tombstones (message + thread keys) so the next
  // sweep won't re-create it while the source email is still flagged in Outlook
  // — deleting a synced card means "done with this", not "re-import it".
  const task = await col(d, 'tasks').findOne(
    { _id: taskId },
    { projection: { exchange_id: 1, conversation_id: 1, title: 1 } },
  )
  if (task) {
    const keys = tombstoneKeysForTask(task as { exchange_id?: string; conversation_id?: string })
    if (keys.length) {
      const deleted_at = new Date().toISOString()
      await col(d, 'sync_tombstones').bulkWrite(
        keys.map(k => ({
          updateOne: {
            filter: { _id: k },
            update: { $set: { title: (task.title as string) ?? '', deleted_at } },
            upsert: true,
          },
        })),
      )
    }
  }
  await col(d, 'attachments').deleteMany({ task_id: taskId })
  const result = await col(d, 'tasks').deleteOne({ _id: taskId })
  return result.deletedCount > 0
}

/** Every tombstone key (deleted email-synced cards) — loaded once per sync sweep
 *  so the sweep can skip emails whose card was deliberately deleted. */
export async function getSyncTombstoneKeys(): Promise<Set<string>> {
  if (USE_MOCK) return new Set()
  const d = await getDb()
  const docs = await col(d, 'sync_tombstones').find({}, { projection: { _id: 1 } }).toArray()
  return new Set(docs.map(t => String(t._id)))
}

// ── Comment edit / delete / react ────────────────────────────────────────────
// Comments are `kind:'comment'` entries inside a task's `timeline` array, each
// with a stable `id`. These address a single entry by that id (the positional
// `$` operator) or remove it (and its replies) with `$pull`.
const now = () => new Date().toISOString()

/** Edit a comment's text + recomputed mentions in place. */
export async function updateComment(
  taskId: string,
  commentId: string,
  text: string,
  mentions: string[],
): Promise<boolean> {
  const d = await getDb()
  const res = await col(d, 'tasks').updateOne(
    { _id: taskId, 'timeline.id': commentId },
    {
      $set: {
        'timeline.$.text': text,
        'timeline.$.mentions': mentions,
        'timeline.$.edited_at': now(),
        updated_at: now(),
      },
    },
  )
  return res.modifiedCount > 0
}

/** Delete a comment AND any replies to it (entries whose parent_id === commentId). */
// ── Checklist (punch list) ───────────────────────────────────────────────────
// Embedded array on the task, same atomic-positional-update approach as
// comments. Authz lives in the routes (task access is the only requirement).

export async function addChecklistItem(taskId: string, item: ChecklistItem): Promise<boolean> {
  const d = await getDb()
  const res = await col(d, 'tasks').updateOne(
    { _id: taskId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { $push: { checklist: item } as any, $set: { updated_at: now() } },
  )
  return res.modifiedCount > 0
}

export async function setChecklistItem(
  taskId: string,
  itemId: string,
  patch: { text?: string; done?: boolean; doneBy?: string },
): Promise<boolean> {
  const d = await getDb()
  const set: Record<string, unknown> = { updated_at: now() }
  const unset: Record<string, ''> = {}
  if (patch.text !== undefined) set['checklist.$.text'] = patch.text
  if (patch.done !== undefined) {
    set['checklist.$.done'] = patch.done
    if (patch.done) {
      set['checklist.$.done_by'] = patch.doneBy ?? ''
      set['checklist.$.done_at'] = now()
    } else {
      unset['checklist.$.done_by'] = ''
      unset['checklist.$.done_at'] = ''
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = { $set: set }
  if (Object.keys(unset).length) update.$unset = unset
  const res = await col(d, 'tasks').updateOne({ _id: taskId, 'checklist.id': itemId }, update)
  return res.modifiedCount > 0
}

export async function deleteChecklistItem(taskId: string, itemId: string): Promise<boolean> {
  const d = await getDb()
  const res = await col(d, 'tasks').updateOne(
    { _id: taskId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { $pull: { checklist: { id: itemId } } as any, $set: { updated_at: now() } },
  )
  return res.modifiedCount > 0
}

export async function deleteComment(taskId: string, commentId: string): Promise<boolean> {
  const d = await getDb()
  const res = await col(d, 'tasks').updateOne(
    { _id: taskId },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $pull: { timeline: { $or: [{ id: commentId }, { parent_id: commentId }] } } as any,
      $set: { updated_at: now() },
    },
  )
  return res.modifiedCount > 0
}

/** Replace a comment's whole reactions map (computed by the caller via toggleReactor). */
export async function setCommentReactions(
  taskId: string,
  commentId: string,
  reactions: Record<string, string[]>,
): Promise<boolean> {
  const d = await getDb()
  const res = await col(d, 'tasks').updateOne(
    { _id: taskId, 'timeline.id': commentId },
    { $set: { 'timeline.$.reactions': reactions, updated_at: now() } },
  )
  return res.modifiedCount > 0
}

// ── Generated quotes ─────────────────────────────────────────────────────────
// Quotes produced by the Quote Generator are stored in their own `quotes`
// collection (kept separate from Kanban tasks so the board stays clean) and
// merged into the dashboard's quote analytics.

export async function insertQuote(quote: Record<string, unknown>): Promise<string> {
  const d = await getDb()
  const id = crypto.randomUUID()
  await col(d, 'quotes').insertOne({
    ...quote,
    _id: id,
    created_at: quote.created_at ?? new Date().toISOString(),
  })
  return id
}

export async function getQuotes(): Promise<Quote[]> {
  if (USE_MOCK) return generateMockQuotes()
  const d = await getDb()
  const quotes = await col(d, 'quotes').find().sort({ created_at: -1 }).toArray()
  return quotes.map(q => ({ ...q, _id: String(q._id) })) as Quote[]
}

// Next sequential quote number for a given year (mirrors the per-year numbering
// in the RAVES Quote Log).
// Atomically allocate the next per-year quote number. A single findOneAndUpdate
// with $inc is race-free — concurrent generations get distinct numbers — unlike
// the old read-max-then-+1, which could hand the same number to two callers. The
// counters are seeded from existing data by migration 0002; a brand-new year
// starts at 1.
export async function getNextQuoteNumber(year: number): Promise<number> {
  if (USE_MOCK) return 1
  const d = await getDb()
  const res = await col(d, 'counters').findOneAndUpdate(
    { _id: `quote:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  )
  // Driver v6 returns the document directly; guard the legacy { value } shape too.
  return Number(res?.seq ?? res?.value?.seq ?? 1)
}

// Mark a quote won / lost / open (the dashboard win/loss toggle).
export async function updateQuoteStatus(
  id: string,
  status: 'won' | 'lost' | 'open',
): Promise<boolean> {
  const d = await getDb()
  const res = await col(d, 'quotes').updateOne(
    { _id: id },
    { $set: { status, updated_at: new Date().toISOString() } },
  )
  return res.matchedCount > 0
}

// ── Warehouse prospects ──────────────────────────────────────────────────────
// Commercial-property leads pulled live from OpenStreetMap + county parcel GIS,
// stored in the `prospects` collection keyed by the source id so a re-pull
// upserts in place. USE_MOCK_DATA serves generated prospects so the page works
// without Atlas/network access.

export async function getProspects(): Promise<Prospect[]> {
  if (USE_MOCK) {
    return generateMockProspects({
      lat: PROSPECT_CENTER.lat,
      lng: PROSPECT_CENTER.lng,
      radiusMiles: PROSPECT_DEFAULTS.radiusMiles,
      minSqft: PROSPECT_DEFAULTS.minSqft,
      maxSqft: PROSPECT_DEFAULTS.maxSqft,
    })
  }
  const d = await getDb()
  const rows = await col(d, 'prospects').find().sort({ distance_miles: 1 }).toArray()
  return rows.map(r => ({ pipeline_status: 'new', ...r, _id: String(r._id) })) as Prospect[]
}

/** Upsert a batch of prospects by source id. Returns how many were new vs.
 *  refreshed so the UI can report "X added, Y updated". User-managed pipeline
 *  fields (status / assignee / notes) are written ONLY on first insert, so a
 *  later re-pull refreshes the property data without wiping a rep's work. */
export async function upsertProspects(
  prospects: Prospect[],
): Promise<{ added: number; updated: number }> {
  if (!prospects.length) return { added: 0, updated: 0 }
  const d = await getDb()
  const now = new Date().toISOString()
  const ops = prospects.map(p => {
    // Strip identity + user-managed fields from $set so re-pulls never clobber them.
    const { _id, created_at, pipeline_status, assignee, notes, ...sourceFields } = p
    return {
      updateOne: {
        filter: { _id: p.attom_id },
        update: {
          $set: { ...sourceFields, updated_at: now },
          $setOnInsert: {
            _id: p.attom_id,
            created_at: created_at ?? now,
            pipeline_status: pipeline_status ?? 'new',
            ...(assignee !== undefined ? { assignee } : {}),
            ...(notes !== undefined ? { notes } : {}),
          },
        },
        upsert: true,
      },
    }
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await col(d, 'prospects').bulkWrite(ops as any, { ordered: false })
  return { added: res.upsertedCount ?? 0, updated: res.modifiedCount ?? 0 }
}

/** Patch a prospect's user-managed pipeline fields (status / assignee / notes). */
export async function updateProspectFields(
  id: string,
  patch: Partial<Pick<Prospect, 'pipeline_status' | 'assignee' | 'notes'>>,
): Promise<boolean> {
  if (USE_MOCK) return true // dev/demo: edits are optimistic, no Atlas needed
  const d = await getDb()
  const res = await col(d, 'prospects').updateOne(
    { _id: id },
    { $set: { ...patch, updated_at: new Date().toISOString() } },
  )
  return res.matchedCount > 0
}

/** Document owners an attachment can belong to. Tasks keep their legacy
 *  task_id field alongside owner_type/owner_id; accounting owners use the
 *  owner fields only. The retention sweep is owner-agnostic (it keys on
 *  source==='email', and accounting uploads are always 'upload'). */
export type AttachmentOwner = { type: 'task' | 'invoice' | 'bill' | 'journal-entry'; id: string }

/** Core attachment insert, shared by task uploads/email-sync and the
 *  accounting document attachments. */
export async function saveOwnedAttachment(
  owner: AttachmentOwner,
  filename: string,
  content: Buffer,
  size: number,
  contentType: string,
  source: 'email' | 'upload' = 'upload',
): Promise<Attachment> {
  const d = await getDb()
  const attId = crypto.randomUUID()
  await col(d, 'attachments').insertOne({
    _id: attId,
    owner_type: owner.type,
    owner_id: owner.id,
    ...(owner.type === 'task' ? { task_id: owner.id } : {}), // legacy task-path queries
    filename,
    size,
    content_type: contentType,
    source,
    created_at: new Date().toISOString(),  // retention clock
    data: content,
  })
  return { id: attId, filename, size, content_type: contentType, source, purged: false }
}

/** Attachment metadata for one owner, blob excluded. */
export async function listAttachmentsByOwner(type: AttachmentOwner['type'], id: string): Promise<Attachment[]> {
  const d = await getDb()
  const rows = await col(d, 'attachments')
    .find({ owner_type: type, owner_id: id }, { projection: { data: 0 } })
    .sort({ created_at: 1 })
    .toArray()
  return rows.map((a) => ({
    id: String(a._id), filename: a.filename as string, size: a.size as number,
    content_type: a.content_type as string, source: (a.source as 'email' | 'upload') ?? 'upload',
    purged: !!a.data_purged_at,
  }))
}

/** Scoped delete for non-task owners (tasks go through deleteAttachment, which
 *  also maintains the card manifest). Returns true if the doc existed. */
export async function deleteOwnedAttachment(owner: AttachmentOwner, attId: string): Promise<boolean> {
  const d = await getDb()
  const res = await col(d, 'attachments').deleteOne({ _id: attId, owner_type: owner.type, owner_id: owner.id })
  return res.deletedCount > 0
}

export async function saveAttachment(
  taskId: string,
  filename: string,
  content: Buffer,
  size: number,
  contentType: string,
  // Origin drives retention: 'email' files are auto-purged after the window;
  // 'upload' files (a user deliberately attached) are kept like task details.
  // Defaults to 'upload' so a forgotten arg fails safe (over-retain, never delete).
  source: 'email' | 'upload' = 'upload',
): Promise<Attachment> {
  const d = await getDb()
  const meta = await saveOwnedAttachment({ type: 'task', id: taskId }, filename, content, size, contentType, source)
  const attId = meta.id
  // Push the id (legacy array still read by older docs) AND the display metadata
  // (filename/size/source) so the card can label the file — and later mark it
  // expired — without fetching the blob.
  await col(d, 'tasks').updateOne(
    { _id: taskId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { $push: { attachment_ids: attId, attachments: meta } as any, $set: { updated_at: new Date().toISOString() } },
  )
  return meta
}

// ── Attachment retention ──────────────────────────────────────────────────────
// Policy: task details are kept in perpetuity, but the raw bytes of an EMAIL
// attachment are tossed after a retention window (default 30 days). We strip only
// the `data` Buffer and keep the metadata row (filename/size/type) so the card
// still lists the file as a named, "expired" record. Manually-uploaded files
// (source:'upload') are never auto-purged. Returns how many files were purged.
// Idempotent + safe: only docs that still have `data` re-match, and the
// created_at range filter skips any un-dated legacy doc (type bracketing) until
// migration 0003 stamps it.
/** ISO cutoff: an attachment stored before this is past the retention window.
 *  Pure + exported so the day-count math is unit-tested. */
export function retentionCutoff(retentionDays: number, now: Date = new Date()): string {
  return new Date(now.getTime() - retentionDays * 86_400_000).toISOString()
}

/** Mongo filter for the email attachments whose bytes are eligible to purge:
 *  email-sourced (uploads are kept), still holding `data` (so it never re-purges),
 *  and stored before the cutoff (type bracketing skips un-dated legacy docs). Pure
 *  + exported so the email-only / has-data scoping is regression-tested without a
 *  live DB — dropping any clause here is what would wrongly delete a user's upload. */
export function expiredEmailAttachmentFilter(cutoffISO: string) {
  return { source: 'email', data: { $exists: true }, created_at: { $lt: cutoffISO } }
}

export async function purgeExpiredAttachmentData(retentionDays = 30): Promise<number> {
  const d = await getDb()
  const cutoff = retentionCutoff(retentionDays)
  const expired = await col(d, 'attachments')
    .find(expiredEmailAttachmentFilter(cutoff), { projection: { _id: 1, task_id: 1 } })
    .toArray()
  if (!expired.length) return 0

  const now = new Date().toISOString()
  await col(d, 'attachments').updateMany(
    { _id: { $in: expired.map((a) => a._id) } },
    { $unset: { data: '' }, $set: { data_purged_at: now } },
  )

  // Flip the matching manifest entry on each owning task (and bump updated_at so
  // the board's poll refreshes the card). Grouped per task to coalesce files that
  // share a card; arrayFilters updates every matching entry, not just the first.
  const byTask = new Map<string, string[]>()
  for (const a of expired) {
    const t = String(a.task_id)
    const ids = byTask.get(t) ?? []
    ids.push(String(a._id))
    byTask.set(t, ids)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = []
  for (const [taskId, ids] of byTask) {
    ops.push({
      updateOne: {
        filter: { _id: taskId },
        update: { $set: { 'attachments.$[m].purged': true, updated_at: now } },
        arrayFilters: [{ 'm.id': { $in: ids } }],
      },
    })
  }
  if (ops.length) await col(d, 'tasks').bulkWrite(ops, { ordered: false })
  return expired.length
}

export async function getAttachment(attId: string) {
  const d = await getDb()
  return col(d, 'attachments').findOne({ _id: attId })
}

/** Remove one attachment from a task: drop the blob and pull its id + metadata
 *  from the task. Scoped to the owning task so a stray id can't delete another
 *  card's file. Returns true if the blob existed. */
export async function deleteAttachment(taskId: string, attId: string): Promise<boolean> {
  const d = await getDb()
  const res = await col(d, 'attachments').deleteOne({ _id: attId, task_id: taskId })
  await col(d, 'tasks').updateOne(
    { _id: taskId },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $pull: { attachment_ids: attId, attachments: { id: attId } } as any,
      $set: { updated_at: new Date().toISOString() },
    },
  )
  return res.deletedCount > 0
}

export async function getUsers(): Promise<User[]> {
  const d = await getDb()
  return col(d, 'users').find().sort({ _id: 1 }).toArray()
}

export async function getUsersByRole(role: string): Promise<User[]> {
  const d = await getDb()
  return col(d, 'users').find({ role }).sort({ name: 1 }).toArray()
}

export async function getUser(email: string) {
  const d = await getDb()
  return col(d, 'users').findOne({ _id: email.toLowerCase() })
}

/** Resolve a person's display name to their stable login email (users._id),
 *  case-insensitively. Returns null for names that aren't provisioned app users
 *  (e.g. field crews) — those simply get no identity-based ownership. */
/** Resolve a display name to an admin's login email via ADMIN_EMAILS, matching
 *  the email's local-part to the name (case-insensitive). Admins granted access
 *  through ADMIN_EMAILS may have no users doc, so a name lookup can't find them
 *  — without this, their task assignments get no assignee_email and vanish from
 *  their own "My Work" (the exact bug that hid an admin's tasks). The local-part
 *  convention mirrors the SUPERVISORS first-name roster, e.g. the "Ben" dropdown
 *  entry → ben@ravesinc.com. Pure + exported so it can be unit-tested. */
export function resolveAdminEmailByName(name: string, adminEmailsCsv: string | undefined): string | null {
  const n = normName(name)
  if (!n) return null
  const admins = (adminEmailsCsv ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return admins.find((e) => e.split('@')[0] === n) ?? null
}

export async function getUserEmailByName(name: string): Promise<string | null> {
  if (!normName(name)) return null
  const d = await getDb()
  const u = await col(d, 'users').findOne(
    { name: { $regex: `^\\s*${escapeRegex(name.trim())}\\s*$`, $options: 'i' } },
    { projection: { _id: 1 } },
  )
  // Provisioned users win; otherwise fall back to an ADMIN_EMAILS admin so their
  // assignments still carry identity even without a users doc.
  return u ? String(u._id).toLowerCase() : resolveAdminEmailByName(name, env.ADMIN_EMAILS)
}

/** Normalize a co-assignee list (trim, dedupe, drop blanks / the "Unassigned"
 *  sentinel / the primary assignee) and resolve each name to a login email where
 *  one exists. Shared by task create and the co_assignees PATCH so both write
 *  the same shape; names without an app user simply get no identity email (same
 *  rule as the primary assignee). */
export async function resolveCoAssignees(
  names: string[],
  primary?: string | null,
): Promise<{ co_assignees: string[]; co_assignee_emails: string[] }> {
  const p = normName(primary)
  const seen = new Set<string>()
  const clean: string[] = []
  for (const raw of names) {
    const name = (raw ?? '').trim()
    const key = normName(name)
    if (!key || key === 'unassigned' || key === p || seen.has(key)) continue
    seen.add(key)
    clean.push(name)
  }
  const emails = (await Promise.all(clean.map(getUserEmailByName))).filter((e): e is string => !!e)
  return { co_assignees: clean, co_assignee_emails: [...new Set(emails)] }
}

export async function upsertUser(email: string, role: string, name: string): Promise<void> {
  const d = await getDb()
  const now = new Date().toISOString()
  await col(d, 'users').updateOne(
    { _id: email.toLowerCase() },
    { $set: { role, name, updated_at: now }, $setOnInsert: { firstSeenAt: now } },
    { upsert: true },
  )
}

// In-process throttle so we record activity at most once per user per window —
// keeps lastActiveAt off the hot path (one write per ~5 min, not per request).
// Per-replica, so the worst case across replicas is a couple of extra writes.
const _activityWindowMs = 5 * 60_000
const _activityTouchedAt = new Map<string, number>()

/** Best-effort "user was here" stamp on the users doc, used by the admin usage
 *  view. Throttled in-memory; only updates an already-provisioned user; never
 *  throws (activity tracking must never break a page load). */
export async function touchUserActivity(email: string): Promise<void> {
  const e = email.toLowerCase()
  const nowMs = Date.now()
  if (nowMs - (_activityTouchedAt.get(e) ?? 0) < _activityWindowMs) return
  _activityTouchedAt.set(e, nowMs)
  try {
    const d = await getDb()
    await col(d, 'users').updateOne({ _id: e }, { $set: { lastActiveAt: new Date(nowMs).toISOString() } })
  } catch { /* best-effort */ }
}

export async function deleteUser(email: string): Promise<boolean> {
  const d = await getDb()
  const result = await col(d, 'users').deleteOne({ _id: email.toLowerCase() })
  return result.deletedCount > 0
}

// ── Self-serve access requests ────────────────────────────────────────────────
// A signed-in user who isn't provisioned can request access from the
// "Access Pending" screen. Stored in `accessRequests`, keyed by email so a
// re-request just refreshes the existing pending row (no duplicates).
export interface AccessRequest {
  email: string
  name: string
  note: string
  requested_at: string
}

export async function createAccessRequest(email: string, name: string, note = ''): Promise<void> {
  const d = await getDb()
  await col(d, 'accessRequests').updateOne(
    { _id: email.toLowerCase() },
    {
      $set: { name, note, status: 'pending', requested_at: new Date().toISOString() },
      $setOnInsert: { _id: email.toLowerCase() },
    },
    { upsert: true },
  )
}

export async function listPendingAccessRequests(): Promise<AccessRequest[]> {
  const d = await getDb()
  const rows = await col(d, 'accessRequests').find({ status: 'pending' }).sort({ requested_at: 1 }).toArray()
  return rows.map(r => ({
    email: String(r._id),
    name: (r.name as string) ?? '',
    note: (r.note as string) ?? '',
    requested_at: (r.requested_at as string) ?? '',
  }))
}

/** Mark a request approved/denied. Approval itself (provisioning the user) is the
 *  caller's job — this only records the outcome so it leaves the pending list. */
export async function resolveAccessRequest(email: string, status: 'approved' | 'denied'): Promise<boolean> {
  const d = await getDb()
  const res = await col(d, 'accessRequests').updateOne(
    { _id: email.toLowerCase() },
    { $set: { status, resolved_at: new Date().toISOString() } },
  )
  return res.matchedCount > 0
}

// ── App metadata + distributed leases ────────────────────────────────────────
// A small `meta` collection keyed by string id. Persists the Graph
// change-notification subscription, and coordinates background work across the
// (up to 2) replicas so they don't double-fire.

export async function getMeta(id: string): Promise<Record<string, unknown> | null> {
  const d = await getDb()
  return col(d, 'meta').findOne({ _id: id })
}

export async function setMeta(id: string, doc: Record<string, unknown>): Promise<void> {
  const d = await getDb()
  await col(d, 'meta').updateOne(
    { _id: id },
    { $set: { ...doc, updated_at: new Date().toISOString() } },
    { upsert: true },
  )
}

/** Best-effort distributed lease. Returns true if this caller acquired `name`
 *  for `ttlMs`. Only one replica wins; the lease auto-expires so a crash can't
 *  deadlock it. Used to debounce email syncs and single-thread the
 *  subscription-renewal timer. */
export async function tryAcquireLease(name: string, ttlMs: number): Promise<boolean> {
  const d = await getDb()
  const now = new Date()
  const until = new Date(now.getTime() + ttlMs)
  try {
    const res = await col(d, 'meta').updateOne(
      { _id: `lease:${name}`, lockedUntil: { $lt: now } },
      { $set: { lockedUntil: until } },
      { upsert: true },
    )
    return res.modifiedCount > 0 || res.upsertedCount > 0
  } catch {
    // Duplicate-key error → the doc exists and is still locked (the filter's
    // lockedUntil<now didn't match), so another caller holds the lease.
    return false
  }
}

/** Release a lease early (otherwise it just expires after its TTL). */
export async function releaseLease(name: string): Promise<void> {
  const d = await getDb()
  await col(d, 'meta').updateOne({ _id: `lease:${name}` }, { $set: { lockedUntil: new Date(0) } })
}
