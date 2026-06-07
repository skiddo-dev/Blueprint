import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTask, updateComment, deleteComment } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import { mentionCandidates } from '$lib/server/comments'
import { parseMentions } from '$lib/mentions'

const MAX_LEN = 2000

// Load the target comment and decide if the caller may modify it: the author
// (matched on login email) or an admin. Throws 401/403/404 as appropriate.
async function authzComment(locals: App.Locals, taskId: string, commentId: string) {
  await assertCanAccessTask(locals, taskId)
  const session = await locals.auth()
  const user = session!.user as Record<string, unknown>
  const task = await getTask(taskId)
  if (!task) throw error(404)
  const comment = (task.timeline ?? []).find(e => e.kind === 'comment' && e.id === commentId)
  if (!comment) throw error(404, 'Comment not found')
  const email = (user.email as string | undefined)?.toLowerCase()
  const canModify = user.role === 'admin' || (!!comment.author_email && comment.author_email === email)
  return { comment, canModify }
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const { canModify } = await authzComment(locals, params.id, params.commentId)
  if (!canModify) throw error(403, 'You can only edit your own comments')

  const { text } = await request.json()
  if (typeof text !== 'string' || !text.trim()) throw error(400, 'Comment text required')
  const trimmed = text.trim().slice(0, MAX_LEN)
  const mentions = parseMentions(trimmed, await mentionCandidates())

  const ok = await updateComment(params.id, params.commentId, trimmed, mentions)
  return json({ ok, text: trimmed, mentions })
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const { canModify } = await authzComment(locals, params.id, params.commentId)
  if (!canModify) throw error(403, 'You can only delete your own comments')

  const ok = await deleteComment(params.id, params.commentId)
  return json({ ok })
}
