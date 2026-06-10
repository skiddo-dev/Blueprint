import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { setChecklistItem, deleteChecklistItem } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'

const MAX_LEN = 300

// Toggle / retitle one checklist item. Task access is the only requirement
// (shared punch list); checking an item stamps who did it, unchecking clears.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const session = await locals.auth()
  const user = session!.user as Record<string, unknown>
  const doneBy = (user.displayName as string) || (user.name as string) || 'Someone'

  const body = await request.json()
  const patch: { text?: string; done?: boolean; doneBy?: string } = {}
  if (body.text !== undefined) {
    if (typeof body.text !== 'string' || !body.text.trim()) throw error(400, 'Item text required')
    patch.text = body.text.trim().slice(0, MAX_LEN)
  }
  if (body.done !== undefined) {
    if (typeof body.done !== 'boolean') throw error(400, 'done must be a boolean')
    patch.done = body.done
    patch.doneBy = doneBy
  }
  if (patch.text === undefined && patch.done === undefined) throw error(400, 'Nothing to update')

  const ok = await setChecklistItem(params.id, params.itemId, patch)
  if (!ok) throw error(404, 'Checklist item not found')
  return json({ ok })
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const ok = await deleteChecklistItem(params.id, params.itemId)
  if (!ok) throw error(404, 'Checklist item not found')
  return json({ ok })
}
