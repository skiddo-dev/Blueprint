// Server-side AR operations: customers, invoices, payments, A/R aging. The money
// math and journal construction live in the pure module ($lib/accounting/
// invoicing); this layer persists and posts to the ledger.
//
// Posting must be atomic — an invoice and its journal entry, or a payment plus
// the invoice-balance update and its entry, have to commit together. withTxn()
// uses a real multi-document transaction where the deployment supports one
// (Atlas in prod, or a local replica set), and degrades to sequential writes on a
// standalone dev mongod. The degraded path is safe because postEntry is
// idempotent on (source, source_ref), so a partial failure can be re-driven
// without double-posting; on a standalone the session-bound write fails up front,
// before anything persists, so there's no torn state to begin with.
import type { ClientSession } from 'mongodb'
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { withTxn } from './txn'
import { postEntry, postReversal } from './accounting'
import { cents, type Cents } from '$lib/money'
import {
  invoiceTotals, invoiceStatus, invoiceJournalLines, paymentJournalLines, dueDate, buildAging,
  type InvoiceLineInput,
  creditMemoJournalLines,
} from '$lib/accounting/invoicing'
import type { CreditMemo, Customer, Invoice, Payment } from '$lib/accounting/types'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

// ── Customers ─────────────────────────────────────────────────────────────────
export async function listCustomers(): Promise<Customer[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('customers', d).find({}).sort({ name: 1 }).toArray()
  return rows.map((c) => ({ ...c, _id: String(c._id) })) as Customer[]
}

export interface CustomerWithStats extends Customer {
  invoiceCount: number
  totalInvoiced: Cents
  outstanding: Cents // sum of open invoice balances
}

/** Customers with their AR rollup (invoice count, total invoiced, outstanding). */
/** Update a customer's name/email. A name change propagates to the denormalized
 *  customer_name on their invoices. Returns false if no such customer. */
export async function updateCustomer(id: string, patch: { name?: string; email?: string }): Promise<boolean> {
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
  if (!Object.keys(set).length && !Object.keys(unset).length) return false
  const update: Record<string, unknown> = {}
  if (Object.keys(set).length) update.$set = set
  if (Object.keys(unset).length) update.$unset = unset
  const res = await col('customers', d).updateOne({ _id: id }, update)
  if (set.name) await col('invoices', d).updateMany({ customer_id: id }, { $set: { customer_name: set.name } })
  return res.matchedCount > 0
}

export async function listCustomersWithStats(): Promise<CustomerWithStats[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const agg = await col('invoices', d).aggregate([
    { $group: { _id: '$customer_id', invoiceCount: { $sum: 1 }, totalInvoiced: { $sum: '$total' }, outstanding: { $sum: '$balance' } } },
  ]).toArray()
  const byId = new Map(agg.map((a) => [String(a._id), a]))
  const customers = await listCustomers()
  return customers.map((c) => {
    const s = byId.get(c._id)
    return {
      ...c,
      invoiceCount: (s?.invoiceCount as number) ?? 0,
      totalInvoiced: ((s?.totalInvoiced as number) ?? 0) as Cents,
      outstanding: ((s?.outstanding as number) ?? 0) as Cents,
    }
  })
}

/** Find a customer by (case-insensitive) name or create one. */
export async function findOrCreateCustomer(
  name: string,
  email: string | undefined,
  session?: ClientSession,
): Promise<Customer> {
  const d = await getDb()
  const clean = name.trim()
  const lower = clean.toLowerCase()
  const existing = await col('customers', d).findOne({ name_lower: lower }, { session })
  if (existing) return { ...existing, _id: String(existing._id) } as Customer
  const customer: Customer = {
    _id: crypto.randomUUID(),
    name: clean,
    name_lower: lower,
    ...(email ? { email } : {}),
    created_at: new Date().toISOString(),
  }
  await col('customers', d).insertOne(customer, { session })
  return customer
}

