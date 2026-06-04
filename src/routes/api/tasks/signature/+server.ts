import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTasksSignature } from '$lib/server/db'

export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const sig = await getTasksSignature()
  return json({ sig })
}
