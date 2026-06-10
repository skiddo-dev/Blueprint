import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createInvoice, listInvoices, type CreateInvoiceInput } from '$lib/server/invoicing'
import { parseMoney, cents, type Cents } from '$lib/money'

// Admin-only. GET lists invoices; POST creates + posts one. Money arrives as
// dollar strings and is parsed to integer cents here (the server is
// authoritative). createInvoice validates and posts the journal entry in the
// same transaction; a bad request (no lines, non-positive total, bad date) maps
// to 400. Mirrors the admin page guard in hooks.server.ts.
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
  return json(await listInvoices())
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
    throw error(400, 'Expected { customer_name, issue_date, lines: [...] }')
  }
  if (!body.customer_name || !String(body.customer_name).trim()) {
    throw error(400, 'A customer name is required')
  }

  let input: CreateInvoiceInput
  try {
    input = {
      customer_name: String(body.customer_name).trim(),
      customer_email: body.customer_email ? String(body.customer_email).trim() : undefined,
      issue_date: String(body.issue_date ?? '').trim(),
      net_days: Number.isFinite(Number(body.net_days)) ? Number(body.net_days) : 30,
      tax_rate: Number.isFinite(Number(body.tax_rate)) ? Number(body.tax_rate) : 0,
      po: body.po ? String(body.po) : undefined,
      job: body.job ? String(body.job) : undefined,
      quote_id: body.quote_id ? String(body.quote_id) : undefined,
      memo: body.memo ? String(body.memo) : undefined,
      created_by: (user.email as string) ?? (user.displayName as string),
      lines: body.lines.map((l: Record<string, unknown>) => ({
        description: String(l.description ?? '').trim(),
        quantity: Number(l.quantity ?? 1) || 1,
        unit_price: toCents(l.unit_price),
      })),
    }
  } catch (e) {
    throw error(400, `Invalid amount: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const invoice = await createInvoice(input)
    return json(invoice, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
