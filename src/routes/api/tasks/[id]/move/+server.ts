import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTask, patchTask } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import { moveTaskSchema, readValidated } from '$lib/server/validation'

// Persist a drag-drop in one write: the card's target column and its fractional
// rank between its new neighbours (computed client-side via $lib/rank — both
// ends already know the neighbouring ranks, and the poll reconciles races).
// Same-column reorders arrive here too, with an unchanged status.
export const POST: RequestHandler = async ({ params, request, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const { status, rank } = await readValidated(request, moveTaskSchema)
  const current = await getTask(params.id)
  if (!current) throw error(404, 'Task not found')
  const set: Record<string, unknown> = { rank }
  if (current.status !== status) {
    set.status = status
    set.status_changed_at = new Date().toISOString() // column change → restart the aging clock
  }
  // Dragging an archived card (the board's Archived view) restores it.
  const unset = current.archived_at ? ['archived_at'] : undefined
  const ok = await patchTask(params.id, set, undefined, unset)
  return json({ ok })
}
