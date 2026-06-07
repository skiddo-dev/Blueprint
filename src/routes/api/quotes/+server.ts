import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getQuotes } from '$lib/server/db'

// Admin-only: the tracked-quote log. Same data the dashboard/quotes page loads
// server-side, exposed as JSON so native clients can read it. Read-only — status
// changes go through POST /api/quotes/[id]/status. Mirrors the page guard in
// hooks.server.ts (quotes is an admin route).
export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
  return json(await getQuotes())
}
