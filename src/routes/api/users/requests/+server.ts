import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { listPendingAccessRequests, resolveAccessRequest, upsertUser } from '$lib/server/db'

// Admin-only management of self-serve access requests (the "Access Pending"
// screen records them; this lists + resolves them). Same admin gate as
// /api/users.
async function requireAdmin(locals: App.Locals) {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
}

export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals)
  return json(await listPendingAccessRequests())
}

export const POST: RequestHandler = async ({ request, locals }) => {
  await requireAdmin(locals)
  const { email, action, role, name } = await request.json()
  if (typeof email !== 'string' || !email.trim()) throw error(400, 'email required')
  if (action !== 'approve' && action !== 'deny') throw error(400, 'action must be approve or deny')

  if (action === 'approve') {
    // Provision the user (defaults to pm — an admin can promote later in User
    // Access), then mark the request resolved so it leaves the pending list.
    await upsertUser(email, role === 'admin' ? 'admin' : 'pm', typeof name === 'string' ? name : '')
    await resolveAccessRequest(email, 'approved')
  } else {
    await resolveAccessRequest(email, 'denied')
  }
  return json({ ok: true })
}
