import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { backfillCutoff } from '$lib/server/backfillCutoff'

// One-off maintenance endpoint (admin only): permanently remove cards created
// from emails flagged on/before the sync cutoff (EMAIL_SYNC_CUTOFF). Always
// dry-run first to preview the counts. Trigger from the browser console while
// signed in as an admin:
//   await fetch('/api/tasks/backfill-cutoff?dryRun=1', { method: 'POST' }).then(r => r.json())  // preview
//   await fetch('/api/tasks/backfill-cutoff', { method: 'POST' }).then(r => r.json())            // delete
export const POST: RequestHandler = async ({ locals, url }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const dryRun = url.searchParams.get('dryRun') === '1'
  const result = await backfillCutoff({ dryRun })
  return json({ ok: !result.authError, ...result }, { status: result.authError ? 502 : 200 })
}
