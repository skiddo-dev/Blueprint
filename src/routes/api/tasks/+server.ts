import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTasks, getTasksForUser, insertTask, deleteTask } from '$lib/server/db'
import type { TaskStatus } from '$lib/types'

export const GET: RequestHandler = async ({ locals, url }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const user = session.user as Record<string, unknown>

  // Only admins may view other users' tasks via ?user=. Non-admins are always
  // scoped to their own tasks (assigned to OR created by them), regardless of
  // any ?user= param they try to pass.
  if (user.role === 'admin') {
    const filterUser = url.searchParams.get('user')
    const tasks = filterUser ? await getTasksForUser(filterUser) : await getTasks()
    return json(tasks)
  }

  const name = (user.displayName as string) ?? (user.name as string) ?? ''
  return json(await getTasksForUser(name))
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const body = await request.json()
  const id = await insertTask(body)
  const tasks = await getTasks()
  const created = tasks.find(t => t._id === id)
  return json(created, { status: 201 })
}

export const DELETE: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const user = session.user as Record<string, unknown>
  if (user.role !== 'admin') throw error(403)
  const all = await getTasks()
  for (const t of all) await deleteTask(t._id)
  return json({ ok: true })
}
