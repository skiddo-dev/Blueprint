// Server-side accounts-payable operations: vendors, bills, bill payments, A/P
// aging. Mirror of server/invoicing.ts. Reuses the shared transaction helper and
// the AR status/aging/due-date math; only the posted journal lines differ.
import type { ClientSession } from 'mongodb'
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { withTxn } from './txn'
import { postEntry, postReversal } from './accounting'
import { writeAudit } from './audit'
import { usd } from '$lib/accounting/format'
import { type Cents, cents } from '$lib/money'
import { billTotal, billJournalLines, billPaymentJournalLines, vendorCreditJournalLines } from '$lib/accounting/payables'
import { invoiceStatus, dueDate, buildAging } from '$lib/accounting/invoicing'
import type { Bill, BillLine, BillPayment, Vendor, VendorCredit } from '$lib/accounting/types'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

// ── Vendors ───────────────────────────────────────────────────────────────────
export async function listVendors(): Promise<Vendor[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('vendors', d).find({}).sort({ name: 1 }).toArray()
  return rows.map((v) => ({ ...v, _id: String(v._id) })) as Vendor[]
}

export interface VendorWithStats extends Vendor {
  billCount: number
  totalBilled: Cents
  outstanding: Cents // sum of open bill balances
}

/** Vendors with their AP rollup (bill count, total billed, outstanding). */
/** Update a vendor's name/email. A name change propagates to the denormalized
 *  vendor_name on their bills. Returns false if no such vendor. */
export async function updateVendor(id: string, patch: { name?: string; email?: string; is_1099?: boolean; tax_id?: string }, actor?: string): Promise<boolean> {
  const d = await getDb()
  const set: Record<string, unknown> = {}
  const unset: Record<string, unknown> = {}
  if (patch.name !== undefined && patch.name.trim()) {
    set.name = patch.name.trim()
    set.name_lower = patch.name.trim().toLowerCase()
  }
  if (patch.email !== undefined) {
    if (patch.email.trim()) set.email = patch.email.trim()
    else unset.email = ''
  }
  if (patch.is_1099 !== undefined) set.is_1099 = patch.is_1099
  if (patch.tax_id !== undefined) {
    if (patch.tax_id.trim()) set.tax_id = patch.tax_id.trim()
    else unset.tax_id = ''
  }
  if (!Object.keys(set).length && !Object.keys(unset).length) return false
  const update: Record<string, unknown> = {}
  if (Object.keys(set).length) update.$set = set
  if (Object.keys(unset).length) update.$unset = unset
  const res = await col('vendors', d).updateOne({ _id: id }, update)
  if (set.name) await col('bills', d).updateMany({ vendor_id: id }, { $set: { vendor_name: set.name } })
  if (res.matchedCount > 0) {
    const fields = [...Object.keys(set), ...Object.keys(unset)].filter((k) => k !== 'name_lower')
    await writeAudit({
      actor: actor ?? 'system',
      action: 'vendor.update',
      entity_type: 'vendor',
      entity_id: id,
      summary: `Vendor updated (${fields.join(', ')})${set.name ? ` — ${set.name}` : ''}`,
    })
  }
  return res.matchedCount > 0
}

export async function listVendorsWithStats(): Promise<VendorWithStats[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const agg = await col('bills', d).aggregate([
    { $group: { _id: '$vendor_id', billCount: { $sum: 1 }, totalBilled: { $sum: '$total' }, outstanding: { $sum: '$balance' } } },
  ]).toArray()
  const byId = new Map(agg.map((a) => [String(a._id), a]))
  const vendors = await listVendors()
  return vendors.map((v) => {
    const s = byId.get(v._id)
    return {
      ...v,
      billCount: (s?.billCount as number) ?? 0,
      totalBilled: ((s?.totalBilled as number) ?? 0) as Cents,
      outstanding: ((s?.outstanding as number) ?? 0) as Cents,
    }
  })
}

export async function findOrCreateVendor(
  name: string,
  email: string | undefined,
  session?: ClientSession,
): Promise<Vendor> {
  const d = await getDb()
  const clean = name.trim()
  const lower = clean.toLowerCase()
  const existing = await col('vendors', d).findOne({ name_lower: lower }, { session })
  if (existing) return { ...existing, _id: String(existing._id) } as Vendor
  const vendor: Vendor = {
    _id: crypto.randomUUID(),
    name: clean,
    name_lower: lower,
    ...(email ? { email } : {}),
    created_at: new Date().toISOString(),
  }
  await col('vendors', d).insertOne(vendor, { session })
  return vendor
}

