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

  try {
    const result = await runEmailSync({ triggeredBy: userName })
    // 502 on an auth failure so monitoring sees it, but still carry the actionable
    // message — the board reads `data.message` regardless of status and toasts it.
    return json({ ok: !result.authError, ...result }, { status: result.authError ? 502 : 200 })
  } catch (e) {
    console.error('[api/sync] unexpected sync error:', e)
    return json(
      { ok: false, count: 0, message: '⚠️ Email sync failed unexpectedly. Please try again — if it persists, contact an admin.' },
      { status: 502 },
    )
  }
}
