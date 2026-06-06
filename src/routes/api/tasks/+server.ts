import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTasks, getTasksForUser, getUserEmailByName, insertTask, deleteTask } from '$lib/server/db'
import { extractStoreNumbers } from '$lib/storeNumbers'
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
    if (!filterUser) return json(await getTasks())
    return json(await getTasksForUser(await getUserEmailByName(filterUser), filterUser))
  }

  const name = (user.displayName as string) ?? (user.name as string) ?? ''
  const email = (user.email as string | undefined) ?? null
  return json(await getTasksForUser(email, name))
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const user = session.user as Record<string, unknown>
  const body = await request.json()
  // Derive store numbers server-side from the title (deterministic, can't be
  // skipped by the client) unless the client already supplied them.
  if (body && typeof body.title === 'string' && body.store_numbers == null) {
    body.store_numbers = extractStoreNumbers(body.title)
  }
  // Stamp the creator's stable identity server-side (never trust the client) so
  // ownership is keyed on login email, not a display-name label; resolve the
  // assignee to an app-user email when the name maps to one.
  const creatorEmail = (user.email as string | undefined)?.toLowerCase()
  if (creatorEmail) body.created_by_email = creatorEmail
  if (typeof body.assigned_to === 'string') {
    body.assignee_email = await getUserEmailByName(body.assigned_to)
  }
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
