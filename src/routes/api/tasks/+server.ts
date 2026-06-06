import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTasks, getTasksForUser, getUserEmailByName, insertTask, deleteTask } from '$lib/server/db'
import { extractStoreNumbers } from '$lib/storeNumbers'
import { newTaskSchema, readValidated } from '$lib/server/validation'
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
  const input = await readValidated(request, newTaskSchema)
  // Store numbers are derived server-side from the title (deterministic) unless
  // the client supplied them.
  const store_numbers = input.store_numbers ?? extractStoreNumbers(input.title)
  // Stamp the creator's stable identity server-side (never trusted from the
  // client); resolve the assignee to an app-user email when the name maps to one.
  const created_by_email = (user.email as string | undefined)?.toLowerCase() ?? null
  const assignee_email = input.assigned_to ? await getUserEmailByName(input.assigned_to) : null
  const id = await insertTask({ ...input, store_numbers, created_by_email, assignee_email })
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
