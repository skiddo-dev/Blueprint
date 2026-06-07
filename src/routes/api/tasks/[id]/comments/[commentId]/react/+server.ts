import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTask, setCommentReactions } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import { isReactionEmoji, toggleReactor } from '$lib/reactions'

// Toggle the caller's emoji reaction on a comment. Anyone who can access the task
// may react (not just the author). Read-modify-write of the comment's reactions
// map — low frequency, and the 2s board poll reconciles.
export const POST: RequestHandler = async ({ params, request, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const session = await locals.auth()
  const user = session!.user as Record<string, unknown>
  const name = (user.displayName as string) || (user.name as string) || 'Someone'

  const { emoji } = await request.json()
  if (!isReactionEmoji(emoji)) throw error(400, 'Unsupported reaction')

  const task = await getTask(params.id)
  if (!task) throw error(404)
  const comment = (task.timeline ?? []).find(e => e.kind === 'comment' && e.id === params.commentId)
  if (!comment) throw error(404, 'Comment not found')

  const reactions = toggleReactor(comment.reactions, emoji, name)
  const ok = await setCommentReactions(params.id, params.commentId, reactions)
  return json({ ok, reactions })
}
