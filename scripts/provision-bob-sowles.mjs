// One-time: provision Bob Sowles (dropdown name "Bob" -> robert@ravesinc.com)
// and backfill owner-email identity onto his existing tasks, so his "My Work"
// is keyed on identity like everyone else (the same fix applied to Ben).
//
//   - users doc: { _id: robert@ravesinc.com, name: "Bob", role: "pm" } — name is
//     the DROPDOWN value ("Bob"), not his full name, so getUserEmailByName("Bob")
//     resolves and future assignments stamp assignee_email automatically.
//   - assignee_email <- robert@ravesinc.com where assigned_to == "Bob" & empty
//   - created_by_email <- robert@ravesinc.com where created_by == "Bob" & empty
//
// Mirrors migration 0001's per-field logic; idempotent (only fills empties).
// Dry-run by default — pass --apply to write.
import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const EMAIL = 'robert@ravesinc.com'
const NAME = 'Bob'
const ROLE = 'pm'
const bobName = { $regex: '^\\s*bob\\s*$', $options: 'i' }
const empty = { $in: [null, ''] }

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const envOf = (k) => {
  const m = envText.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)\\s*$`, 'm'))
  return m ? m[1].replace(/^["']|["']$/g, '').trim() : undefined
}
const uri = envOf('MONGODB_URI') ?? envOf('MONGO_URI')
const dbName = envOf('MONGODB_DB_NAME') ?? envOf('MONGO_DB_NAME') ?? 'blueprint'

const client = new MongoClient(uri)
await client.connect()
const db = client.db(dbName)
const tasks = db.collection('tasks')
const users = db.collection('users')

const existing = await users.findOne({ _id: EMAIL })
const nAssignee = await tasks.countDocuments({ assigned_to: bobName, assignee_email: empty })
const nCreator = await tasks.countDocuments({ created_by: bobName, created_by_email: empty })

console.log(`MODE: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}  DB: ${dbName}`)
console.log(`user ${EMAIL}: ${existing ? `exists (name=${existing.name}, role=${existing.role})` : 'will be created'} -> set name="${NAME}", role="${ROLE}"`)
console.log(`assignee_email to stamp (assigned_to=="Bob", empty): ${nAssignee}`)
console.log(`created_by_email to stamp (created_by=="Bob", empty): ${nCreator}`)

if (APPLY) {
  const now = new Date().toISOString()
  const u = await users.updateOne(
    { _id: EMAIL },
    { $set: { role: ROLE, name: NAME, updated_at: now }, $setOnInsert: { firstSeenAt: now } },
    { upsert: true },
  )
  const a = await tasks.updateMany({ assigned_to: bobName, assignee_email: empty }, { $set: { assignee_email: EMAIL } })
  const c = await tasks.updateMany({ created_by: bobName, created_by_email: empty }, { $set: { created_by_email: EMAIL } })
  console.log(`\nWROTE: user upserted=${u.upsertedCount} modified=${u.modifiedCount}; assignee stamped=${a.modifiedCount}; creator stamped=${c.modifiedCount}`)
  console.log(`Bob "My Work" now owns ${await tasks.countDocuments({ $or: [{ assignee_email: EMAIL }, { created_by_email: EMAIL }] })} tasks.`)
} else {
  console.log('\n(dry-run) re-run with --apply to write.')
}

await client.close()
