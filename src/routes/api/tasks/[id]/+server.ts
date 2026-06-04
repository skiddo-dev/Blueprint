import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { updateTaskField, deleteTask } from '$lib/server/db'

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const { field, value } = await request.json()
  if (!field) throw error(400, 'Missing field')
  const ok = await updateTaskField(params.id, field, value)
  return json({ ok })
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const ok = await deleteTask(params.id)
  return json({ ok })
}
