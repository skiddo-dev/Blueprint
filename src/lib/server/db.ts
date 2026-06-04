import { MongoClient, type Db } from 'mongodb'
import { env } from '$env/dynamic/private'
import type { Task, User } from '$lib/types'

let client: MongoClient | null = null
let db: Db | null = null

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
  const d = await getDb()
  const tasks = await col(d, 'tasks').find().sort({ created_at: -1 }).toArray()
  return tasks.map(normalizeTask)
}

export async function getTasksForUser(userName: string): Promise<Task[]> {
  const d = await getDb()
  const tasks = await col(d, 'tasks').find({
    $or: [{ assigned_to: userName }, { created_by: userName }],
  }).sort({ created_at: -1 }).toArray()
  return tasks.map(normalizeTask)
}

export async function getTasksSignature(): Promise<string> {
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
