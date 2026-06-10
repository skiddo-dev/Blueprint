import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { postEntry } from '$lib/server/accounting'
import { writeAudit } from '$lib/server/audit'
import { actorOf } from '$lib/server/authz'
import { parseMoney, cents, type Cents } from '$lib/money'
import type { JournalLine } from '$lib/accounting/types'

// Admin-only: create a manual journal entry. Money arrives as dollar strings from
// the form and is parsed to integer cents here (the server is authoritative — it
// never trusts a client-computed cent amount). postEntry validates the entry
// balances and rejects it otherwise; a validation failure is the client's fault,
// so it maps to 400. Mirrors the admin page guard in hooks.server.ts.
function toCents(v: unknown): Cents {
  if (v === undefined || v === null || v === '') return cents(0)
  return parseMoney(typeof v === 'number' ? v : String(v))
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.lines)) throw error(400, 'Expected { date, lines: [...] }')

  let lines: JournalLine[]
  try {
    lines = body.lines.map((l: Record<string, unknown>) => ({
      account_id: String(l.account_id ?? '').trim(),
      debit: toCents(l.debit),
      credit: toCents(l.credit),
      ...(l.memo ? { memo: String(l.memo) } : {}),
    }))
  } catch (e) {
    throw error(400, `Invalid amount: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const entry = await postEntry({
      date: String(body.date ?? '').trim(),
      memo: body.memo ? String(body.memo) : undefined,
      source: 'manual',
      lines,
      created_by: (user.email as string) ?? (user.displayName as string),
    })
    await writeAudit({
      actor: actorOf(user),
      action: 'journal-entry.create',
      entity_type: 'journal-entry',
      entity_id: entry._id,
      summary: `Manual journal entry — ${entry.memo ?? entry.date}`,
    })
    return json(entry, { status: 201 })
  } catch (e) {
    // postEntry throws when the entry doesn't balance / is malformed → client error.
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
