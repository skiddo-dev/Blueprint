import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { backfillTitles } from '$lib/server/backfill'

// One-off maintenance endpoint (admin only): re-run LLM title extraction over
// existing email-sourced tasks so old "RE:/FW:" subject titles become clean
// summaries. Trigger from the browser console while signed in as an admin:
//   await fetch('/api/tasks/backfill-titles?dryRun=1', { method: 'POST' }).then(r => r.json())  // preview count
//   await fetch('/api/tasks/backfill-titles', { method: 'POST' }).then(r => r.json())            // run (stale titles)
//   await fetch('/api/tasks/backfill-titles?all=1', { method: 'POST' }).then(r => r.json())      // run (every email task)
export const POST: RequestHandler = async ({ locals, url }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const dryRun = url.searchParams.get('dryRun') === '1'
  const all = url.searchParams.get('all') === '1'
  const result = await backfillTitles({ dryRun, all })
  return json({ ok: true, ...result })
}
