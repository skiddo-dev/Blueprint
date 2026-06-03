import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getUsers, upsertUser, deleteUser } from '$lib/server/db'

export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const users = await getUsers()
  return json(users)
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
  const { email, role, name } = await request.json()
  if (!email) throw error(400, 'email required')
  await upsertUser(email, role ?? 'pm', name ?? '')
  return json({ ok: true })
}

export const DELETE: RequestHandler = async ({ url, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
  const email = url.searchParams.get('email')
  if (!email) throw error(400, 'email required')
  const ok = await deleteUser(email)
  return json({ ok })
}
