import { MongoClient, type Db } from 'mongodb'
import { env } from '$env/dynamic/private'
import type { Task, User } from '$lib/types'
import { generateMockTasks } from './mock'

let client: MongoClient | null = null
let db: Db | null = null

// Dev escape hatch: serve generated tasks instead of hitting Mongo. Lets the
// dashboard/board render with realistic data when no Atlas/seed is available.
const USE_MOCK = env.USE_MOCK_DATA === 'true'

export async function getDb(): Promise<Db> {
  if (db) return db
  // Read via $env/dynamic/private, NOT process.env: under Vite 8 SSR process.env
  // is unpopulated from .env, so MONGODB_URI fell back to localhost and the app
  // silently used a local mongo instead of Atlas. Same root cause as src/lib/auth.ts.
  const uri = env.MONGODB_URI ?? env.MONGO_URI ?? 'mongodb://localhost:27017/'
  const dbName = env.MONGODB_DB_NAME ?? env.MONGO_DB_NAME ?? 'blueprint'
  client = new MongoClient(uri)
  await client.connect()
  db = client.db(dbName)
  return db
}

// Our tasks use string UUIDs as _id (not MongoDB ObjectIds).
// We use `any` on the collection to avoid the strict ObjectId constraint in the driver's types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(d: Db, name: string) { return d.collection<any>(name) }

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

export async function getTasksForUser(userName: string): Promise<Task[]> {
  const target = normName(userName)
  if (USE_MOCK) {
    return generateMockTasks().filter(
      t => normName(t.assigned_to) === target || normName(t.created_by) === target,
    )
  }
  const d = await getDb()
  // Match case-insensitively and ignore surrounding whitespace (mirrors normName)
  // so a user's tasks still surface if casing/padding drifts between their Entra
  // display name and the stored assigned/created name. Escape the name so any
  // regex metacharacters in it are treated literally.
  const pattern = { $regex: `^\\s*${escapeRegex(userName.trim())}\\s*$`, $options: 'i' }
  const tasks = await col(d, 'tasks').find({
    $or: [{ assigned_to: pattern }, { created_by: pattern }],
  }).sort({ created_at: -1 }).toArray()
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

export async function deleteTask(taskId: string): Promise<boolean> {
  const d = await getDb()
  await col(d, 'attachments').deleteMany({ task_id: taskId })
  const result = await col(d, 'tasks').deleteOne({ _id: taskId })
  return result.deletedCount > 0
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
