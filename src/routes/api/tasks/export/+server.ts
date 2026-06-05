import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTasks } from '$lib/server/db'

export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)
  const user = session.user as Record<string, unknown>
  if (user.role !== 'admin') throw error(403)

  const tasks = await getTasks()
  const cols = ['_id', 'title', 'status', 'assigned_to', 'quote', 'quote_type',
                'quote_assignee', 'store_numbers', 'date', 'notes', 'sender_name',
                'sender_email', 'exchange_id', 'created_by', 'created_at']

  const rows = [cols.join(',')]
  for (const t of tasks) {
    const row = cols.map(c => {
      const raw = (t as unknown as Record<string, unknown>)[c]
      const v = Array.isArray(raw) ? raw.join(' ') : String(raw ?? '')
      return `"${v.replace(/"/g, '""')}"`
    })
    rows.push(row.join(','))
  }

  return new Response(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="blueprint_tasks.csv"',
    },
  })
}
