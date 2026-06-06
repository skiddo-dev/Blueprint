import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getUsers, patchTask } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import { parseMentions } from '$lib/mentions'
import { SUPERVISORS } from '$lib/constants'
import type { TimelineEntry } from '$lib/types'

// Cap a single comment so a runaway paste can't bloat the task doc / timeline.
const MAX_LEN = 2000

// Post a human comment to a card. Anyone who can access the task (admin or owner)
// may comment — the same rule the task/attachment endpoints share. @mentions are
// resolved SERVER-SIDE against the known roster (never trust a client list) so the
// stored `mentions` array is authoritative for highlighting and future notify.
export const POST: RequestHandler = async ({ params, request, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const session = await locals.auth()
  const user = session!.user as Record<string, unknown>
  const author = (user.displayName as string) || (user.name as string) || 'Someone'

  const { text } = await request.json()
  if (typeof text !== 'string' || !text.trim()) throw error(400, 'Comment text required')
  const trimmed = text.trim().slice(0, MAX_LEN)

  // Mention candidates = provisioned users + the static supervisor roster. If the
  // users lookup fails (e.g. DB not reachable in a dev/mock session), fall back to
  // the supervisor list so commenting still works.
  let candidates = [...SUPERVISORS]
  try {
    const users = await getUsers()
    candidates = [...users.map(u => u.name).filter(Boolean), ...SUPERVISORS]
  } catch {
    // degrade to SUPERVISORS only
  }
  const mentions = parseMentions(trimmed, candidates)

  const entry: TimelineEntry = {
    at: new Date().toISOString(),
    kind: 'comment',
    text: trimmed,
    author,
    mentions,
  }
  // Empty $set still bumps updated_at, so the 2s board poll picks the comment up.
  const ok = await patchTask(params.id, {}, entry)
  return json({ ok, entry }, { status: 201 })
}
