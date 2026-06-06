import { error } from '@sveltejs/kit'
import { getTask, normName } from './db'

/**
 * Throw 401/403/404 unless the caller may access `taskId` — i.e. they are an
 * admin, or the task is theirs (assigned to OR created by them). This is the
 * single authorization rule shared by the task and attachment endpoints.
 *
 * Ownership is matched by display name today (mirrors /api/tasks/[id]); this
 * function is the one choke point to switch to identity (email/oid) later.
 */
export async function assertCanAccessTask(locals: App.Locals, taskId: string): Promise<void> {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role === 'admin') return
  const task = await getTask(taskId)
  if (!task) throw error(404)
  const name = normName((user.displayName as string) ?? (user.name as string) ?? '')
  if (normName(task.assigned_to) !== name && normName(task.created_by) !== name) {
    throw error(403)
  }
}
