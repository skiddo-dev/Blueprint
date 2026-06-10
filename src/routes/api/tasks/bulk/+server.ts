import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTask, patchTask, deleteTask, getUserEmailByName, topRankForStatus } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import { bulkTaskSchema, readValidated } from '$lib/server/validation'
import { KANBAN_STATUSES } from '$lib/constants'
import { statusOnAssign } from '$lib/taskRules'
import type { TaskStatus } from '$lib/types'

// Bulk actions over a selection of cards (the board's multi-select bar).
// Each id is authorized and applied INDEPENDENTLY — one card the caller can't
// touch (or that vanished mid-selection) doesn't sink the rest; the response
// reports how many were applied vs skipped. The per-card semantics deliberately
// mirror the single-card endpoints: a status change lands at the top of the new
// column, restarts the aging clock, and restores an archived card; assigning a
// real person auto-starts a "To Do" card.
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const { ids, action, value } = await readValidated(request, bulkTaskSchema)

  if (action === 'status' && !KANBAN_STATUSES.includes(value as TaskStatus)) {
    throw error(400, 'value: invalid status')
  }
  if (action === 'assign' && !value?.trim()) {
    throw error(400, 'value: assignee is required')
  }

  // Resolve once — same name maps to the same identity for every card.
  const assigneeEmail = action === 'assign' ? await getUserEmailByName(value!) : null

  let done = 0
  let skipped = 0
  for (const id of [...new Set(ids)]) {
    try {
      await assertCanAccessTask(locals, id)
      const current = await getTask(id)
      if (!current) { skipped++; continue }

      if (action === 'delete') {
        await deleteTask(id)
        done++
        continue
      }
      if (action === 'archive') {
        if (!current.archived_at) await patchTask(id, { archived_at: new Date().toISOString() })
        done++
        continue
      }

      const set: Record<string, unknown> = {}
      let nextStatus: TaskStatus | null = null
      if (action === 'status') {
        nextStatus = current.status !== value ? (value as TaskStatus) : null
      } else {
        set.assigned_to = value
        set.assignee_email = assigneeEmail
        nextStatus = statusOnAssign(current.status, value)
      }
      if (nextStatus) {
        set.status = nextStatus
        set.status_changed_at = new Date().toISOString()
        set.rank = await topRankForStatus(nextStatus)
      }
      if (Object.keys(set).length === 0) { done++; continue } // already in the target state
      const unset = current.archived_at ? ['archived_at'] : undefined
      await patchTask(id, set, undefined, unset)
      done++
    } catch {
      skipped++ // not found / not yours — report, don't fail the batch
    }
  }
  return json({ ok: true, done, skipped })
}
