// READ-ONLY diagnostic: how complete is assignee_email / created_by_email
// coverage on live tasks, and what a re-backfill (resolving names against the
// CURRENT users collection) would fix vs. leave. Mirrors migration 0001's
// matching. Prints aggregates only — no writes.
import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'

// Load .env (no dotenv dep) — only the keys we need.
const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const envOf = (k) => {
  const m = envText.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)\\s*$`, 'm'))
  return m ? m[1].replace(/^["']|["']$/g, '').trim() : undefined
}
const uri = envOf('MONGODB_URI') ?? envOf('MONGO_URI')
const dbName = envOf('MONGODB_DB_NAME') ?? envOf('MONGO_DB_NAME') ?? 'blueprint'
const adminEmails = (envOf('ADMIN_EMAILS') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

const norm = (s) => (s ?? '').toString().trim().toLowerCase()
const isEmpty = (v) => v == null || v === ''

const client = new MongoClient(uri)
await client.connect()
const db = client.db(dbName)
const tasks = db.collection('tasks')
const users = db.collection('users')

const userDocs = await users.find({}, { projection: { _id: 1, name: 1, role: 1 } }).toArray()
const byName = new Map()
for (const u of userDocs) {
  const n = norm(u.name)
  if (n) byName.set(n, String(u._id).toLowerCase())
}

const total = await tasks.countDocuments({})
const missingAssignee = await tasks.countDocuments({
  assignee_email: { $in: [null, ''] },
  assigned_to: { $nin: [null, '', 'Unassigned'] },
})
const missingCreator = await tasks.countDocuments({
  created_by_email: { $in: [null, ''] },
  created_by: { $nin: [null, '', 'system'] },
})

// Distinct assigned_to among tasks lacking assignee_email, with counts +
// whether the CURRENT users collection can now resolve it.
const cur = tasks.find(
  { assignee_email: { $in: [null, ''] }, assigned_to: { $nin: [null, '', 'Unassigned'] } },
  { projection: { assigned_to: 1 } },
)
const assignCounts = new Map()
for await (const t of cur) {
  const k = (t.assigned_to ?? '').toString().trim()
  assignCounts.set(k, (assignCounts.get(k) ?? 0) + 1)
}

const resolvable = []
const unresolvable = []
for (const [name, count] of [...assignCounts.entries()].sort((a, b) => b[1] - a[1])) {
  const email = byName.get(norm(name)) ?? (adminEmails.find((e) => norm(e.split('@')[0]) === norm(name)) ?? null)
  ;(email ? resolvable : unresolvable).push({ name, count, email })
}

const fixable = resolvable.reduce((n, r) => n + r.count, 0)
const stuck = unresolvable.reduce((n, r) => n + r.count, 0)

console.log('=== USERS collection (name -> email) ===')
console.log(userDocs.map((u) => `  ${u.name || '(no name)'}  ->  ${u._id}  [${u.role ?? '?'}]`).join('\n') || '  (none)')
console.log(`\nADMIN_EMAILS (no user doc required): ${adminEmails.join(', ') || '(none)'}`)

console.log('\n=== TASK COVERAGE ===')
console.log(`  total tasks:                         ${total}`)
console.log(`  missing assignee_email (assigned):   ${missingAssignee}`)
console.log(`  missing created_by_email (real user):${missingCreator}`)

console.log('\n=== assigned_to values lacking assignee_email ===')
console.log('  -- a re-backfill WOULD fill these (name resolves to a user/admin) --')
for (const r of resolvable) console.log(`     ${String(r.count).padStart(5)}  "${r.name}"  ->  ${r.email}`)
console.log('  -- would STAY empty (no matching user; keeps legacy name fallback) --')
for (const r of unresolvable) console.log(`     ${String(r.count).padStart(5)}  "${r.name}"`)
console.log(`\n  => re-backfill would set assignee_email on ${fixable} tasks; ${stuck} remain name-only.`)

await client.close()
