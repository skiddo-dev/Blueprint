// Boot smoke: start the PRODUCTION build (`node build`) against a real Mongo
// and probe the endpoints whose failure modes have actually shipped:
//
//   /healthz       — liveness; pure process-up check.
//   /readyz        — indexes + migrations. The #135 getDb deadlock HUNG here
//                    (while /healthz kept answering), so this probe has a hard
//                    deadline rather than waiting forever.
//   /login         — the human sign-in page.
//   /auth/signin   — the Auth.js path the 2026-06-08 outage 500'd while both
//                    health probes stayed green. Anything < 500 passes: without
//                    real Entra creds the exact status varies, but the bug
//                    class this guards against is a 5xx from the hooks chain.
//
// Usage: npm run build && MONGODB_URI=mongodb://127.0.0.1:27017/ npm run test:boot
import { spawn } from 'node:child_process'

const PORT = process.env.SMOKE_PORT ?? '3999'
const BASE = `http://127.0.0.1:${PORT}`
const READY_DEADLINE_MS = 45_000

const server = spawn('node', ['build'], {
  env: {
    ...process.env,
    PORT,
    MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/',
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ?? `blueprint_boot_smoke_${Date.now()}`,
    ORIGIN: BASE,
    AUTH_SECRET: process.env.AUTH_SECRET ?? 'boot-smoke-secret',
    AUTH_TRUST_HOST: 'true',
    // /readyz includes a config-PRESENCE check (missingProdEnv) — every
    // REQUIRED_PROD_ENV key must be non-blank or it 503s forever. Obviously-fake
    // values are fine: the smoke never calls Entra or OpenAI, it only needs the
    // readiness gate to evaluate the same way a correctly-configured prod
    // instance would. (NODE_ENV stays unset, so requireInProd never throws.)
    AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID ?? 'boot-smoke-dummy',
    AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET ?? 'boot-smoke-dummy',
    AZURE_TENANT_ID: process.env.AZURE_TENANT_ID ?? 'boot-smoke-dummy',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? 'boot-smoke-dummy',
    ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? 'boot-smoke@local',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
})
let exited = false
server.on('exit', (code) => {
  exited = true
  if (process.exitCode === undefined) {
    console.error(`boot-smoke: server exited early (code ${code})`)
    process.exitCode = 1
  }
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function status(path) {
  const res = await fetch(BASE + path, { redirect: 'manual', signal: AbortSignal.timeout(8_000) })
  return res.status
}

/** Poll until `path` returns `want`; a deadline miss is a hard failure (a hung
 *  /readyz is the deadlock signature, not a slow boot). */
async function waitFor(path, want, deadlineMs) {
  const deadline = Date.now() + deadlineMs
  let last = 'no response'
  while (Date.now() < deadline) {
    if (exited) throw new Error('server process died while waiting')
    try {
      const got = await status(path)
      if (got === want) {
        console.log(`boot-smoke: ${path} → ${got} ✓`)
        return
      }
      last = String(got)
    } catch (e) {
      last = e?.cause?.code ?? e?.name ?? String(e)
    }
    await sleep(500)
  }
  throw new Error(`${path} never returned ${want} within ${deadlineMs}ms (last: ${last})`)
}

try {
  await waitFor('/healthz', 200, READY_DEADLINE_MS)
  await waitFor('/readyz', 200, READY_DEADLINE_MS)
  for (const path of ['/login', '/auth/signin']) {
    const got = await status(path)
    if (got >= 500) throw new Error(`${path} returned ${got} — sign-in path is 5xx-ing`)
    console.log(`boot-smoke: ${path} → ${got} ✓ (< 500)`)
  }
  console.log('boot-smoke: PASS')
  process.exitCode = 0
} catch (e) {
  console.error(`boot-smoke: FAIL — ${e.message ?? e}`)
  process.exitCode = 1
} finally {
  server.kill('SIGTERM')
  // The spawned-child handle (and any keep-alive sockets) can hold the event
  // loop open past the verdict; don't let the smoke itself hang after it has
  // already decided pass/fail.
  setTimeout(() => process.exit(process.exitCode ?? 1), 5_000).unref()
}
