import type { Cents } from '$lib/money'

// ── Chart of accounts ─────────────────────────────────────────────────────────
export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'
export type NormalBalance = 'debit' | 'credit'

export interface Account {
  _id: string            // === code; stable natural key (mirrors users._id = email)
  code: string           // e.g. "1100"
  name: string           // e.g. "Accounts Receivable"
  type: AccountType
  normal: NormalBalance  // the side that increases this account
  subtype?: string       // free-form grouping for reports, e.g. "bank", "cogs"
  contra?: boolean       // true for contra accounts (accum. depreciation, discounts)
  active: boolean
  description?: string
}

// ── Double-entry journal ───────────────────────────────────────────────────────
export type JournalSource = 'manual' | 'invoice' | 'payment' | 'bill' | 'bill-payment' | 'closing' | 'credit-memo' | 'vendor-credit' | 'expense' | 'sales-tax-remittance'

// One leg of an entry. Exactly one of debit/credit is > 0; the other is 0.
export interface JournalLine {
  account_id: string     // → Account._id (code)
  debit: Cents
  credit: Cents
  memo?: string
}

// A posted journal entry — the atomic unit of the ledger. Stored as ONE document
// with its lines embedded, so a post commits atomically even without a multi-doc
// transaction, and sum(debit) === sum(credit) is enforced before insert. Posted
// entries are immutable: corrections are reversing entries, never edits.
export interface JournalEntry {
  _id: string
  date: string           // ISO YYYY-MM-DD — the accounting date
  period: string         // "YYYY-MM", derived from date; the unit period-close locks
  memo?: string
  source: JournalSource
  source_ref?: string    // id of the originating doc (invoice/payment/…); idempotency key
  job?: string           // job/project tag on document-less postings (quick expenses)
  lines: JournalLine[]
  status: 'posted' | 'void'
  reverses?: string      // _id of the entry this one reverses
  reversed_by?: string   // _id of the entry that reversed this one
  created_by?: string
  created_at: string
}

// What postEntry accepts; the server fills _id / period / status / created_at.
export interface JournalEntryInput {
  job?: string
  date: string
  memo?: string
  source: JournalSource
  source_ref?: string
  lines: JournalLine[]
  created_by?: string
}

// ── Accounts receivable (Phase 2) ─────────────────────────────────────────────
// A bill-to party. Created on demand from the invoice form (matched
// case-insensitively on name_lower). `_id` is a uuid (names aren't stable keys).
export interface Customer {
  _id: string
  name: string
  name_lower: string // lowercased name, for case-insensitive find-or-create + index
  email?: string
  created_at: string
}

export interface InvoiceLine {
  description: string
  quantity: number
  unit_price: Cents
  amount: Cents       // unit_price × quantity
}

// A customer invoice. Posting it books Dr A/R / Cr Revenue (+ Cr Sales Tax) via a
// journal entry keyed on the invoice id, in the same transaction as the insert.
// `customer_name` is denormalized so lists/aging don't need a join. Immutable
// money once posted; payments reduce `balance` and advance `status`.
export interface Invoice {
  _id: string
  number: number          // sequential per year
  year: number
  customer_id: string
  customer_name: string
  issue_date: string      // ISO YYYY-MM-DD
  due_date: string        // issue_date + net terms
  lines: InvoiceLine[]
  subtotal: Cents
  tax_rate: number        // percent (6 = 6%); 0 = none
  tax: Cents
  total: Cents
  paid: Cents
  credited?: Cents       // total credit memos applied (reduce balance, not paid)
  job?: string           // free-text job/project tag — feeds the job P&L report
  balance: Cents          // total − paid
  status: 'open' | 'partial' | 'paid' | 'void'
  po?: string
  quote_id?: string       // the won quote this invoice was created from, if any
  memo?: string
  created_by?: string
  created_at: string
  updated_at?: string
}

