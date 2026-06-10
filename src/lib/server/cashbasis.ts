// Server-side cash-basis balances: loads everything dated up to the report end
// (entries, payments, bill payments, and the invoices/bills they reference),
// runs the pure cash-basis transform, and folds balances. In-memory join by
// design — a small business's books are thousands of entries, not millions,
// and the transform needs cross-document context a pipeline can't express
// cleanly. The `from` bound applies at the FOLD, not the fetch: a January
// invoice paid in March must contribute to a March-only P&L.
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { cashBasisEntries, balancesFromEntries } from '$lib/accounting/cashbasis'
import type { Balance } from '$lib/accounting/statements'
import type { Bill, BillPayment, Invoice, JournalEntry, Payment } from '$lib/accounting/types'
import { listPostedEntries } from './accounting'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

export async function getCashBasisBalances(
  opts: { from?: string; to?: string; excludeClosing?: boolean } = {},
): Promise<Balance[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const dateCap = opts.to ? { date: { $lte: opts.to } } : {}
  const [entries, payments, billPayments] = await Promise.all([
    listPostedEntries(opts.to ? { to: opts.to } : {}),
    col('payments', d).find(dateCap).toArray() as Promise<Payment[]>,
    col('billPayments', d).find(dateCap).toArray() as Promise<BillPayment[]>,
  ])
  const invoiceIds = [...new Set(payments.map((p) => p.invoice_id))]
  const billIds = [...new Set(billPayments.map((p) => p.bill_id))]
  const [invoices, bills] = await Promise.all([
    invoiceIds.length
      ? (col('invoices', d).find({ _id: { $in: invoiceIds } }, { projection: { subtotal: 1, tax: 1, number: 1 } }).toArray() as Promise<Invoice[]>)
      : Promise.resolve([] as Invoice[]),
    billIds.length
      ? (col('bills', d).find({ _id: { $in: billIds } }, { projection: { lines: 1, number: 1 } }).toArray() as Promise<Bill[]>)
      : Promise.resolve([] as Bill[]),
  ])
  const virtual = cashBasisEntries({
    entries: entries as JournalEntry[],
    payments: payments.map((p) => ({ ...p, _id: String(p._id) })),
    billPayments: billPayments.map((p) => ({ ...p, _id: String(p._id) })),
    invoices: new Map(invoices.map((i) => [String(i._id), { subtotal: i.subtotal, tax: i.tax, number: i.number }])),
    bills: new Map(bills.map((b) => [String(b._id), { lines: b.lines, number: b.number }])),
  })
  return balancesFromEntries(virtual, opts)
}
