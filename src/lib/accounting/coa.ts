import type { Account } from './types'

// A starter chart of accounts for a commercial remodel/construction contractor
// (RAVES). Codes follow the conventional banding — 1000s assets, 2000s
// liabilities, 3000s equity, 4000s income, 5000s cost of goods sold (job costs),
// 6000s operating expenses. Seeded once by migration 0004; the office manager can
// add or deactivate accounts afterward. Contra accounts (accumulated
// depreciation, owner's draw, sales discounts) carry the opposite normal balance
// of their section, which is why `normal` is stated explicitly per account.
type Seed = Omit<Account, '_id' | 'active'> // _id := code, active := true

const SEED: Seed[] = [
  // ── Assets (debit-normal) ──
  { code: '1000', name: 'Cash — Operating', type: 'asset', normal: 'debit', subtype: 'bank' },
  { code: '1010', name: 'Cash — Payroll', type: 'asset', normal: 'debit', subtype: 'bank' },
  { code: '1050', name: 'Undeposited Funds', type: 'asset', normal: 'debit', subtype: 'undeposited' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', normal: 'debit', subtype: 'receivable' },
  { code: '1200', name: 'Retainage Receivable', type: 'asset', normal: 'debit', subtype: 'receivable' },
  { code: '1300', name: 'Costs in Excess of Billings (WIP)', type: 'asset', normal: 'debit', subtype: 'current-asset' },
  { code: '1400', name: 'Prepaid Expenses', type: 'asset', normal: 'debit', subtype: 'current-asset' },
  { code: '1500', name: 'Vehicles & Equipment', type: 'asset', normal: 'debit', subtype: 'fixed-asset' },
  { code: '1510', name: 'Accumulated Depreciation', type: 'asset', normal: 'credit', subtype: 'fixed-asset', contra: true },

  // ── Liabilities (credit-normal) ──
  { code: '2000', name: 'Accounts Payable', type: 'liability', normal: 'credit', subtype: 'payable' },
  { code: '2050', name: 'Retainage Payable', type: 'liability', normal: 'credit', subtype: 'payable' },
  { code: '2100', name: 'Accrued Expenses', type: 'liability', normal: 'credit', subtype: 'current-liability' },
  { code: '2200', name: 'Sales Tax Payable', type: 'liability', normal: 'credit', subtype: 'current-liability' },
  { code: '2300', name: 'Billings in Excess of Costs', type: 'liability', normal: 'credit', subtype: 'current-liability' },
  { code: '2400', name: 'Credit Card Payable', type: 'liability', normal: 'credit', subtype: 'current-liability' },
  { code: '2500', name: 'Payroll Liabilities', type: 'liability', normal: 'credit', subtype: 'current-liability' },
  { code: '2600', name: 'Loans Payable', type: 'liability', normal: 'credit', subtype: 'long-term-liability' },

  // ── Equity (credit-normal) ──
  { code: '3000', name: "Owner's Equity", type: 'equity', normal: 'credit' },
  { code: '3100', name: 'Retained Earnings', type: 'equity', normal: 'credit' },
  { code: '3200', name: "Owner's Draw", type: 'equity', normal: 'debit', contra: true },

  // ── Income (credit-normal) ──
  { code: '4000', name: 'Contract Revenue', type: 'income', normal: 'credit', subtype: 'revenue' },
  { code: '4010', name: 'Change Order Revenue', type: 'income', normal: 'credit', subtype: 'revenue' },
  { code: '4020', name: 'Service & T&M Revenue', type: 'income', normal: 'credit', subtype: 'revenue' },
  { code: '4900', name: 'Sales Discounts & Credits', type: 'income', normal: 'debit', subtype: 'revenue', contra: true },

  // ── Cost of goods sold / job costs (debit-normal) ──
  { code: '5000', name: 'Job Materials', type: 'expense', normal: 'debit', subtype: 'cogs' },
  { code: '5010', name: 'Subcontractor Costs', type: 'expense', normal: 'debit', subtype: 'cogs' },
  { code: '5020', name: 'Job Labor', type: 'expense', normal: 'debit', subtype: 'cogs' },
  { code: '5030', name: 'Equipment Rental', type: 'expense', normal: 'debit', subtype: 'cogs' },
  { code: '5040', name: 'Permits & Inspection Fees', type: 'expense', normal: 'debit', subtype: 'cogs' },

  // ── Operating expenses (debit-normal) ──
  { code: '6000', name: 'Salaries & Wages', type: 'expense', normal: 'debit', subtype: 'opex' },
  { code: '6010', name: 'Payroll Taxes', type: 'expense', normal: 'debit', subtype: 'opex' },
  { code: '6100', name: 'Rent', type: 'expense', normal: 'debit', subtype: 'opex' },
  { code: '6110', name: 'Utilities', type: 'expense', normal: 'debit', subtype: 'opex' },
  { code: '6120', name: 'Insurance', type: 'expense', normal: 'debit', subtype: 'opex' },
  { code: '6130', name: 'Vehicle & Fuel', type: 'expense', normal: 'debit', subtype: 'opex' },
  { code: '6140', name: 'Office & Admin', type: 'expense', normal: 'debit', subtype: 'opex' },
  { code: '6150', name: 'Professional Fees', type: 'expense', normal: 'debit', subtype: 'opex' },
  { code: '6160', name: 'Depreciation Expense', type: 'expense', normal: 'debit', subtype: 'opex' },
  { code: '6900', name: 'Bank & Merchant Fees', type: 'expense', normal: 'debit', subtype: 'opex' },
]

export const DEFAULT_CHART_OF_ACCOUNTS: Account[] = SEED.map((a) => ({
  ...a,
  _id: a.code,
  active: true,
}))

/** The normal balance a non-contra account of the given type should carry.
 *  Exported so the seed's integrity is unit-tested against it. */
export function expectedNormal(type: Account['type']): Account['normal'] {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit'
}

/** Accounts whose balance is "cash" for the cash-flow statement and the hub's
 *  cash sparkline: real bank accounts plus Undeposited Funds (checks received
 *  but not yet deposited ARE cash on hand). Reconciliation deliberately does
 *  NOT use this — you reconcile real bank accounts (subtype 'bank') only. */
export function isCashLike(a: Pick<import('./types').Account, 'subtype'>): boolean {
  return a.subtype === 'bank' || a.subtype === 'undeposited'
}
