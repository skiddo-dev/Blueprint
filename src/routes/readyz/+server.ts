import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { pingDb, migrationsApplied } from '$lib/server/db'
import { missingProdEnv } from '$lib/server/config'

// Readiness: can THIS instance actually serve? Checks Mongo connectivity,
// required configuration, and that data migrations have been applied. Returns 503
// otherwise so a readiness probe / load balancer holds traffic until it's ready.
//
// Deliberately does NOT call Graph/OpenAI: readiness must reflect this instance,
// not third-party uptime — a transient OpenAI 429 must never pull every replica
// out of rotation. Their credentials being *present* is covered by the config
// check (and enforced at startup in hooks.server.ts).
export const GET: RequestHandler = async () => {
  const [db, migrations] = await Promise.all([pingDb(), migrationsApplied()])
  const config = missingProdEnv().length === 0
  const ok = db && config && migrations
  return json(
    { status: ok ? 'ok' : 'unavailable', db, config, migrations },
    { status: ok ? 200 : 503 },
  )
}
