import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTask, patchTask } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import { mentionCandidates } from '$lib/server/comments'
import { parseMentions } from '$lib/mentions'
import type { TimelineEntry } from '$lib/types'

// Cap a single comment so a runaway paste can't bloat the task doc / timeline.
const MAX_LEN = 2000

// Post a comment (or a reply, when `parent_id` is given) to a card. Anyone who
// can access the task may comment — the same rule the task/attachment endpoints
// share. @mentions are resolved SERVER-SIDE against the known roster. Every new
// comment gets a stable `id` + the author's email so it can be edited/deleted/
// reacted to later.
export const POST: RequestHandler = async ({ params, request, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const session = await locals.auth()
  const user = session!.user as Record<string, unknown>
  const author = (user.displayName as string) || (user.name as string) || 'Someone'
  const authorEmail = (user.email as string | undefined)?.toLowerCase()

  const { text, parent_id } = await request.json()
  if (typeof text !== 'string' || !text.trim()) throw error(400, 'Comment text required')
  const trimmed = text.trim().slice(0, MAX_LEN)

  const mentions = parseMentions(trimmed, await mentionCandidates())

  const entry: TimelineEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: 'comment',
    text: trimmed,
    author,
    author_email: authorEmail,
    mentions,
    reactions: {},
  }

  // A reply must point at an existing TOP-LEVEL comment on this task (one level
  // of nesting only).
  if (parent_id != null) {
    if (typeof parent_id !== 'string') throw error(400, 'Invalid parent')
    const task = await getTask(params.id)
    const parent = (task?.timeline ?? []).find(
      e => e.kind === 'comment' && e.id === parent_id && !e.parent_id,
    )
    if (!parent) throw error(400, 'Parent comment not found')
    entry.parent_id = parent_id
  }

  const ok = await patchTask(params.id, {}, entry)
  return json({ ok, entry }, { status: 201 })
}