// ── Invoices ──────────────────────────────────────────────────────────────────
async function getNextInvoiceNumber(year: number, session?: ClientSession): Promise<number> {
  const d = await getDb()
  const res = await col('counters', d).findOneAndUpdate(
    { _id: `invoice:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  )
  return Number(res?.seq ?? res?.value?.seq ?? 1)
}

export interface CreateInvoiceInput {
  customer_name: string
  customer_email?: string
  issue_date: string
  net_days?: number
  lines: InvoiceLineInput[]
  tax_rate?: number
  po?: string
  quote_id?: string
  job?: string
  memo?: string
  created_by?: string
}

/** Create and post an invoice. The insert and its journal entry commit together. */
export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  if (!input.lines?.length) throw new Error('An invoice needs at least one line')
  const issue = input.issue_date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue)) throw new Error('issue_date must be ISO YYYY-MM-DD')
  const { subtotal, tax, total, lines } = invoiceTotals(input.lines, input.tax_rate ?? 0)
  if (total <= 0) throw new Error('Invoice total must be positive')

  return withTxn(async (session) => {
    const year = Number(issue.slice(0, 4))
    const number = await getNextInvoiceNumber(year, session)
    const customer = await findOrCreateCustomer(input.customer_name, input.customer_email, session)
    const now = new Date().toISOString()
    const invoice: Invoice = {
      _id: crypto.randomUUID(),
      number,
      year,
      customer_id: customer._id,
      customer_name: customer.name,
      issue_date: issue,
      due_date: dueDate(issue, input.net_days ?? 30),
      lines,
      subtotal,
      tax_rate: input.tax_rate ?? 0,
      tax,
      total,
      paid: cents(0),
      balance: total,
      status: 'open',
      ...(input.po ? { po: input.po } : {}),
      ...(input.quote_id ? { quote_id: input.quote_id } : {}),
      ...(input.job ? { job: input.job.trim() } : {}),
      ...(input.memo ? { memo: input.memo } : {}),
      ...(input.created_by ? { created_by: input.created_by } : {}),
      created_at: now,
    }
    const d = await getDb()
    await col('invoices', d).insertOne(invoice, { session })
    await postEntry(
      {
        date: issue,
        memo: `Invoice #${number} — ${customer.name}`,
        source: 'invoice',
        source_ref: invoice._id,
        lines: invoiceJournalLines({ total, subtotal, tax }),
        created_by: input.created_by,
      },
      { session },
    )
    return invoice
  })
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const d = await getDb()
  const inv = await col('invoices', d).findOne({ _id: id })
  return inv ? ({ ...inv, _id: String(inv._id) } as Invoice) : null
}

export async function listInvoices(limit = 100): Promise<Invoice[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('invoices', d).find({}).sort({ year: -1, number: -1 }).limit(limit).toArray()
  return rows.map((i) => ({ ...i, _id: String(i._id) })) as Invoice[]
}

export async function getInvoicePayments(invoiceId: string): Promise<Payment[]> {
  const d = await getDb()
  const rows = await col('payments', d).find({ invoice_id: invoiceId }).sort({ date: 1 }).toArray()
  return rows.map((p) => ({ ...p, _id: String(p._id) })) as Payment[]
}

// ── Payments ──────────────────────────────────────────────────────────────────
/** Record a payment against an invoice: insert it, reduce the invoice balance,
 *  advance its status, and post Dr Cash / Cr A/R — all in one transaction. */
export async function recordPayment(
  invoiceId: string,
  amount: Cents,
  date: string,
  opts: { method?: string; created_by?: string } = {},
): Promise<{ payment: Payment; invoice: Invoice }> {
  if (amount <= 0) throw new Error('Payment amount must be positive')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be ISO YYYY-MM-DD')

  return withTxn(async (session) => {
    const d = await getDb()
    const inv = await col('invoices', d).findOne({ _id: invoiceId }, { session })
    if (!inv) throw new Error(`No invoice ${invoiceId}`)
    if (inv.status === 'void') throw new Error('Cannot pay a void invoice')
    if (amount > inv.balance) {
      throw new Error(`Payment exceeds the open balance (${inv.balance})`)
    }
    const newPaid = (inv.paid as number) + amount
    const newBalance = (inv.total as number) - newPaid
    const status = invoiceStatus(inv.total as Cents, cents(newPaid))
    const now = new Date().toISOString()
    const payment: Payment = {
      _id: crypto.randomUUID(),
      invoice_id: invoiceId,
      amount,
      date,
      ...(opts.method ? { method: opts.method } : {}),
      ...(opts.created_by ? { created_by: opts.created_by } : {}),
      created_at: now,
    }
    await col('payments', d).insertOne(payment, { session })
    await col('invoices', d).updateOne(
      { _id: invoiceId },
      { $set: { paid: newPaid, balance: newBalance, status, updated_at: now } },
      { session },
    )
    await postEntry(
      {
        date,
        memo: `Payment — Invoice #${inv.number}`,
        source: 'payment',
        source_ref: payment._id,
        lines: paymentJournalLines(amount),
        created_by: opts.created_by,
      },
      { session },
    )
    return { payment, invoice: { ...inv, _id: String(inv._id), paid: newPaid, balance: newBalance, status } as Invoice }
  })
}

// ── A/R aging ───────────────────────────────────────────────────────────────────
/** Aging of all open/partial invoices by days past due, as of `asOf` (today by
 *  default). */
export async function getArAging(asOf?: string) {
  const asOfISO = asOf ?? new Date().toISOString().slice(0, 10)
  if (USE_MOCK) return buildAging([], asOfISO)
  const d = await getDb()
  const open = await col('invoices', d)
    .find({ status: { $in: ['open', 'partial'] } })
    .sort({ due_date: 1 })
    .toArray()
  return buildAging(
    open.map((i) => ({
      _id: String(i._id),
      number: i.number as number,
      name: i.customer_name as string,
      due_date: i.due_date as string,
      balance: i.balance as Cents,
    })),
    asOfISO,
  )
}

