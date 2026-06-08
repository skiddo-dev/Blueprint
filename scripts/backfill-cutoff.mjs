// One-off: remove cards created from emails flagged ON/BEFORE the sync cutoff.
// Mirrors src/lib/server/backfillCutoff.ts (the tested admin endpoint) so it can
// be run directly against prod Mongo, the same way the team runs other one-off
// maintenance (see provision-bob-sowles.mjs). Reads .env directly.
//
// Flag-time proxy: Graph has no reliable "date flagged" for a plain flag, so a
// card's source-email receivedDateTime is used (email_date if stored, else a
// Graph lookup by exchange_id/source_mailbox). Removable iff that date < cutoff.
// Cards whose date can't be determined are LEFT untouched.
//
//   node scripts/backfill-cutoff.mjs            # DRY-RUN (no deletes)
//   node scripts/backfill-cutoff.mjs --apply    # permanently delete
import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const envOf = (k) => {
  const m = envText.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)\\s*$`, 'm'))
  return m ? m[1].replace(/^["']|["']$/g, '').trim() : undefined
}

const CUTOFF = envOf('EMAIL_SYNC_CUTOFF') ?? '2026-06-08T00:00:00-04:00' // EMAIL_SYNC_CUTOFF_DEFAULT
const cutoffMs = Date.parse(CUTOFF)
const uri = envOf('MONGODB_URI') ?? envOf('MONGO_URI')
const dbName = envOf('MONGODB_DB_NAME') ?? envOf('MONGO_DB_NAME') ?? 'blueprint'

const flaggedBeforeCutoff = (iso) => {
  const t = Date.parse(iso ?? '')
  return Number.isNaN(t) ? false : t < cutoffMs
}

// ── Graph (app-only) — used to date cards that have no stored email_date ──────
async function getGraphToken() {
  const tenant = envOf('AZURE_TENANT_ID')
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: envOf('AZURE_CLIENT_ID') ?? '',
      client_secret: envOf('AZURE_CLIENT_SECRET') ?? '',
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Graph auth failed: ${data.error_description ?? data.error}`)
  return data.access_token
}
async function fetchMessageReceivedDate(mailbox, id, token) {
  if (!mailbox || !id) return null
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(id)}?$select=receivedDateTime`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  const d = await r.json()
  return d.receivedDateTime ?? null
}

// ── Run ──────────────────────────────────────────────────────────────────────
const client = new MongoClient(uri)
await client.connect()
const db = client.db(dbName)
const tasks = db.collection('tasks')
const attachments = db.collection('attachments')

const scanned = await tasks.countDocuments({})
const synced = await tasks
  .find({ exchange_id: { $nin: [null, ''] } }, { projection: { _id: 1, title: 1, email_date: 1, exchange_id: 1, source_mailbox: 1 } })
  .toArray()

console.log(`MODE: ${APPLY ? 'APPLY (deleting)' : 'DRY-RUN (no deletes)'}   DB: ${dbName}`)
console.log(`CUTOFF: ${CUTOFF}  →  remove cards flagged (received) before this`)
console.log(`Tasks total: ${scanned}   Email-synced (exchange_id): ${synced.length}\n`)

let token = null
if (synced.some((t) => !t.email_date)) {
  try {
    token = await getGraphToken()
  } catch (e) {
    console.error(`🔒 ${e.message}\nNothing deleted — fix Microsoft 365 auth and re-run.`)
    await client.close()
    process.exit(1)
  }
}

const remove = []
const unverifiable = []
let kept = 0
for (const t of synced) {
  let date = t.email_date ?? null
  if (!date && token && t.source_mailbox && t.exchange_id) {
    date = await fetchMessageReceivedDate(t.source_mailbox, t.exchange_id, token)
  }
  if (!date) { unverifiable.push(t); continue }
  if (flaggedBeforeCutoff(date)) remove.push({ ...t, _date: date })
  else kept++
}

console.log(`→ remove: ${remove.length}   keep: ${kept}   unverifiable (left alone): ${unverifiable.length}\n`)
for (const t of remove) {
  console.log(`  ✗ ${t._date}  ${(t.title ?? '(untitled)').slice(0, 70)}  [${t.source_mailbox ?? '?'}]`)
}
if (unverifiable.length) {
  console.log(`\n  (${unverifiable.length} synced card(s) could not be dated — kept):`)
  for (const t of unverifiable.slice(0, 20)) console.log(`  ? ${(t.title ?? '(untitled)').slice(0, 70)}  [${t.source_mailbox ?? 'no mailbox'}]`)
}

if (APPLY) {
  let deleted = 0
  for (const t of remove) {
    await attachments.deleteMany({ task_id: t._id })
    const res = await tasks.deleteOne({ _id: t._id })
    deleted += res.deletedCount
  }
  console.log(`\nWROTE: permanently deleted ${deleted} card(s) (+ their attachments).`)
} else {
  console.log(`\n(dry-run) re-run with --apply to permanently delete the ${remove.length} card(s) above.`)
}

await client.close()
