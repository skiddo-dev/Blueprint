// Pure cash-basis transform — no database. Rewrites the accrual ledger into a
// virtual cash-basis ledger: revenue recognized when customer payments arrive,
// expenses when bills are paid, everything proportional via penny-safe
// allocate(). The output is balanced virtual entries, safe to feed any balance
// fold — so the income statement AND balance sheet both get a cash view from
// one mechanism.
//
// Modified cash basis, the way QuickBooks does it: manual journal entries,
// quick expenses, depreciation/disposals, deposits and tax remittances pass
// through at their own dates (deposits/remittances are balance-sheet-only
// moves between cash-like and liability accounts, so passing them through
// keeps the cash balance sheet honest).
//
// On the cash-basis BALANCE SHEET, exclude closing entries (their amounts are
// accrual-derived); cumulative cash net income then rides the statement's
// "Net income (current period)" equity line and the sheet balances because
// every virtual entry balances by construction. A/R and A/P read ~0 — the
// expected cash-basis presentation.
import { allocate, cents, type Cents } from '$lib/money'
import type { Bill, BillPayment, Invoice, JournalEntry, JournalLine, Payment } from './types'
import { ACCT } from './invoicing'
import { periodOf } from './ledger'
import type { Balance } from './statements'

/** Sources whose entries are REPLACED by payment-driven virtual entries.
 *  Dropping by source also drops void reversals (reversals keep their source —
 *  see buildReversingEntry), which is exactly right: a voided invoice never
 *  produced cash. */
const DROP: ReadonlySet<string> = new Set([
  'invoice', 'credit-memo', 'bill', 'vendor-credit', 'payment', 'bill-payment',
])

export interface CashBasisInputs {
  entries: JournalEntry[]      // ALL posted entries dated ≤ the report end
  payments: Payment[]          // customer payments dated ≤ the report end
  billPayments: BillPayment[]  // bill payments dated ≤ the report end
  invoices: Map<string, Pick<Invoice, 'subtotal' | 'tax' | 'number'>>
  bills: Map<string, Pick<Bill, 'lines' | 'number'>>
}

/** The accrual ledger re-expressed on a cash basis as virtual entries. Pure;
 *  every returned entry balances. Callers fold them with balancesFromEntries. */
export function cashBasisEntries(i: CashBasisInputs): JournalEntry[] {
  const out: JournalEntry[] = []

  // 1) Pass-throughs: anything not driven by AR/AP documents.
  for (const e of i.entries) {
    if (e.status !== 'posted') continue
    if (!DROP.has(e.source)) out.push(e)
  }

  // Index the real payment entries: the bank side (debit account) and
  // reversal state come from them.
  const paymentEntry = new Map<string, JournalEntry>()
  const billPaymentEntry = new Map<string, JournalEntry>()
  for (const e of i.entries) {
    if (e.status !== 'posted' || !e.source_ref) continue
    if (e.source === 'payment') paymentEntry.set(e.source_ref, e)
    else if (e.source === 'bill-payment') billPaymentEntry.set(e.source_ref, e)
  }

  // 2) Customer payments → Dr bank / Cr revenue (+ Cr sales tax pro-rata).
  for (const p of i.payments) {
    const real = paymentEntry.get(p._id)
    if (!real || real.reversed_by) continue // reversed payment = cash returned, nets to nothing
    const bank = real.lines.find((l) => l.debit > 0)?.account_id ?? ACCT.cash
    const inv = i.invoices.get(p.invoice_id)
    let revenue: Cents = p.amount
    let tax: Cents = cents(0)
    if (inv && inv.tax > 0) {
      // Recognize this payment's revenue:tax split in the invoice's own
      // proportion — penny-safe, sums exactly to the cash received.
      ;[revenue, tax] = allocate(p.amount, [inv.subtotal, inv.tax])
    }
    const lines: JournalLine[] = [
      { account_id: bank, debit: p.amount, credit: cents(0) },
      { account_id: ACCT.revenue, debit: cents(0), credit: revenue },
    ]
    if (tax > 0) lines.push({ account_id: ACCT.salesTax, debit: cents(0), credit: tax })
    out.push(virtual(`cb:payment:${p._id}`, p.date, 'payment',
      `Cash basis — payment on Invoice #${inv?.number ?? '?'}`, lines))
  }

  // 3) Bill payments → Dr the bill's expense accounts pro-rata / Cr bank.
  for (const bp of i.billPayments) {
    const real = billPaymentEntry.get(bp._id)
    if (!real || real.reversed_by) continue
    const bank = real.lines.find((l) => l.credit > 0)?.account_id ?? ACCT.cash
    const bill = i.bills.get(bp.bill_id)
    let lines: JournalLine[]
    if (bill && bill.lines.length) {
      const shares = allocate(bp.amount, bill.lines.map((l) => l.amount))
      lines = bill.lines
        .map((l, idx) => ({ account_id: l.account_id, debit: shares[idx], credit: cents(0) }))
        .filter((l) => l.debit > 0)
    } else {
      // Bill missing (data gap) — recognize as uncategorized opex rather than 500.
      lines = [{ account_id: '6140', debit: bp.amount, credit: cents(0) }]
    }
    lines.push({ account_id: bank, debit: cents(0), credit: bp.amount })
    out.push(virtual(`cb:bill-payment:${bp._id}`, bp.date, 'bill-payment',
      `Cash basis — payment on Bill #${bill?.number ?? '?'}`, lines))
  }

  return out
}

function virtual(id: string, date: string, source: JournalEntry['source'], memo: string, lines: JournalLine[]): JournalEntry {
  return {
    _id: id, date, period: periodOf(date), memo, source, lines,
    status: 'posted', created_at: `${date}T00:00:00.000Z`,
  }
}

/** Pure fold mirroring getLedgerBalances over an in-memory entry list. */
export function balancesFromEntries(
  entries: JournalEntry[],
  opts: { from?: string; to?: string; excludeClosing?: boolean } = {},
): Balance[] {
  const byAccount = new Map<string, { debit: number; credit: number }>()
  for (const e of entries) {
    if (e.status !== 'posted') continue
    if (opts.from && e.date < opts.from) continue
    if (opts.to && e.date > opts.to) continue
    if (opts.excludeClosing && e.source === 'closing') continue
    for (const l of e.lines) {
      const b = byAccount.get(l.account_id) ?? { debit: 0, credit: 0 }
      b.debit += l.debit
      b.credit += l.credit
      byAccount.set(l.account_id, b)
    }
  }
  return [...byAccount.entries()].map(([account_id, b]) => ({
    account_id, debit: cents(b.debit), credit: cents(b.credit),
  }))
}
