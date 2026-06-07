import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTasks, getQuotes } from '$lib/server/db'
import { KANBAN_STATUSES } from '$lib/constants'

// Admin-only: a compact dashboard summary computed server-side so native clients
// don't re-implement the aggregation. The web dashboard renders its own richer
// interactive charts from the raw collections; this is the mobile KPI subset
// (task counts by status + quote counts/value by outcome). Mirrors the page
// guard in hooks.server.ts (dashboard is an admin route).
export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const [tasks, quotes] = await Promise.all([getTasks(), getQuotes()])

  const tasksByStatus: Record<string, number> = {}
  for (const s of KANBAN_STATUSES) tasksByStatus[s] = 0
  for (const t of tasks) tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1

  const quotesByStatus = { won: 0, lost: 0, open: 0 }
  const quoteValue = { won: 0, lost: 0, open: 0, total: 0 }
  for (const q of quotes) {
    const s = (q.status ?? 'open') as 'won' | 'lost' | 'open'
    const amt = Number.isFinite(q.amount) ? q.amount : 0
    quotesByStatus[s] += 1
    quoteValue[s] += amt
    quoteValue.total += amt
  }

  return json({
    totalTasks: tasks.length,
    tasksByStatus,
    totalQuotes: quotes.length,
    quotesByStatus,
    quoteValue,
  })
}
