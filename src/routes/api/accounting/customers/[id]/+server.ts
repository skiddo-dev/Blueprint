import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { actorOf } from '$lib/server/authz'
import { updateCustomer } from '$lib/server/invoicing'

// Admin-only. Edit a customer's name/email (a name change propagates to their
// invoices' denormalized customer_name).
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const body = await request.json().catch(() => null)
  if (!body || (body.name === undefined && body.email === undefined)) {
    throw error(400, 'Expected { name?, email? }')
  }
  if (body.name !== undefined && !String(body.name).trim()) throw error(400, 'Name cannot be empty')

  const ok = await updateCustomer(params.id, {
    name: body.name !== undefined ? String(body.name) : undefined,
    email: body.email !== undefined ? String(body.email) : undefined,
  }, actorOf(user))
  if (!ok) throw error(404, 'Customer not found')
  return json({ ok: true })
}
