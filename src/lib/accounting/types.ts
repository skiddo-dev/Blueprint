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
export type JournalSource = 'manual' | 'invoice' | 'payment' | 'bill' | 'bill-payment'

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
  lines: JournalLine[]
  status: 'posted' | 'void'
  reverses?: string      // _id of the entry this one reverses
  reversed_by?: string   // _id of the entry that reversed this one
  created_by?: string
  created_at: string
}

// What postEntry accepts; the server fills _id / period / status / created_at.
export interface JournalEntryInput {
  date: string
  memo?: string
  source: JournalSource
  source_ref?: string
  lines: JournalLine[]
  created_by?: string
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
