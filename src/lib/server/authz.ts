import { error } from '@sveltejs/kit'
import { getTask, normName } from './db'
import type { Task } from '$lib/types'

/**
 * Whether `user` may access `task`. Admins always. Otherwise by IDENTITY — the
 * caller's login email matches the task's created_by_email or assignee_email.
 * Falls back to the legacy display-name match ONLY for tasks that carry no
 * identity yet (un-backfilled), so the migration can roll out without locking
 * anyone out; once a task has an email, identity is authoritative.
 */
export function canAccessTask(user: Record<string, unknown>, task: Task): boolean {
  if (user.role === 'admin') return true
  if (task.created_by_email || task.assignee_email) {
    const email = normName(user.email as string)
    return !!email && (email === normName(task.created_by_email) || email === normName(task.assignee_email))
  }
  const name = normName((user.displayName as string) ?? (user.name as string) ?? '')
  return normName(task.assigned_to) === name || normName(task.created_by) === name
}

/** Throw 401/403/404 unless the caller may access `taskId`. The single
 *  authorization rule shared by the task and attachment endpoints. */
export async function assertCanAccessTask(locals: App.Locals, taskId: string): Promise<void> {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role === 'admin') return
  const task = await getTask(taskId)
  if (!task) throw error(404)
  if (!canAccessTask(user, task)) throw error(403)
}
