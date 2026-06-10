import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { setTemplateActive, deleteTemplate } from '$lib/server/recurring'
import { requireAdmin } from '$lib/server/authz'

// Admin-only. PATCH pauses/resumes a template; DELETE removes it (already-
// posted documents are untouched — they're real books entries).
const actorOf = (user: Record<string, unknown>) => (user.email as string) ?? (user.displayName as string)

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  if (!body || typeof body.active !== 'boolean') throw error(400, 'Expected { active: boolean }')
  if (!(await setTemplateActive(params.id, body.active, actorOf(user)))) throw error(404, 'No such template')
  return json({ ok: true })
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = await requireAdmin(locals)
  if (!(await deleteTemplate(params.id, actorOf(user)))) throw error(404, 'No such template')
  return json({ ok: true })
}
