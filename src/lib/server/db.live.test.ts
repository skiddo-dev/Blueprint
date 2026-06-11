import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MongoClient } from 'mongodb'
import { cents } from '$lib/money'

// Live-Mongo integration suite — run via `npm run test:live` with
// LIVE_MONGO_URI pointing at a real (throwaway) mongod; a plain `npm test`
// skips the whole describe, so the ordinary unit run stays hermetic.
//
// ⚠️ Always invoke through scripts/test-live.mjs, never `vitest run` directly:
// $lib/server/db reads its config from a $env/dynamic/private SNAPSHOT taken at
// vite boot, so MONGODB_URI/MONGODB_DB_NAME must be process-level env on the
// vitest process (the wrapper sets them) — without that, the suite would fall
// back to localhost:27017/blueprint, a real dev database.
//
// CI runs this against a STANDALONE service container, which is deliberate:
// standalone is the harder path (no replica set), so withTxn's no-transaction
// fallback gets exercised, and the cold connect runs the exact ensureIndexes →
// publish → runMigrations ordering whose regression (#135) deadlocked a deploy.
// Mocked drivers can't catch any of this.
const LIVE = process.env.LIVE_MONGO_URI
const DB_NAME = process.env.MONGODB_DB_NAME ?? ''

describe.skipIf(!LIVE)('live Mongo integration (LIVE_MONGO_URI)', () => {
  let dbmod: typeof import('./db')
  let acct: typeof import('./accounting')
  let txnmod: typeof import('./txn')

  beforeAll(async () => {
    // The wrapper always supplies a throwaway name; a bare/unique-less name
    // here means someone bypassed it and we might be aimed at real data.
    expect(DB_NAME, 'run via `npm run test:live`, not vitest directly').toMatch(/^blueprint_live/)
    // Drop any leftover db up front so the suite is a true cold start even if
    // a previous run aborted before its afterAll.
    const raw = new MongoClient(LIVE!)
    await raw.db(DB_NAME).dropDatabase()
    await raw.close()
    dbmod = await import('./db')
    acct = await import('./accounting')
    txnmod = await import('./txn')
  })

  afterAll(async () => {
    if (!dbmod) return
    const client = await dbmod.getClient()
    await client.db(DB_NAME).dropDatabase()
    await client.close()
  })

  // 20s, not the default 5s: a cold connect legitimately builds every index and
  // runs every migration. A hang past that is the #135 deadlock shape
  // (runMigrations re-entering getDb before client/db are published).
  it('cold connect completes: indexes, migrations, no re-entrancy deadlock', { timeout: 20_000 }, async () => {
    const d = await dbmod.getDb()
    // Proves the app honored the wrapper's env — i.e. we are on the throwaway
    // db, not the localhost fallback. Everything below relies on this.
    expect(d.databaseName).toBe(DB_NAME)
    await expect(dbmod.migrationsApplied()).resolves.toBe(true)
    await expect(dbmod.pingDb()).resolves.toBe(true)
  })

  it('integrity constraints exist as real unique indexes', async () => {
    const d = await dbmod.getDb()
    const journalIdx = await d.collection('journalEntries').indexes()
    expect(
      journalIdx.some((i) => i.unique && i.key.source === 1 && i.key.source_ref === 1),
    ).toBe(true)
    for (const coll of ['invoices', 'bills', 'purchaseOrders']) {
      const idx = await d.collection(coll).indexes()
      expect(
        idx.some((i) => i.unique && i.key.year === 1 && i.key.number === 1),
        `${coll} is missing its unique (year, number) index`,
      ).toBe(true)
    }
  })

  it('migrations seeded the chart of accounts', async () => {
    const d = await dbmod.getDb()
    expect(await d.collection('accounts').countDocuments()).toBeGreaterThan(0)
  })

  it('withTxn commits writes on a standalone server (fallback path)', async () => {
    const d = await dbmod.getDb()
    const out = await txnmod.withTxn(async (session) => {
      await d.collection('live_txn_probe').insertOne({ probe: 1 }, { session })
      return 'committed'
    })
    expect(out).toBe('committed')
    expect(await d.collection('live_txn_probe').countDocuments()).toBe(1)
  })

  it('postEntry idempotency holds against the real unique index', async () => {
    const input = {
      date: '2026-06-11',
      memo: 'live idempotency probe',
      source: 'manual' as const,
      source_ref: 'live-test-entry-1',
      lines: [
        { account_id: '1000', debit: cents(5_000), credit: cents(0) },
        { account_id: '4000', debit: cents(0), credit: cents(5_000) },
      ],
    }
    const first = await acct.postEntry(input)
    const second = await acct.postEntry(input)
    expect(second._id).toBe(first._id)
    const d = await dbmod.getDb()
    expect(
      await d.collection('journalEntries').countDocuments({ source_ref: input.source_ref }),
    ).toBe(1)
  })
})
