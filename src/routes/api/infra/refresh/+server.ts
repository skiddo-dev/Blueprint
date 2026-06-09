import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { refreshInfraSnapshot } from '$lib/server/infra'

// Admin-only. Busts the cache and re-fetches every provider's live billing data,
// returning the fresh snapshot. The /infra page's "Refresh" button POSTs here.
export const POST: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
  return json(await refreshInfraSnapshot())
}
