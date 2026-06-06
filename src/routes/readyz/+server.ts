import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { pingDb } from '$lib/server/db'

// Readiness: required dependencies (Mongo) are reachable. Returns 503 when not,
// so a load balancer / Container Apps readiness probe holds traffic until the DB
// is back instead of routing requests that will 500.
export const GET: RequestHandler = async () => {
  const ok = await pingDb()
  return json({ status: ok ? 'ok' : 'unavailable', db: ok }, { status: ok ? 200 : 503 })
}
