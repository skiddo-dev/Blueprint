import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { aiConfigured, answerBooksQuestion } from '$lib/server/booksAi'

// Admin-only. Answer a natural-language question about the books. The model
// picks ONE deterministic report + parameters, the report runs exactly as its
// page would, and the model narrates that data — it never writes a query and
// never computes a figure. Read-only; persists nothing.
export const POST: RequestHandler = async ({ request, locals }) => {
  await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  const question = String(body?.question ?? '').trim()
  if (question.length < 3) throw error(400, 'Ask a question')
  if (question.length > 300) throw error(400, 'Keep the question under 300 characters')
  if (!aiConfigured()) return json({ configured: false })

  const today = new Date().toISOString().slice(0, 10)
  const result = await answerBooksQuestion(question, today)
  return json({ configured: true, ...result })
}
