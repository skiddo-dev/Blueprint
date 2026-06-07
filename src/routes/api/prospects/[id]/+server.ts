import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { updateProspectFields } from '$lib/server/db'
import { PROSPECT_STATUSES } from '$lib/constants'
import type { Prospect, ProspectStatus } from '$lib/types'

// Admin-only: patch a prospect's user-managed pipeline fields (status / assignee
// / notes). Property data itself comes from the live source (OSM + county GIS)
// and isn't editable here.
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const body = (await request.json()) as Partial<Pick<Prospect, 'pipeline_status' | 'assignee' | 'notes'>>
  const patch: Partial<Pick<Prospect, 'pipeline_status' | 'assignee' | 'notes'>> = {}

  if (body.pipeline_status !== undefined) {
    if (!PROSPECT_STATUSES.includes(body.pipeline_status as ProspectStatus)) {
      throw error(400, `status must be one of ${PROSPECT_STATUSES.join(', ')}`)
    }
    patch.pipeline_status = body.pipeline_status
  }
  if (body.assignee !== undefined) patch.assignee = String(body.assignee).slice(0, 80)
  if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 4000)

  if (Object.keys(patch).length === 0) throw error(400, 'no editable fields supplied')

  const ok = await updateProspectFields(params.id, patch)
  if (!ok) throw error(404, 'prospect not found')
  return json({ ok: true })
}