// ── Bills ─────────────────────────────────────────────────────────────────────
async function getNextBillNumber(year: number, session?: ClientSession): Promise<number> {
  const d = await getDb()
  const res = await col('counters', d).findOneAndUpdate(
    { _id: `bill:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  )
  return Number(res?.seq ?? res?.value?.seq ?? 1)
}

export interface CreateBillInput {
  vendor_name: string
  vendor_email?: string
  bill_date: string
  net_days?: number
  lines: BillLine[]
  vendor_invoice_no?: string
  po?: string
  job?: string
  memo?: string
  created_by?: string
}

/** Create and post a bill. The insert and its journal entry commit together. */
export async function createBill(input: CreateBillInput): Promise<Bill> {
  if (!input.lines?.length) throw new Error('A bill needs at least one line')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.bill_date)) throw new Error('bill_date must be ISO YYYY-MM-DD')
  if (input.lines.some((l) => !l.account_id)) throw new Error('Every line needs an expense account')
  const total = billTotal(input.lines)
  if (total <= 0) throw new Error('Bill total must be positive')

  return withTxn(async (session) => {
    const year = Number(input.bill_date.slice(0, 4))
    const number = await getNextBillNumber(year, session)
    const vendor = await findOrCreateVendor(input.vendor_name, input.vendor_email, session)
    const now = new Date().toISOString()
    const bill: Bill = {
      _id: crypto.randomUUID(),
      number,
      year,
      vendor_id: vendor._id,
      vendor_name: vendor.name,
      bill_date: input.bill_date,
      due_date: dueDate(input.bill_date, input.net_days ?? 30),
      lines: input.lines,
      total,
      paid: cents(0),
      balance: total,
      status: 'open',
      ...(input.vendor_invoice_no ? { vendor_invoice_no: input.vendor_invoice_no } : {}),
      ...(input.po ? { po: input.po } : {}),
      ...(input.job ? { job: input.job.trim() } : {}),
      ...(input.memo ? { memo: input.memo } : {}),
      ...(input.created_by ? { created_by: input.created_by } : {}),
      created_at: now,
    }
    const d = await getDb()
    await col('bills', d).insertOne(bill, { session })
    await postEntry(
      {
        date: input.bill_date,
        memo: `Bill #${number} — ${vendor.name}`,
        source: 'bill',
        source_ref: bill._id,
        lines: billJournalLines(input.lines, total),
        created_by: input.created_by,
      },
      { session },
    )
    await writeAudit({
      actor: input.created_by ?? 'system',
      action: 'bill.create',
      entity_type: 'bill',
      entity_id: bill._id,
      summary: `Bill #${year}-${number} — ${usd(total)} — ${vendor.name}`,
    }, { session })
    return bill
  })
}

export async function getBill(id: string): Promise<Bill | null> {
  const d = await getDb()
  const bill = await col('bills', d).findOne({ _id: id })
  return bill ? ({ ...bill, _id: String(bill._id) } as Bill) : null
}

export async function listBills(limit = 100): Promise<Bill[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('bills', d).find({}).sort({ year: -1, number: -1 }).limit(limit).toArray()
  return rows.map((b) => ({ ...b, _id: String(b._id) })) as Bill[]
}

export async function getBillPayments(billId: string): Promise<BillPayment[]> {
  const d = await getDb()
  const rows = await col('billPayments', d).find({ bill_id: billId }).sort({ date: 1 }).toArray()
  return rows.map((p) => ({ ...p, _id: String(p._id) })) as BillPayment[]
}

// ── Bill payments ─────────────────────────────────────────────────────────────
/** Record a payment we made against a bill: insert it, reduce the bill balance,
 *  advance its status, and post Dr A/P / Cr Cash — all in one transaction. */
