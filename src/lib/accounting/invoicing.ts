// Pure invoicing/AR logic — no database. Totals, status, the journal lines an
// invoice and a payment post, and A/R aging. The server module
// (src/lib/server/invoicing.ts) persists; this is unit-tested in isolation.
import { type Cents, cents, sum as sumCents, mul, add } from '$lib/money'
import type { JournalLine } from './types'

// Ledger accounts the AR flow posts to (codes from the seeded chart of accounts).
export const ACCT = {
  cash: '1000',     // Cash — Operating
  ar: '1100',       // Accounts Receivable
  revenue: '4000',  // Contract Revenue
  salesTax: '2200', // Sales Tax Payable
} as const

export type InvoiceLineInput = { description: string; quantity: number; unit_price: Cents }
export type InvoiceLineComputed = InvoiceLineInput & { amount: Cents }

/** Extended amount for a line: unit price × quantity, rounded to the penny. */
export function lineAmount(line: InvoiceLineInput): Cents {
  return mul(line.unit_price, line.quantity)
}

/** Subtotal, tax, total for an invoice. `taxRatePct` is a percent (6 = 6%); 0 = none. */
export function invoiceTotals(
  lines: InvoiceLineInput[],
  taxRatePct = 0,
): { subtotal: Cents; tax: Cents; total: Cents; lines: InvoiceLineComputed[] } {
  const computed = lines.map((l) => ({ ...l, amount: lineAmount(l) }))
  const subtotal = sumCents(computed.map((l) => l.amount))
  const tax = taxRatePct ? mul(subtotal, taxRatePct / 100) : cents(0)
  return { subtotal, tax, total: add(subtotal, tax), lines: computed }
}

export type InvoiceStatus = 'open' | 'partial' | 'paid' | 'void'

/** Status implied by how much of `total` has been paid. (Void is set explicitly,
 *  not derived.) */
export function invoiceStatus(total: Cents, paid: Cents): InvoiceStatus {
  if (paid <= 0) return 'open'
  if (paid >= total) return 'paid'
  return 'partial'
}

/** Posting an invoice: Dr A/R (total) / Cr Revenue (subtotal) / Cr Sales Tax (tax).
 *  Balances because total === subtotal + tax. */
export function invoiceJournalLines(o: { total: Cents; subtotal: Cents; tax: Cents }): JournalLine[] {
  const lines: JournalLine[] = [
    { account_id: ACCT.ar, debit: o.total, credit: cents(0) },
    { account_id: ACCT.revenue, debit: cents(0), credit: o.subtotal },
  ]
  if (o.tax > 0) lines.push({ account_id: ACCT.salesTax, debit: cents(0), credit: o.tax })
  return lines
}

/** Receiving a payment: Dr Cash / Cr A/R. */
export function paymentJournalLines(amount: Cents): JournalLine[] {
  return [
    { account_id: ACCT.cash, debit: amount, credit: cents(0) },
    { account_id: ACCT.ar, debit: cents(0), credit: amount },
  ]
}

/** Whole days from one ISO date (YYYY-MM-DD) to another; positive if `to` is later. */
export function daysBetween(fromISO: string, toISO: string): number {
  const ms = Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)
  return Math.floor(ms / 86_400_000)
}

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+'
export const AGING_BUCKETS: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+']

/** Which aging bucket an invoice falls in, by days past its due date as of `asOf`. */
export function agingBucket(dueDateISO: string, asOfISO: string): AgingBucket {
  const overdue = daysBetween(dueDateISO, asOfISO) // > 0 means past due
  if (overdue <= 0) return 'current'
  if (overdue <= 30) return '1-30'
  if (overdue <= 60) return '31-60'
  if (overdue <= 90) return '61-90'
  return '90+'
}

// `name` is the party (customer for A/R, vendor for A/P) — the aging logic is the
// same for receivables and payables, so it's party-agnostic.
export type AgingInput = { _id: string; number: number; name: string; due_date: string; balance: Cents }
export type AgingRow = AgingInput & { bucket: AgingBucket }

/** Bucket a set of open documents (invoices or bills) by age and total each bucket. */
export function buildAging(
  open: AgingInput[],
  asOfISO: string,
): { buckets: Record<AgingBucket, Cents>; total: Cents; rows: AgingRow[] } {
  const totals = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>
  const rows: AgingRow[] = open.map((inv) => {
    const bucket = agingBucket(inv.due_date, asOfISO)
    totals[bucket] += inv.balance
    return { ...inv, bucket }
  })
  const buckets = Object.fromEntries(
    AGING_BUCKETS.map((b) => [b, cents(totals[b])]),
  ) as Record<AgingBucket, Cents>
  return { buckets, total: sumCents(AGING_BUCKETS.map((b) => buckets[b])), rows }
}

/** Total balance due on or before `asOf + days` — overdue items included, since
 *  they're also money that must move this week. Feeds the hub's urgency chips. */
export function dueWithin(rows: { due_date: string; balance: Cents }[], asOfISO: string, days: number): Cents {
  return cents(rows.reduce((t, r) => t + (daysBetween(r.due_date, asOfISO) >= -days ? r.balance : 0), 0))
}

/** Due date = issue date + net terms (days), as an ISO YYYY-MM-DD string. */
export function dueDate(issueISO: string, netDays: number): string {
  const d = new Date(`${issueISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + netDays)
  return d.toISOString().slice(0, 10)
}
