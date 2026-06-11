import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getAccounts } from '$lib/server/accounting'
import { aiConfigured, categorizeStatementLines, getPayeeHistory } from '$lib/server/booksAi'
import type { CategoryLine } from '$lib/accounting/categorize'

const MAX_LINES = 80

// Admin-only. Suggest a ledger account for unmatched bank-statement lines.
// Persists NOTHING and posts nothing — the reconcile page shows the suggestions
// and the user records each line through the normal expense/journal endpoints.
// Amounts arrive as the signed cents statement-import already parsed.
export const POST: RequestHandler = async ({ request, locals }) => {
  await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
    throw error(400, 'Expected { lines: [{ date, description, amount }] }')
  }
  if (body.lines.length > MAX_LINES) throw error(400, `At most ${MAX_LINES} lines per request`)

  const lines: CategoryLine[] = body.lines.map((l: Record<string, unknown>) => {
    const amount = Number(l.amount)
    if (!Number.isSafeInteger(amount) || amount === 0) throw error(400, 'Each line needs a non-zero integer cent amount')
    return {
      date: String(l.date ?? '').slice(0, 10),
      description: String(l.description ?? '').slice(0, 200),
      amount,
    }
  })

  if (!aiConfigured()) return json({ configured: false, suggestions: [] })
  const [accounts, history] = await Promise.all([getAccounts(), getPayeeHistory()])
  const suggestions = await categorizeStatementLines(lines, accounts, history)
  return json({ configured: true, suggestions })
}
