import { z } from 'zod'
import { error } from '@sveltejs/kit'
import { KANBAN_STATUSES, QUOTE_STATUSES, QUOTE_TYPES } from '$lib/constants'

const oneOf = (vals: readonly string[], label: string) =>
  z.string().refine(v => vals.includes(v), { message: `invalid ${label}` })

// Manual "New Task" create. Unknown keys are stripped (zod default), which also
// blocks create-time mass-assignment (e.g. a client setting created_at / _id /
// created_by_email). Identity fields are stamped by the route from the session,
// never accepted here.
export const newTaskSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(300),
  description: z.string().max(10_000).optional(),
  status: oneOf(KANBAN_STATUSES, 'status').optional(),
  assigned_to: z.string().max(120).nullable().optional(),
  co_assignees: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  quote_assignee: z.string().max(120).nullable().optional(),
  date: z.string().max(40).nullable().optional(),
  quote: z.string().max(120).nullable().optional(),
  quote_type: oneOf(QUOTE_TYPES, 'quote_type').nullable().optional(),
  quote_status: oneOf(QUOTE_STATUSES, 'quote_status').nullable().optional(),
  po: z.string().max(120).nullable().optional(),
  notes: z.string().max(10_000).optional(),
  store_numbers: z.array(z.string().max(20)).max(50).optional(),
})

// Bulk action over selected cards. `value` carries the target status (action
// 'status') or assignee name (action 'assign'); archive/delete take none.
export const bulkTaskSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(100)).min(1).max(200),
  action: z.enum(['status', 'assign', 'archive', 'delete']),
  value: z.string().max(120).optional(),
})

// Drag-drop move: target column + the card's new fractional rank within it.
// The charset/no-trailing-'0' rules mirror $lib/rank's invariants — a crafted
// rank can't corrupt a column beyond misplacing this one card, but there's no
// reason to store junk the generator could never emit.
export const moveTaskSchema = z.object({
  status: oneOf(KANBAN_STATUSES, 'status'),
  rank: z.string().min(1).max(100)
    .regex(/^[0-9a-z]+$/, 'invalid rank')
    .refine(v => !v.endsWith('0'), { message: 'invalid rank' }),
})

export const userUpsertSchema = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(['admin', 'pm', 'viewer']).optional(),
  name: z.string().max(200).optional(),
})

// Per-field value rules for PATCH /api/tasks/[id]. The field NAME is allowlisted by
// the route; this validates the VALUE. Fields not listed accept any value.
const TASK_FIELD_VALUE: Record<string, z.ZodTypeAny> = {
  status: oneOf(KANBAN_STATUSES, 'status'),
  assigned_to: z.string().max(120),
  co_assignees: z.array(z.string().trim().min(1).max(120)).max(20),
  quote_assignee: z.string().max(120).nullable(),
  date: z.string().max(40).nullable(),
  quote: z.string().max(120).nullable(),
  quote_type: oneOf(QUOTE_TYPES, 'quote_type').nullable(),
  quote_status: oneOf(QUOTE_STATUSES, 'quote_status').nullable(),
  notes: z.string().max(10_000),
}

/** Parse + validate a JSON request body; throws 400 (with the first issue) on failure. */
export async function readValidated<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw error(400, 'Invalid JSON body')
  }
  const r = schema.safeParse(raw)
  if (!r.success) {
    const i = r.error.issues[0]
    throw error(400, i ? `${i.path.join('.') || 'body'}: ${i.message}` : 'Invalid request body')
  }
  return r.data
}

/** Validate one task field's value (name already allowlisted); returns it or 400s. */
export function validateTaskFieldValue(field: string, value: unknown): unknown {
  const schema = TASK_FIELD_VALUE[field]
  if (!schema) return value
  const r = schema.safeParse(value)
  if (!r.success) throw error(400, `${field}: ${r.error.issues[0]?.message ?? 'invalid value'}`)
  return r.data
}