export async function recordBillPayment(
  billId: string,
  amount: Cents,
  date: string,
  opts: { method?: string; created_by?: string } = {},
): Promise<{ payment: BillPayment; bill: Bill }> {
  if (amount <= 0) throw new Error('Payment amount must be positive')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be ISO YYYY-MM-DD')

  return withTxn(async (session) => {
    const d = await getDb()
    const bill = await col('bills', d).findOne({ _id: billId }, { session })
    if (!bill) throw new Error(`No bill ${billId}`)
    if (bill.status === 'void') throw new Error('Cannot pay a void bill')
    if (amount > bill.balance) throw new Error(`Payment exceeds the open balance (${bill.balance})`)
    const newPaid = (bill.paid as number) + amount
    const newBalance = (bill.total as number) - newPaid
    const status = invoiceStatus(bill.total as Cents, cents(newPaid))
    const now = new Date().toISOString()
    const payment: BillPayment = {
      _id: crypto.randomUUID(),
      bill_id: billId,
      amount,
      date,
      ...(opts.method ? { method: opts.method } : {}),
      ...(opts.created_by ? { created_by: opts.created_by } : {}),
      created_at: now,
    }
    await col('billPayments', d).insertOne(payment, { session })
    await col('bills', d).updateOne(
      { _id: billId },
      { $set: { paid: newPaid, balance: newBalance, status, updated_at: now } },
      { session },
    )
    await postEntry(
      {
        date,
        memo: `Bill payment — Bill #${bill.number}`,
        source: 'bill-payment',
        source_ref: payment._id,
        lines: billPaymentJournalLines(amount),
        created_by: opts.created_by,
      },
      { session },
    )
    await writeAudit({
      actor: opts.created_by ?? 'system',
      action: 'bill-payment.record',
      entity_type: 'bill',
      entity_id: billId,
      summary: `Bill payment ${usd(amount)} on Bill #${bill.number} — ${bill.vendor_name}`,
      meta: { payment_id: payment._id },
    }, { session })
    return { payment, bill: { ...bill, _id: String(bill._id), paid: newPaid, balance: newBalance, status } as Bill }
  })
}

// ── 1099 report data ──────────────────────────────────────────────────────────
/** Everything the 1099 rollup needs for one calendar year: that year's bill
 *  payments, a vendor_id lookup for their bills, and the vendor list. */
export async function get1099Data(year: number): Promise<{
  payments: BillPayment[]
  billsById: Map<string, { vendor_id: string }>
  vendors: Vendor[]
}> {
  if (USE_MOCK) return { payments: [], billsById: new Map(), vendors: [] }
  const d = await getDb()
  const payments = (await col('billPayments', d)
    .find({ date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } })
    .toArray()).map((p) => ({ ...p, _id: String(p._id) })) as BillPayment[]
  const billIds = [...new Set(payments.map((p) => p.bill_id))]
  const bills = await col('bills', d)
    .find({ _id: { $in: billIds } }, { projection: { vendor_id: 1 } })
    .toArray()
  const billsById = new Map(bills.map((b) => [String(b._id), { vendor_id: String(b.vendor_id) }]))
  return { payments, billsById, vendors: await listVendors() }
}

// ── A/P aging ───────────────────────────────────────────────────────────────────
/** Aging of all open/partial bills by days past due, as of `asOf` (today by
 *  default). Reuses the shared aging helper (party = vendor). */
export async function getApAging(asOf?: string) {
  const asOfISO = asOf ?? new Date().toISOString().slice(0, 10)
  if (USE_MOCK) return buildAging([], asOfISO)
  const d = await getDb()
  const open = await col('bills', d)
    .find({ status: { $in: ['open', 'partial'] } })
    .sort({ due_date: 1 })
    .toArray()
  return buildAging(
    open.map((b) => ({
      _id: String(b._id),
      number: b.number as number,
      name: b.vendor_name as string,
      due_date: b.due_date as string,
      balance: b.balance as Cents,
    })),
    asOfISO,
  )
}