// ── Credit memos + void (V4 corrections parity) ───────────────────────────────
async function getNextCreditMemoNumber(year: number, session?: ClientSession): Promise<number> {
  const d = await getDb()
  const res = await col('counters', d).findOneAndUpdate(
    { _id: `credit-memo:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  )
  return Number(res?.seq ?? res?.value?.seq ?? 1)
}

export async function listInvoiceCredits(invoiceId: string): Promise<CreditMemo[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('creditMemos', d).find({ invoice_id: invoiceId }).sort({ date: 1, created_at: 1 }).toArray()
  return rows.map((c) => ({ ...c, _id: String(c._id) })) as CreditMemo[]
}

/** Issue a credit memo against an invoice and apply it immediately: the balance
 *  drops (paid does not), the contra-revenue entry posts, and the status
 *  recomputes treating payments + credits together as settlement. */
export async function createCreditMemo(
  invoiceId: string,
  amount: Cents,
  date: string,
  opts: { memo?: string; created_by?: string } = {},
): Promise<{ credit: CreditMemo; invoice: Invoice }> {
  if (amount <= 0) throw new Error('Credit amount must be positive')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be ISO YYYY-MM-DD')

  return withTxn(async (session) => {
    const d = await getDb()
    const inv = await col('invoices', d).findOne({ _id: invoiceId }, { session })
    if (!inv) throw new Error(`No invoice ${invoiceId}`)
    if (inv.status === 'void') throw new Error('Cannot credit a void invoice')
    if (amount > inv.balance) throw new Error(`Credit exceeds the open balance (${inv.balance})`)

    const credited = ((inv.credited as number) ?? 0) + amount
    const newBalance = (inv.total as number) - (inv.paid as number) - credited
    const status = invoiceStatus(inv.total as Cents, cents((inv.paid as number) + credited))
    const year = Number(date.slice(0, 4))
    const number = await getNextCreditMemoNumber(year, session)
    const now = new Date().toISOString()
    const credit: CreditMemo = {
      _id: crypto.randomUUID(),
      invoice_id: invoiceId,
      customer_id: String(inv.customer_id),
      customer_name: inv.customer_name as string,
      year,
      number,
      date,
      amount,
      ...(opts.memo ? { memo: opts.memo } : {}),
      ...(opts.created_by ? { created_by: opts.created_by } : {}),
      created_at: now,
    }
    await col('creditMemos', d).insertOne(credit, { session })
    await col('invoices', d).updateOne(
      { _id: invoiceId },
      { $set: { credited, balance: newBalance, status, updated_at: now } },
      { session },
    )
    await postEntry(
      {
        date,
        memo: `Credit memo #${number} — Invoice #${inv.number}, ${inv.customer_name}`,
        source: 'credit-memo',
        source_ref: credit._id,
        lines: creditMemoJournalLines(amount, { subtotal: inv.subtotal as Cents, tax: inv.tax as Cents }),
        created_by: opts.created_by,
      },
      { session },
    )
    return { credit, invoice: { ...inv, _id: String(inv._id), credited, balance: newBalance, status } as Invoice }
  })
}

/** Void an un-settled invoice: reverse its journal entry (dated today, so a
 *  period lock on the original date doesn't block the correction) and mark it
 *  void. Anything with payments or credits must be unwound those ways first. */
export async function voidInvoice(invoiceId: string, opts: { created_by?: string } = {}): Promise<Invoice> {
  const d = await getDb()
  const inv = await col('invoices', d).findOne({ _id: invoiceId })
  if (!inv) throw new Error(`No invoice ${invoiceId}`)
  if (inv.status === 'void') return { ...inv, _id: String(inv._id) } as Invoice
  if ((inv.paid as number) > 0) throw new Error('Cannot void an invoice with payments — refund or credit it instead')
  if (((inv.credited as number) ?? 0) > 0) throw new Error('Cannot void an invoice with credit memos applied')

  const entry = await col('journalEntries', d).findOne({ source: 'invoice', source_ref: invoiceId })
  if (entry) {
    await postReversal(String(entry._id), {
      date: new Date().toISOString().slice(0, 10),
      memo: `Void — Invoice #${inv.number}, ${inv.customer_name}`,
      ...(opts.created_by ? { created_by: opts.created_by } : {}),
    })
  }
  const now = new Date().toISOString()
  await col('invoices', d).updateOne(
    { _id: invoiceId },
    { $set: { status: 'void', balance: 0, updated_at: now } },
  )
  return { ...inv, _id: String(inv._id), status: 'void', balance: 0 } as Invoice
}

/** One customer by id (statement endpoint). */
export async function getCustomer(id: string): Promise<Customer | null> {
  if (USE_MOCK) return null
  const d = await getDb()
  const c = await col('customers', d).findOne({ _id: id })
  return c ? ({ ...c, _id: String(c._id) } as Customer) : null
}

/** A customer's open/partial invoices, oldest due first — the statement body. */
export async function listCustomerOpenInvoices(customerId: string): Promise<Invoice[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('invoices', d)
    .find({ customer_id: customerId, status: { $in: ['open', 'partial'] } })
    .sort({ due_date: 1 })
    .toArray()
  return rows.map((i) => ({ ...i, _id: String(i._id) })) as Invoice[]
}
