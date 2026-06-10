// Server-side purchase orders. POs never post to the ledger; converting one
// creates a normal bill (createBill posts it) linked back via Bill.po_id, and
// the PO's billed amount/status are derived from those bills at read time.
import type { ClientSession } from 'mongodb'
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { findOrCreateVendor, createBill, type CreateBillInput } from './payables'
import { writeAudit } from './audit'
import { poTotal, poStatus, poNumber, remainingLines, type PurchaseOrder } from '$lib/accounting/purchaseOrders'
import { usd } from '$lib/accounting/format'
import { type Cents, cents } from '$lib/money'
import type { Bill, BillLine } from '$lib/accounting/types'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

async function nextPoNumber(year: number, session?: ClientSession): Promise<number> {
  const d = await getDb()
  const res = await col('counters', d).findOneAndUpdate(
    { _id: `po:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  )
  return Number(res?.seq ?? res?.value?.seq ?? 1)
}

/** Σ totals of the non-void bills linked to each PO — the derived "billed". */
async function billedByPo(poIds: string[]): Promise<Map<string, Cents>> {
  if (!poIds.length) return new Map()
  const d = await getDb()
  const agg = await col('bills', d).aggregate([
    { $match: { po_id: { $in: poIds }, status: { $ne: 'void' } } },
    { $group: { _id: '$po_id', billed: { $sum: '$total' } } },
  ]).toArray()
  return new Map(agg.map((a) => [String(a._id), cents(a.billed as number)]))
}

function withDerived(po: PurchaseOrder, billed: Cents): PurchaseOrder & { billed: Cents } {
  return {
    ...po,
    billed,
    status: poStatus(po.total, billed, { manuallyClosed: po.manually_closed, cancelled: po.cancelled }),
  }
}

export async function createPO(input: {
  vendor_name: string
  vendor_email?: string
  date: string
  expected_date?: string
  lines: BillLine[]
  job?: string
  memo?: string
  created_by?: string
}): Promise<PurchaseOrder> {
  if (!input.lines?.length) throw new Error('A purchase order needs at least one line')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be ISO YYYY-MM-DD')
  if (input.lines.some((l) => !l.account_id)) throw new Error('Every line needs an expense account')
  const total = poTotal(input.lines)
  if (total <= 0) throw new Error('PO total must be positive')

  const d = await getDb()
  const year = Number(input.date.slice(0, 4))
  const number = await nextPoNumber(year)
  const vendor = await findOrCreateVendor(input.vendor_name, input.vendor_email)
  const po: PurchaseOrder = {
    _id: crypto.randomUUID(),
    number,
    year,
    vendor_id: vendor._id,
    vendor_name: vendor.name,
    date: input.date,
    ...(input.expected_date ? { expected_date: input.expected_date } : {}),
    lines: input.lines,
    total,
    status: 'open',
    ...(input.job ? { job: input.job.trim() } : {}),
    ...(input.memo ? { memo: input.memo } : {}),
    ...(input.created_by ? { created_by: input.created_by } : {}),
    created_at: new Date().toISOString(),
  }
  await col('purchaseOrders', d).insertOne(po)
  await writeAudit({
    actor: input.created_by ?? 'system',
    action: 'po.create',
    entity_type: 'purchase-order',
    entity_id: po._id,
    summary: `${poNumber(po)} — ${usd(total)} — ${vendor.name}`,
  })
  return po
}

export async function listPOs(): Promise<(PurchaseOrder & { billed: Cents })[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = (await col('purchaseOrders', d).find({}).sort({ year: -1, number: -1 }).toArray()) as PurchaseOrder[]
  const billed = await billedByPo(rows.map((p) => String(p._id)))
  return rows.map((p) => withDerived({ ...p, _id: String(p._id) }, billed.get(String(p._id)) ?? cents(0)))
}

export async function getPO(id: string): Promise<(PurchaseOrder & { billed: Cents; bills: Bill[] }) | null> {
  const d = await getDb()
  const po = await col('purchaseOrders', d).findOne({ _id: id })
  if (!po) return null
  const bills = (await col('bills', d).find({ po_id: id }).sort({ bill_date: 1 }).toArray()) as Bill[]
  const billed = cents(bills.filter((b) => b.status !== 'void').reduce((s, b) => s + (b.total as number), 0))
  return {
    ...withDerived({ ...po, _id: String(po._id) } as PurchaseOrder, billed),
    bills: bills.map((b) => ({ ...b, _id: String(b._id) })),
  }
}

/** Manually close a PO (short-shipped / won't be billed further). */
export async function closePO(id: string, opts: { created_by?: string } = {}): Promise<void> {
  const d = await getDb()
  const r = await col('purchaseOrders', d).findOneAndUpdate(
    { _id: id },
    { $set: { manually_closed: true, updated_at: new Date().toISOString() } },
  )
  if (!r) throw new Error(`No purchase order ${id}`)
  await writeAudit({
    actor: opts.created_by ?? 'system',
    action: 'po.close',
    entity_type: 'purchase-order',
    entity_id: id,
    summary: `Closed ${poNumber(r as PurchaseOrder)} (no further billing expected)`,
  })
}

/** Cancel a PO — only while nothing is billed against it. */
export async function cancelPO(id: string, opts: { created_by?: string } = {}): Promise<void> {
  const billed = (await billedByPo([id])).get(id) ?? 0
  if (billed > 0) throw new Error('This PO has bills against it — close it instead of cancelling')
  const d = await getDb()
  const r = await col('purchaseOrders', d).findOneAndUpdate(
    { _id: id },
    { $set: { cancelled: true, updated_at: new Date().toISOString() } },
  )
  if (!r) throw new Error(`No purchase order ${id}`)
  await writeAudit({
    actor: opts.created_by ?? 'system',
    action: 'po.cancel',
    entity_type: 'purchase-order',
    entity_id: id,
    summary: `Cancelled ${poNumber(r as PurchaseOrder)}`,
  })
}

/** Convert (part of) a PO to a posted bill. Default lines = the unbilled
 *  remainder; the caller may pass an edited subset. */
export async function convertToBill(
  poId: string,
  input: { bill_date: string; lines?: BillLine[]; net_days?: number; vendor_invoice_no?: string; created_by?: string },
): Promise<Bill> {
  const po = await getPO(poId)
  if (!po) throw new Error(`No purchase order ${poId}`)
  if (po.status === 'cancelled') throw new Error('Cannot bill a cancelled PO')
  const lines = input.lines?.length ? input.lines : remainingLines(po.lines, po.total, po.billed)
  if (!lines.length) throw new Error('Nothing left to bill on this PO')

  const billInput: CreateBillInput = {
    vendor_name: po.vendor_name,
    bill_date: input.bill_date,
    lines,
    po: poNumber(po),
    po_id: poId,
    ...(input.net_days !== undefined ? { net_days: input.net_days } : {}),
    ...(input.vendor_invoice_no ? { vendor_invoice_no: input.vendor_invoice_no } : {}),
    ...(po.job ? { job: po.job } : {}),
    ...(input.created_by ? { created_by: input.created_by } : {}),
  }
  const bill = await createBill(billInput)
  await writeAudit({
    actor: input.created_by ?? 'system',
    action: 'po.convert',
    entity_type: 'purchase-order',
    entity_id: poId,
    summary: `Converted ${poNumber(po)} → Bill #${bill.year}-${bill.number} (${usd(bill.total)})`,
    meta: { bill_id: bill._id },
  })
  return bill
}
