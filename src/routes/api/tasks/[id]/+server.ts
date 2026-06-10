import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { updateTaskField, patchTask, deleteTask, getUserEmailByName, getTask, resolveCoAssignees, topRankForStatus } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import { validateTaskFieldValue } from '$lib/server/validation'
import { statusOnAssign } from '$lib/taskRules'

// Allowlist of task fields a client may set via PATCH. Mirrors the edit controls
// in TaskCard.svelte. Without it, `updateTaskField` does `$set:{[field]:value}`
// with a caller-supplied key — letting an owner rewrite `created_by` / `created_at`
// (reassign authorship, dodge the ownership check) or inject arbitrary fields the
// dashboard later trusts. Adding a new editable field? Add it here too.
const EDITABLE_FIELDS = new Set([
  'status', 'assigned_to', 'co_assignees', 'date',
  'quote', 'quote_type', 'quote_status', 'quote_assignee',
  'notes',
])

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const { field, value } = await request.json()
  if (typeof field !== 'string' || !EDITABLE_FIELDS.has(field)) {
    throw error(400, 'Field is not editable')
  }
  const checked = validateTaskFieldValue(field, value)
  // Reassigning on the board must also refresh the assignee's identity so the new
  // assignee gains ownership (and the previous one loses it).
  if (field === 'assigned_to') {
    const assignee_email = typeof checked === 'string' ? await getUserEmailByName(checked) : null
    const set: Record<string, unknown> = { assigned_to: checked, assignee_email }
    // Assigning work starts it: a "To Do" task auto-advances to "In Progress".
    const current = await getTask(params.id)
    const nextStatus = current ? statusOnAssign(current.status, checked) : null
    if (nextStatus) {
      set.status = nextStatus
      set.status_changed_at = new Date().toISOString() // column change → restart the aging clock
      set.rank = await topRankForStatus(nextStatus)    // auto-started work surfaces at the top of its new column
    }
    // Promoting a co-assignee to primary removes them from the co-list (one
    // person shouldn't hold both slots).
    if (current?.co_assignees?.length) {
      Object.assign(set, await resolveCoAssignees(current.co_assignees, checked as string))
    }
    const ok = await patchTask(params.id, set)
    return json({ ok })
  }
  // Co-assignees travel with their resolved identities so the new people gain
  // ownership ("My Work") and dropped ones lose it — same rule as assigned_to.
  if (field === 'co_assignees') {
    const current = await getTask(params.id)
    const resolved = await resolveCoAssignees(checked as string[], current?.assigned_to)
    const ok = await patchTask(params.id, { ...resolved })
    return json({ ok })
  }
  // A status edit (the card's dropdown — the drag path is POST [id]/move) is a
  // column move: land the card at the top of its new column, and stamp
  // status_changed_at (the aging clock) only when the column actually changes,
  // so re-selecting the same status doesn't make a stale card look fresh.
  if (field === 'status') {
    const current = await getTask(params.id)
    const set: Record<string, unknown> = { status: checked }
    if (current && current.status !== checked) {
      set.status_changed_at = new Date().toISOString()
      set.rank = await topRankForStatus(checked as string)
    }
    const ok = await patchTask(params.id, set)
    return json({ ok })
  }
  const ok = await updateTaskField(params.id, field, checked)
  return json({ ok })
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const ok = await deleteTask(params.id)
  return json({ ok })
}
