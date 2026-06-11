// Wrapper for the live-Mongo suite (src/lib/server/db.live.test.ts).
//
// Why this exists: under vitest, `$env/dynamic/private` is NOT dynamic — the
// SvelteKit plugin bakes a snapshot of the env into the virtual module when
// the vite server boots (create_dynamic_module inlines dev values in serve
// mode). A test that mutates process.env in beforeAll changes nothing that
// $lib/server/db can see; left alone, the suite silently connects to the
// fallback localhost:27017/blueprint — somebody's REAL dev database. So the
// connection target must be real process env on the vitest process itself,
// which is exactly what this wrapper sets before exec'ing vitest.
import { spawnSync } from 'node:child_process'

const uri = process.env.LIVE_MONGO_URI
if (!uri) {
  console.error('test-live: set LIVE_MONGO_URI to a THROWAWAY mongod (e.g. mongodb://127.0.0.1:27017/)')
  process.exit(1)
}
// Unique per run so the suite always exercises a true cold start (index builds,
// migrations, chart-of-accounts seed) instead of validating leftovers.
const dbName = process.env.MONGODB_DB_NAME ?? `blueprint_live_${Date.now()}`

const res = spawnSync('npx', ['vitest', 'run', 'src/lib/server/db.live.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, MONGODB_URI: uri, MONGODB_DB_NAME: dbName },
})
process.exit(res.status ?? 1)
