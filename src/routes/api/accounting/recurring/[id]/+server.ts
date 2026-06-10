import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { setTemplateActive, deleteTemplate } from '$lib/server/recurring'

// Admin-only. PATCH pauses/resumes a template; DELETE removes it (already-
// posted documents are untouched — they're real books entries).
async function requireAdmin(locals: App.Locals) {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
}

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  if (!body || typeof body.active !== 'boolean') throw error(400, 'Expected { active: boolean }')
  if (!(await setTemplateActive(params.id, body.active))) throw error(404, 'No such template')
  return json({ ok: true })
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
  await requireAdmin(locals)
  if (!(await deleteTemplate(params.id))) throw error(404, 'No such template')
  return json({ ok: true })
}
