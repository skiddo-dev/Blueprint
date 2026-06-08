import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { deleteAttachment } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'

// Remove an attachment from a card. Anyone who can access the task may remove its
// files — the same rule as commenting / uploading / downloading. The delete is
// scoped to the owning task id, so a guessed attachment id can't reach across to
// another card's file.
export const DELETE: RequestHandler = async ({ params, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const ok = await deleteAttachment(params.id, params.attId)
  return json({ ok })
}
