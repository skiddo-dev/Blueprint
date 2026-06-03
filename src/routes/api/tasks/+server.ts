import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTasks, getTasksForUser, insertTask, deleteTask } from '$lib/server/db'
import type { TaskStatus } from '$lib/types'

export const GET: RequestHandler = async ({ locals, url }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const user = session.user as Record<string, unknown>

  const filterUser = url.searchParams.get('user')
  let tasks
  if (filterUser) {
    tasks = await getTasksForUser(filterUser)
  } else if (user.role === 'admin') {
    tasks = await getTasks()
  } else {
    const name = (user.displayName as string) ?? (user.name as string) ?? ''
    tasks = await getTasksForUser(name)
  }
  return json(tasks)
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
