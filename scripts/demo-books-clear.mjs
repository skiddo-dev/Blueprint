#!/usr/bin/env node
// Clear the DEMO books seeded by scripts/demo-books-seed.mjs.
//
// This wipes the accounting TRANSACTION collections wholesale (journal,
// invoices, bills, payments, parties, reconciliations, numbering counters,
// period lock). That is only safe while the books contain demo data only —
// which is the contract of the seed script (it refuses to run on non-empty
// books). The chart of accounts (`accounts`) is left untouched.
//
// DRY RUN by default: prints what would be deleted. Pass --yes to delete.
//
// Usage:
//   MONGODB_URI=... [MONGO_DB_NAME=blueprint] node scripts/demo-books-clear.mjs [--yes]
// (Reads .env in the repo root as a fallback for MONGODB_URI / MONGO_DB_NAME.)

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MongoClient } from 'mongodb'

const ROOT = resolve(import.meta.dirname, '..')

function envFromDotenv(name) {
  try {
    const line = readFileSync(resolve(ROOT, '.env'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`))
    return line ? line.slice(name.length + 1).trim() : undefined
  } catch {
    return undefined
  }
}

const URI = process.env.MONGODB_URI ?? envFromDotenv('MONGODB_URI')
const DB = process.env.MONGODB_DB_NAME ?? process.env.MONGO_DB_NAME ?? envFromDotenv('MONGO_DB_NAME') ?? 'blueprint'
if (!URI) {
  console.error('MONGODB_URI is not set (env or .env).')
  process.exit(1)
}
const APPLY = process.argv.includes('--yes')

// Transaction collections + the meta/counter state that goes with them.
const COLLECTIONS = [
  'journalEntries', 'invoices', 'bills', 'payments', 'billPayments',
  'creditMemos', 'vendorCredits', 'recurringTemplates',
  'customers', 'vendors', 'reconciliations', 'counters',
]

const client = new MongoClient(URI)
await client.connect()
const db = client.db(DB)

console.log(`${APPLY ? 'CLEARING' : 'DRY RUN'} — database "${DB}"\n`)

let total = 0
for (const name of COLLECTIONS) {
  const coll = db.collection(name)
  const count = await coll.countDocuments({})
  total += count
  if (count === 0) { console.log(`  ${name}: empty`); continue }
  const demoTagged = await coll.countDocuments({ $or: [{ memo: /\[DEMO\]/ }, { _id: /^(invoice|bill):/ }] }).catch(() => 0)
  console.log(`  ${name}: ${count} document(s)${demoTagged ? ` (${demoTagged} carry the [DEMO] tag / counter ids)` : ''}`)
  if (APPLY) await coll.deleteMany({})
}

// The period lock lives on the shared `meta` collection — remove just that key.
const lock = await db.collection('meta').findOne({ _id: 'accounting_lock' })
if (lock) {
  console.log(`  meta.accounting_lock: locked through ${lock.closed_through ?? '?'}`)
  if (APPLY) await db.collection('meta').deleteOne({ _id: 'accounting_lock' })
} else {
  console.log('  meta.accounting_lock: not set')
}

await client.close()

if (!APPLY) {
  console.log(`\nDry run only — ${total} document(s) would be deleted. Re-run with --yes to clear.`)
} else {
  console.log(`\nCleared ${total} document(s). The chart of accounts was left untouched; the books are empty.`)
}
