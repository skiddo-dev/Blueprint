import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTask, updateTaskField } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import { summarizeThread } from '$lib/server/llm'

// Regenerate a card's at-a-glance summary (task.description) from the whole thread
// — the original email plus later replies and PM comments. On-demand only (a button
// on the card), so cost/latency is bounded. Returns { summary: null } when there's
// nothing to summarize or the model is unavailable; the description is left as-is.
export const POST: RequestHandler = async ({ params, locals }) => {
  await assertCanAccessTask(locals, params.id)
  const task = await getTask(params.id)
  if (!task) throw error(404)

  // Oldest → newest thread events: incoming replies + human comments.
  const events = (task.timeline ?? [])
    .filter((e) => e.kind === 'email' || e.kind === 'comment')
    .map((e) => e.text)
    .filter(Boolean)

  const summary = await summarizeThread({
    title: task.title,
    body: task.full_body || task.description,
    events,
  })
  if (!summary) return json({ summary: null })

  await updateTaskField(params.id, 'description', summary)
  return json({ summary })
}
