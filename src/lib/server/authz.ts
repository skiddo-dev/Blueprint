import { error } from '@sveltejs/kit'
import { getTask } from './db'
import { isOwnedBy } from '$lib/ownership'
import type { Task } from '$lib/types'

/**
 * Whether `user` may access `task`. Admins always. Otherwise by IDENTITY — the
 * caller's login email matches the task's created_by_email or assignee_email.
 * Falls back to the legacy display-name match ONLY for tasks that carry no
 * identity yet (un-backfilled), so the migration can roll out without locking
 * anyone out; once a task has an email, identity is authoritative. The
 * ownership rule itself lives in $lib/ownership so the board's "My Work" filter
 * shares it (they drifted before, which emptied "My Work").
 */
export function canAccessTask(user: Record<string, unknown>, task: Task): boolean {
  if (user.role === 'admin') return true
  return isOwnedBy(task, {
    email: user.email as string,
    name: (user.displayName as string) ?? (user.name as string) ?? '',
  })
}

/** Throw 401/403 unless the caller is a signed-in admin; returns the session
 *  user. The guard for the /api/accounting surface (pages get the same rule
 *  from the hooks.server.ts path guard). */
export async function requireAdmin(locals: App.Locals): Promise<Record<string, unknown>> {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
  return user
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
