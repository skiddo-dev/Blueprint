import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { runEmailSync } from '$lib/server/emailSync'

// Manual "Sync now" trigger (admin only). The actual work — and the real-time
// Graph webhook push — both go through runEmailSync().
export const POST: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
  const userName = (user.displayName as string) ?? (user.name as string) ?? 'admin'

  const result = await runEmailSync({ triggeredBy: userName })
  return json({ ok: true, ...result })
}
