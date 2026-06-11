import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createBill, listBills, type CreateBillInput } from '$lib/server/payables'
import { getPO } from '$lib/server/purchaseOrders'
import { parseMoney, cents, type Cents } from '$lib/money'

// Admin-only. GET lists bills; POST creates + posts one. Line amounts arrive as
// dollar strings and are parsed to integer cents here. createBill posts the
// journal entry (Dr expense/COGS per line / Cr A/P) in the same transaction; a
// bad request maps to 400. Mirrors the admin page guard in hooks.server.ts.
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
  return json(await listBills())
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireAdmin(locals)
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
    throw error(400, 'Expected { vendor_name, bill_date, lines: [...] }')
  }
  if (!body.vendor_name || !String(body.vendor_name).trim()) {
    throw error(400, 'A vendor name is required')
  }

  // A po_id link (e.g. from the bill scan's PO match) must point at a real,
  // billable PO — the PO's billed/status are derived from linked bills, so a
  // junk id would quietly corrupt that derivation.
  let po_id: string | undefined
  if (body.po_id) {
    const po = await getPO(String(body.po_id))
    if (!po) throw error(400, 'po_id does not match a purchase order')
    if (po.status === 'cancelled') throw error(400, 'Cannot bill a cancelled purchase order')
    po_id = po._id
  }

  let input: CreateBillInput
  try {
    input = {
      vendor_name: String(body.vendor_name).trim(),
      vendor_email: body.vendor_email ? String(body.vendor_email).trim() : undefined,
      bill_date: String(body.bill_date ?? '').trim(),
      net_days: Number.isFinite(Number(body.net_days)) ? Number(body.net_days) : 30,
      vendor_invoice_no: body.vendor_invoice_no ? String(body.vendor_invoice_no) : undefined,
      po: body.po ? String(body.po) : undefined,
      po_id,
      job: body.job ? String(body.job) : undefined,
      memo: body.memo ? String(body.memo) : undefined,
      created_by: (user.email as string) ?? (user.displayName as string),
      lines: body.lines.map((l: Record<string, unknown>) => ({
        account_id: String(l.account_id ?? '').trim(),
        description: String(l.description ?? '').trim(),
        amount: toCents(l.amount),
      })),
    }
  } catch (e) {
    throw error(400, `Invalid amount: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const bill = await createBill(input)
    return json(bill, { status: 201 })
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e))
  }
}