// ── Vendor credits + void (V4 corrections parity) ─────────────────────────────
async function getNextVendorCreditNumber(year: number, session?: ClientSession): Promise<number> {
  const d = await getDb()
  const res = await col('counters', d).findOneAndUpdate(
    { _id: `vendor-credit:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  )
  return Number(res?.seq ?? res?.value?.seq ?? 1)
}

export async function listBillCredits(billId: string): Promise<VendorCredit[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('vendorCredits', d).find({ bill_id: billId }).sort({ date: 1, created_at: 1 }).toArray()
  return rows.map((c) => ({ ...c, _id: String(c._id) })) as VendorCredit[]
}

/** A vendor credit against a bill, applied immediately: we owe less (Dr A/P),
 *  and the bill's expense accounts give back pro-rata. */
export async function createVendorCredit(
  billId: string,
  amount: Cents,
  date: string,
  opts: { memo?: string; created_by?: string } = {},
): Promise<{ credit: VendorCredit; bill: Bill }> {
  if (amount <= 0) throw new Error('Credit amount must be positive')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be ISO YYYY-MM-DD')

  return withTxn(async (session) => {
    const d = await getDb()
    const bill = await col('bills', d).findOne({ _id: billId }, { session })
    if (!bill) throw new Error(`No bill ${billId}`)
    if (bill.status === 'void') throw new Error('Cannot credit a void bill')
    if (amount > bill.balance) throw new Error(`Credit exceeds the open balance (${bill.balance})`)

    const credited = ((bill.credited as number) ?? 0) + amount
    const newBalance = (bill.total as number) - (bill.paid as number) - credited
    const status = invoiceStatus(bill.total as Cents, cents((bill.paid as number) + credited))
    const year = Number(date.slice(0, 4))
    const number = await getNextVendorCreditNumber(year, session)
    const now = new Date().toISOString()
    const credit: VendorCredit = {
      _id: crypto.randomUUID(),
      bill_id: billId,
      vendor_id: String(bill.vendor_id),
      vendor_name: bill.vendor_name as string,
      year,
      number,
      date,
      amount,
      ...(opts.memo ? { memo: opts.memo } : {}),
      ...(opts.created_by ? { created_by: opts.created_by } : {}),
      created_at: now,
    }
    await col('vendorCredits', d).insertOne(credit, { session })
    await col('bills', d).updateOne(
      { _id: billId },
      { $set: { credited, balance: newBalance, status, updated_at: now } },
      { session },
    )
    await postEntry(
      {
        date,
        memo: `Vendor credit #${number} — Bill #${bill.number}, ${bill.vendor_name}`,
        source: 'vendor-credit',
        source_ref: credit._id,
        lines: vendorCreditJournalLines(amount, bill.lines as BillLine[]),
        created_by: opts.created_by,
      },
      { session },
    )
    await writeAudit({
      actor: opts.created_by ?? 'system',
      action: 'vendor-credit.create',
      entity_type: 'bill',
      entity_id: billId,
      summary: `Vendor credit #${number} ${usd(amount)} on Bill #${bill.number} — ${bill.vendor_name}`,
      meta: { credit_id: credit._id },
    }, { session })
    return { credit, bill: { ...bill, _id: String(bill._id), credited, balance: newBalance, status } as Bill }
  })
}

/** Void an un-settled bill: reverse its journal entry (dated today) and mark it
 *  void. Bills with payments or credits must be unwound those ways first. */
export async function voidBill(billId: string, opts: { created_by?: string } = {}): Promise<Bill> {
  const d = await getDb()
  const bill = await col('bills', d).findOne({ _id: billId })
  if (!bill) throw new Error(`No bill ${billId}`)
  if (bill.status === 'void') return { ...bill, _id: String(bill._id) } as Bill
  if ((bill.paid as number) > 0) throw new Error('Cannot void a bill with payments — request a vendor credit instead')
  if (((bill.credited as number) ?? 0) > 0) throw new Error('Cannot void a bill with vendor credits applied')

  const entry = await col('journalEntries', d).findOne({ source: 'bill', source_ref: billId })
  let reversalId: string | undefined
  if (entry) {
    const reversal = await postReversal(String(entry._id), {
      date: new Date().toISOString().slice(0, 10),
      memo: `Void — Bill #${bill.number}, ${bill.vendor_name}`,
      ...(opts.created_by ? { created_by: opts.created_by } : {}),
    })
    reversalId = reversal._id
  }
  const now = new Date().toISOString()
  await col('bills', d).updateOne({ _id: billId }, { $set: { status: 'void', balance: 0, updated_at: now } })
  await writeAudit({
    actor: opts.created_by ?? 'system',
    action: 'bill.void',
    entity_type: 'bill',
    entity_id: billId,
    summary: `Void Bill #${bill.number} — ${bill.vendor_name}`,
    ...(reversalId ? { meta: { reversal_entry_id: reversalId } } : {}),
  })
  return { ...bill, _id: String(bill._id), status: 'void', balance: 0 } as Bill
}
