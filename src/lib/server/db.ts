import { MongoClient, type Db } from 'mongodb'
import { env } from '$env/dynamic/private'
import type { Task, User, Quote, Prospect, TimelineEntry } from '$lib/types'
import { generateMockTasks, generateMockProspects } from './mock'
import { PROSPECT_CENTER, PROSPECT_DEFAULTS } from '$lib/constants'
import { requireInProd } from './config'

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
      client = c
      db = c.db(dbName)
      await ensureIndexes(db)
      await runMigrations(db)
      return db
    })().catch((e) => {
      connecting = null
      throw e
    })
  }
  return connecting
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
// hand-applied per environment. Best-effort: a failure is logged, never fatal, so
// a transient index issue can't take the whole DB layer down.
//
// The My Work query (getTasksForUser) is served by the created_by_email /
// assignee_email indexes; its legacy case-insensitive name regex is only a
// transition fallback for un-backfilled tasks (can't use a btree, but rare).
async function ensureIndexes(d: Db): Promise<void> {
  if (indexesEnsured) return
  try {
    await Promise.all([
      col(d, 'tasks').createIndex({ updated_at: -1 }),             // getTasksSignature — polled ~every 2s by every open client
      col(d, 'tasks').createIndex({ created_at: -1 }),             // getTasks / getTasksForUser sort
      col(d, 'tasks').createIndex({ created_by_email: 1 }),        // getTasksForUser (My Work) — identity match
      col(d, 'tasks').createIndex({ assignee_email: 1 }),          // getTasksForUser (My Work) — identity match
      col(d, 'attachments').createIndex({ task_id: 1 }),           // deleteTask cascade + per-task attachment lookups
      col(d, 'quotes').createIndex({ created_at: -1 }),            // getQuotes sort
      col(d, 'quotes').createIndex({ year: 1, quote_number: -1 }), // legacy quote-number lookup
      col(d, 'quotes').createIndex(                                // unique per-year number — defense in depth atop the atomic counter
        { year: 1, quote_number: 1 },
        { unique: true, partialFilterExpression: { quote_number: { $exists: true } } },
      ),
      col(d, 'prospects').createIndex({ distance_miles: 1 }),      // getProspects sort
      col(d, 'users').createIndex({ role: 1, name: 1 }),           // getUsersByRole
    ])
    indexesEnsured = true
  } catch (e) {
    console.error('[db] ensureIndexes failed (non-fatal):', e)
  }
}

// ── Migrations ────────────────────────────────────────────────────────────────
// Ordered, run-once data migrations. Each records its id in the `migrations`
// collection so it never re-runs; the whole pass is single-flighted across
// replicas with a short lease and is best-effort (a failure logs, never fatal).
interface Migration { id: string; up: (d: Db) => Promise<void> }

const MIGRATIONS: Migration[] = [
  { id: '0001-backfill-task-owner-emails', up: backfillTaskOwnerEmails },
  { id: '0002-seed-quote-counters', up: seedQuoteCounters },
]

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
    console.error('[db] runMigrations failed (non-fatal):', e)
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
  } as Task
}

export async function getTasks(): Promise<Task[]> {
  if (USE_MOCK) return generateMockTasks()
  const d = await getDb()
  const tasks = await col(d, 'tasks').find().sort({ created_at: -1 }).toArray()
  return tasks.map(normalizeTask)
}

