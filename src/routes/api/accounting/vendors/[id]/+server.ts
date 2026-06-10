import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { actorOf } from '$lib/server/authz'
import { updateVendor } from '$lib/server/payables'

// Admin-only. Edit a vendor's name/email (a name change propagates to their
// bills' denormalized vendor_name).
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const body = await request.json().catch(() => null)
  if (!body || (body.name === undefined && body.email === undefined && body.is_1099 === undefined && body.tax_id === undefined)) {
    throw error(400, 'Expected { name?, email?, is_1099?, tax_id? }')
  }
  if (body.name !== undefined && !String(body.name).trim()) throw error(400, 'Name cannot be empty')

  const ok = await updateVendor(params.id, {
    name: body.name !== undefined ? String(body.name) : undefined,
    email: body.email !== undefined ? String(body.email) : undefined,
    is_1099: body.is_1099 !== undefined ? Boolean(body.is_1099) : undefined,
    tax_id: body.tax_id !== undefined ? String(body.tax_id) : undefined,
  }, actorOf(user))
  if (!ok) throw error(404, 'Vendor not found')
  return json({ ok: true })
}
