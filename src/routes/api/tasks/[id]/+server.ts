import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTask, updateTaskField, deleteTask, normName } from '$lib/server/db'

// Allowlist of task fields a client may set via PATCH. Mirrors the edit controls
// in TaskCard.svelte. Without it, `updateTaskField` does `$set:{[field]:value}`
// with a caller-supplied key — letting an owner rewrite `created_by` / `created_at`
// (reassign authorship, dodge the ownership check) or inject arbitrary fields the
// dashboard later trusts. Adding a new editable field? Add it here too.
const EDITABLE_FIELDS = new Set([
  'status', 'assigned_to', 'date',
  'quote', 'quote_type', 'quote_status', 'quote_assignee',
  'notes',
])

// A user may modify/delete a task only if they are an admin, or the task is
// theirs (assigned to OR created by them). Throws 401/403/404 otherwise.
async function assertCanModify(locals: App.Locals, taskId: string) {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const user = session.user as Record<string, unknown>
  if (user.role === 'admin') return
  const task = await getTask(taskId)
  if (!task) throw error(404)
  const name = normName((user.displayName as string) ?? (user.name as string) ?? '')
  if (normName(task.assigned_to) !== name && normName(task.created_by) !== name) throw error(403)
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  await assertCanModify(locals, params.id)
  const { field, value } = await request.json()
  if (typeof field !== 'string' || !EDITABLE_FIELDS.has(field)) {
    throw error(400, 'Field is not editable')
  }
  const ok = await updateTaskField(params.id, field, value)
  return json({ ok })
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
  await assertCanModify(locals, params.id)
  const ok = await deleteTask(params.id)
  return json({ ok })
}
