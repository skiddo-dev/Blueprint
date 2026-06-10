import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { listTemplates, createTemplate, type JournalPayload } from '$lib/server/recurring'
import type { CreateInvoiceInput } from '$lib/server/invoicing'
import type { CreateBillInput } from '$lib/server/payables'
import { parseMoney, cents, type Cents } from '$lib/money'

// Admin-only. GET lists recurring templates; POST creates one. Payload amounts
// arrive as dollar strings (same as the create routes) and are parsed to cents
// HERE, so the engine posts pre-validated, pre-parsed inputs at 2am with no
// user around to fix a typo.
function toCents(v: unknown): Cents {
  if (v === undefined || v === null || v === '') return cents(0)
  return parseMoney(typeof v === 'number' ? v : String(v))
}

async function requireAdmin(locals: App.Locals) {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
  return user
}

export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals)
  return json(await listTemplates())
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  if (!body || !body.type || !body.name || !body.cadence || !body.next_date || !body.payload) {
    throw error(400, 'Expected { type, name, cadence, next_date, payload }')
  }
  const type = String(body.type)
  const p = body.payload as Record<string, unknown>

  let payload: unknown
  try {
    if (type === 'invoice') {
      if (!p.customer_name || !Array.isArray(p.lines) || p.lines.length === 0) throw new Error('invoice payload needs customer_name + lines')
      payload = {
        customer_name: String(p.customer_name).trim(),
        customer_email: p.customer_email ? String(p.customer_email).trim() : undefined,
        net_days: Number.isFinite(Number(p.net_days)) ? Number(p.net_days) : 30,
        tax_rate: Number.isFinite(Number(p.tax_rate)) ? Number(p.tax_rate) : 0,
        po: p.po ? String(p.po) : undefined,
        job: p.job ? String(p.job) : undefined,
        memo: p.memo ? String(p.memo) : undefined,
        lines: (p.lines as Record<string, unknown>[]).map((l) => ({
          description: String(l.description ?? '').trim(),
          quantity: Number(l.quantity ?? 1) || 1,
          unit_price: toCents(l.unit_price),
        })),
      } satisfies Omit<CreateInvoiceInput, 'issue_date'>
    } else if (type === 'bill') {
      if (!p.vendor_name || !Array.isArray(p.lines) || p.lines.length === 0) throw new Error('bill payload needs vendor_name + lines')
      payload = {
        vendor_name: String(p.vendor_name).trim(),
        vendor_email: p.vendor_email ? String(p.vendor_email).trim() : undefined,
        net_days: Number.isFinite(Number(p.net_days)) ? Number(p.net_days) : 30,
        po: p.po ? String(p.po) : undefined,
        job: p.job ? String(p.job) : undefined,
        memo: p.memo ? String(p.memo) : undefined,
        lines: (p.lines as Record<string, unknown>[]).map((l) => ({
          account_id: String(l.account_id ?? ''),
          description: String(l.description ?? '').trim(),
          amount: toCents(l.amount),
        })),
      } satisfies Omit<CreateBillInput, 'bill_date'>
    } else if (type === 'journal') {
      if (!Array.isArray(p.lines) || p.lines.length < 2) throw new Error('journal payload needs at least two lines')
      payload = {
        memo: p.memo ? String(p.memo) : undefined,
        job: p.job ? String(p.job) : undefined,
        lines: (p.lines as Record<string, unknown>[]).map((l) => ({
          account_id: String(l.account_id ?? ''),
          debit: toCents(l.debit),
          credit: toCents(l.credit),
        })),
      } satisfies JournalPayload
    } else {
      throw new Error(`Unknown template type ${type}`)
    }
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }

  try {
    const t = await createTemplate({
      type: type as 'invoice' | 'bill' | 'journal',
      name: String(body.name),
      cadence: { unit: body.cadence.unit, interval: Number(body.cadence.interval) || 1 },
      next_date: String(body.next_date).trim(),
      end_date: body.end_date ? String(body.end_date).trim() : undefined,
      payload,
      created_by: (user.email as string) ?? (user.displayName as string),
    })
    return json(t, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