// A payment received against an invoice. Posting it books Dr Cash / Cr A/R.
export interface Payment {
  _id: string
  invoice_id: string
  amount: Cents
  date: string            // ISO YYYY-MM-DD
  method?: string         // free-form: "check", "ACH", …
  created_by?: string
  created_at: string
}

// ── Accounts payable (Phase 3) ────────────────────────────────────────────────
// A vendor/supplier/subcontractor we owe. Mirror of Customer.
export interface Vendor {
  _id: string
  name: string
  name_lower: string
  email?: string
  is_1099?: boolean // payments to this vendor count toward a 1099-NEC
  tax_id?: string   // EIN/SSN for the 1099 form (display-masked in the UI)
  created_at: string
}

// A bill line is a cost categorized to an expense/COGS account — its debit side.
// (Unlike an invoice line, the account varies per line: job materials, subs, etc.)
export interface BillLine {
  account_id: string  // → Account._id; an expense/COGS account (the debit)
  description: string
  amount: Cents
}

// A vendor bill (money we owe). Posting it books Dr <expense/COGS per line> /
// Cr Accounts Payable, in the same transaction as the insert. Mirror of Invoice;
// payments reduce `balance` and advance `status`.
export interface Bill {
  _id: string
  number: number          // internal sequential reference, per year
  year: number
  vendor_id: string
  vendor_name: string
  bill_date: string       // ISO YYYY-MM-DD
  due_date: string
  lines: BillLine[]
  total: Cents            // sum of line amounts
  paid: Cents
  credited?: Cents       // total credit memos applied (reduce balance, not paid)
  job?: string           // free-text job/project tag — feeds the job P&L report
  balance: Cents
  status: 'open' | 'partial' | 'paid' | 'void'
  vendor_invoice_no?: string // the vendor's own invoice number
  po?: string
  memo?: string
  created_by?: string
  created_at: string
  updated_at?: string
}

// A payment we made against a bill. Posting it books Dr A/P / Cr Cash.
export interface BillPayment {
  _id: string
  bill_id: string
  amount: Cents
  date: string
  method?: string
  created_by?: string
  created_at: string
}

// ── Trial balance ───────────────────────────────────────────────────────────────
// One row per account that has postings: total debits, total credits, and the
// signed net in the debit direction (net > 0 lands in the debit column of the
// report, net < 0 in the credit column). The grand total debit must equal the
// grand total credit — the whole ledger always balances.
export interface TrialBalanceRow {
  account_id: string
  debit: Cents
  credit: Cents
  net: Cents             // debit − credit
}

// A credit memo issued against an invoice (and its A/P mirror against a bill).
// v1 credits apply on creation — no unapplied credit balances to track.
export interface CreditMemo {
  _id: string
  invoice_id: string
  customer_id: string
  customer_name: string
  year: number
  number: number         // per-year sequence from the counters collection
  date: string           // ISO YYYY-MM-DD
  amount: Cents          // ≤ the invoice balance at issue time
  memo?: string
  created_by?: string
  created_at: string
}

export interface VendorCredit {
  _id: string
  bill_id: string
  vendor_id: string
  vendor_name: string
  year: number
  number: number
  date: string
  amount: Cents
  memo?: string
  created_by?: string
  created_at: string
}

// A recurring-transaction template: the engine materializes a real invoice /
// bill / journal entry each time next_date comes due, then advances it.
import type { RecurrenceCadence } from './recurring'

export interface RecurringTemplate {
  _id: string
  type: 'invoice' | 'bill' | 'journal'
  name: string
  cadence: RecurrenceCadence
  next_date: string        // ISO YYYY-MM-DD — the next occurrence to post
  end_date?: string        // stop after this date (inclusive)
  payload: unknown         // parsed create-input for the type (amounts in cents)
  active: boolean
  last_run?: string        // ISO timestamp of the last engine attempt
  last_result?: string     // 'ok: <doc ref>' or the error message
  created_by?: string
  created_at: string
}