export async function getTasksForUser(email: string | null | undefined, name: string): Promise<Task[]> {
  const target = normName(name)
  if (USE_MOCK) {
    return generateMockTasks().filter(
      t => normName(t.assigned_to) === target || normName(t.created_by) === target,
    )
  }
  const d = await getDb()
  // Identity match (login email) against either owner field — the indexed paths.
  // Plus a transition fallback: tasks that carry NO identity yet (un-backfilled)
  // still surface via the legacy case-insensitive, whitespace-tolerant name match
  // (escaped so regex metacharacters in a name are treated literally).
  const e = normName(email)
  const nameP = { $regex: `^\\s*${escapeRegex(name.trim())}\\s*$`, $options: 'i' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const or: any[] = []
  if (e) or.push({ created_by_email: e }, { assignee_email: e })
  or.push({
    created_by_email: { $in: [null, ''] },
    assignee_email: { $in: [null, ''] },
    $or: [{ assigned_to: nameP }, { created_by: nameP }],
  })
  const tasks = await col(d, 'tasks').find({ $or: or }).sort({ created_at: -1 }).toArray()
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
  const count = await col(d, 'tasks').countDocuments()
  const latest = await col(d, 'tasks').findOne(
    {},
    { sort: { updated_at: -1 }, projection: { updated_at: 1 } },
  )
  return `${count}:${(latest?.updated_at as string) ?? ''}`
}

export async function insertTask(task: Record<string, unknown>): Promise<string> {
  const d = await getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await col(d, 'tasks').insertOne({
    ...task,
    _id: id,
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
 *  attachment without a read-modify-write race. */
export async function patchTask(
  taskId: string,
  set: Record<string, unknown>,
  push?: TimelineEntry,
): Promise<boolean> {
  const d = await getDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = { $set: { ...set, updated_at: new Date().toISOString() } }
  if (push) update.$push = { timeline: push }
  const result = await col(d, 'tasks').updateOne({ _id: taskId }, update)
  return result.modifiedCount > 0
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const d = await getDb()
  await col(d, 'attachments').deleteMany({ task_id: taskId })
  const result = await col(d, 'tasks').deleteOne({ _id: taskId })
  return result.deletedCount > 0
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
  if (USE_MOCK) return []
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
// Commercial-property leads pulled from ATTOM, stored in the `prospects`
// collection keyed by attom_id so a re-pull upserts in place. USE_MOCK_DATA
// serves generated prospects so the page works without Atlas/a paid key.

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

/** Upsert a batch of prospects by attom_id. Returns how many were new vs.
 *  refreshed so the UI can report "X added, Y updated". User-managed pipeline
 *  fields (status / assignee / notes) are written ONLY on first insert, so a
 *  later ATTOM re-pull refreshes the property data without wiping a rep's work. */
export async function upsertProspects(
  prospects: Prospect[],
): Promise<{ added: number; updated: number }> {
  if (!prospects.length) return { added: 0, updated: 0 }
  const d = await getDb()
  const now = new Date().toISOString()
  const ops = prospects.map(p => {
    // Strip identity + user-managed fields from $set so re-pulls never clobber them.
    const { _id, created_at, pipeline_status, assignee, notes, ...attomFields } = p
    return {
      updateOne: {
        filter: { _id: p.attom_id },
        update: {
          $set: { ...attomFields, updated_at: now },
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

export async function saveAttachment(
  taskId: string,
  filename: string,
  content: Buffer,
  size: number,
  contentType: string,
): Promise<string> {
  const d = await getDb()
  const attId = crypto.randomUUID()
  await col(d, 'attachments').insertOne({
    _id: attId,
    task_id: taskId,
    filename,
    size,
    content_type: contentType,
    data: content,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await col(d, 'tasks').updateOne({ _id: taskId }, { $push: { attachment_ids: attId } } as any)
  return attId
}

export async function getAttachment(attId: string) {
  const d = await getDb()
  return col(d, 'attachments').findOne({ _id: attId })
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
export async function getUserEmailByName(name: string): Promise<string | null> {
  if (!normName(name)) return null
  const d = await getDb()
  const u = await col(d, 'users').findOne(
    { name: { $regex: `^\\s*${escapeRegex(name.trim())}\\s*$`, $options: 'i' } },
    { projection: { _id: 1 } },
  )
  return u ? String(u._id).toLowerCase() : null
}

export async function upsertUser(email: string, role: string, name: string): Promise<void> {
  const d = await getDb()
  await col(d, 'users').updateOne(
    { _id: email.toLowerCase() },
    { $set: { role, name, updated_at: new Date().toISOString() } },
    { upsert: true },
  )
}

export async function deleteUser(email: string): Promise<boolean> {
  const d = await getDb()
  const result = await col(d, 'users').deleteOne({ _id: email.toLowerCase() })
  return result.deletedCount > 0
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
