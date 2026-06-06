import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { updateQuoteStatus } from '$lib/server/db'

const VALID = ['won', 'lost', 'open'] as const

// Admin-only: set a tracked quote's outcome (the dashboard win/loss toggle).
export const POST: RequestHandler = async ({ request, params, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const { status } = (await request.json()) as { status?: string }
  if (!status || !VALID.includes(status as (typeof VALID)[number])) {
    throw error(400, 'status must be won, lost, or open')
  }

  const ok = await updateQuoteStatus(params.id, status as 'won' | 'lost' | 'open')
  if (!ok) throw error(404, 'quote not found')
  return json({ ok: true })
}
