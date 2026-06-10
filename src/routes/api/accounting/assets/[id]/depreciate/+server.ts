import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { postDepreciation } from '$lib/server/assets'
import { requireAdmin, actorOf } from '$lib/server/authz'

// Admin-only. Post depreciation through a month: { through: 'YYYY-MM' }.
// Idempotent — already-posted months are skipped, not double-posted.
export const POST: RequestHandler = async ({ request, params, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  const through = String(body?.through ?? '').trim()
  try {
    return json(await postDepreciation(params.id, through, actorOf(user)))
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
