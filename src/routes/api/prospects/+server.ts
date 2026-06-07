import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getProspects } from '$lib/server/db'
import { hasAttomKey } from '$lib/server/attom'
import { PROSPECT_CENTER, PROSPECT_DEFAULTS } from '$lib/constants'

// Admin-only: the prospect pipeline. Same shape the Prospects page loads
// (prospects + map center/defaults + whether results are live ATTOM vs mock), so
// a native client can render the list and the map. Pipeline-field edits go
// through PATCH /api/prospects/[id].
export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
  return json({
    prospects: await getProspects(),
    center: PROSPECT_CENTER,
    defaults: PROSPECT_DEFAULTS,
    live: hasAttomKey(),
  })
}
