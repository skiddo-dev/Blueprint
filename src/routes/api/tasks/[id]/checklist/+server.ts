import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { addChecklistItem } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import type { ChecklistItem } from '$lib/types'

// Cap one punch-list line — these are short actionables, not documents.
const MAX_LEN = 300

// Add a checklist item. Anyone who can access the task may manage its
// checklist — it's a shared crew punch list, unlike comments (author-owned).
export const POST: RequestHandler = async ({ params, request, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const { text } = await request.json()
  if (typeof text !== 'string' || !text.trim()) throw error(400, 'Item text required')

  const item: ChecklistItem = {
    id: crypto.randomUUID(),
    text: text.trim().slice(0, MAX_LEN),
    done: false,
  }
  const ok = await addChecklistItem(params.id, item)
  if (!ok) throw error(404, 'Task not found')
  return json({ ok, item }, { status: 201 })
}
