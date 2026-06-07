import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { insertTask, getUserEmailByName } from '$lib/server/db'
import { parseCsvRecords } from '$lib/csv'
import { extractStoreNumbers } from '$lib/storeNumbers'
import { KANBAN_STATUSES } from '$lib/constants'
import type { TaskStatus } from '$lib/types'

// Bulk-create tasks from a CSV (admin only). Columns mirror the export
// (/api/tasks/export) so an export round-trips; only `title` is required and
// unknown columns are ignored. Bounded so a giant paste can't hammer the DB.
const MAX_ROWS = 2000
const STATUS_SET = new Set<string>(KANBAN_STATUSES)

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const { csv } = await request.json()
  if (typeof csv !== 'string' || !csv.trim()) throw error(400, 'csv text required')

  const records = parseCsvRecords(csv)
  if (!records.length) return json({ created: 0, skipped: 0, errors: ['No data rows found (need a header row + at least one row).'] })
  if (records.length > MAX_ROWS) throw error(400, `Too many rows (max ${MAX_ROWS}).`)

  const createdBy = (user.displayName as string) || (user.name as string) || 'Import'
  const createdByEmail = (user.email as string | undefined)?.toLowerCase() ?? null

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const rowNo = i + 2 // +1 for the header, +1 for 1-based display
    const title = (r.title ?? '').trim()
    if (!title) { skipped++; errors.push(`Row ${rowNo}: missing title`); continue }

    const rawStatus = (r.status ?? '').trim()
    const status: TaskStatus = STATUS_SET.has(rawStatus) ? (rawStatus as TaskStatus) : 'To Do'
    const assigned_to = (r.assigned_to ?? '').trim()
    const assignee_email = assigned_to ? await getUserEmailByName(assigned_to) : null
    const store_numbers = (r.store_numbers ?? '').trim()
      ? r.store_numbers.split(/[\s,]+/).filter(Boolean)
      : extractStoreNumbers(title)

    try {
      await insertTask({
        title,
        status,
        assigned_to,
        assignee_email,
        date: (r.date ?? '').trim() || undefined,
        notes: (r.notes ?? '').trim() || undefined,
        quote: (r.quote ?? '').trim() || undefined,
        quote_type: (r.quote_type ?? '').trim() || undefined,
        quote_assignee: (r.quote_assignee ?? '').trim() || undefined,
        store_numbers,
        created_by: createdBy,
        created_by_email: createdByEmail,
      })
      created++
    } catch (e) {
      skipped++
      errors.push(`Row ${rowNo}: ${e instanceof Error ? e.message : 'insert failed'}`)
    }
  }

  return json({ created, skipped, errors: errors.slice(0, 20) })
}
