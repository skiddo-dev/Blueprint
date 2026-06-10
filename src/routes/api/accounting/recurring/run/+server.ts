import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { runRecurring } from '$lib/server/recurring'

// Admin-only. Run the recurring engine now — the manage page's "Run now"
// button, and the only trigger in environments where the background interval
// is off (it requires a public APP_BASE_URL). Safe to mash: occurrences are
// claimed atomically.
export const POST: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
  return json(await runRecurring(new Date().toISOString().slice(0, 10)))
}
