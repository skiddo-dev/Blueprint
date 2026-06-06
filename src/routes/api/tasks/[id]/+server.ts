import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { updateTaskField, patchTask, deleteTask, getUserEmailByName } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import { validateTaskFieldValue } from '$lib/server/validation'

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
    const ok = await patchTask(params.id, { assigned_to: checked, assignee_email })
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
