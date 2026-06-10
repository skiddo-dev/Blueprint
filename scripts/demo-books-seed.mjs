#!/usr/bin/env node
// Seed DEMO books into Blueprint Books through the app's own APIs, so every
// document is canonical (numbering, balances, journal entries, customers and
// vendors all created exactly as real usage would).
//
// Intended for showing a client what a completed set of books looks like.
// REFUSES to run if the books already contain data — it never mixes demo rows
// into real bookkeeping. The paired scripts/demo-books-clear.mjs wipes
// everything this creates (it clears the accounting collections wholesale,
// which is only safe while the books are demo-only).
//
// Usage:
//   node scripts/demo-books-seed.mjs [base-url]
// against a RUNNING app (default http://localhost:5192). Point a local dev
// server (DEV_FAKE_AUTH=true) at the target database first; the script only
// talks HTTP, so auth and storage are whatever that server is wired to.

const BASE = process.argv[2] ?? 'http://localhost:5192'
const TAG = '[DEMO]'

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${await r.text()}`)
  const text = await r.text()
  try { return JSON.parse(text) } catch { return text }
}
const post = (path, body) => api('POST', path, body)

// ── Safety: never seed on top of real books ───────────────────────────────────
const existing = await api('GET', '/api/accounting/invoices')
if (Array.isArray(existing) && existing.length > 0) {
  console.error(`Refusing to seed: the books already contain ${existing.length} invoice(s).`)
  console.error('Demo data must only go into empty books. Clear first (scripts/demo-books-clear.mjs) if these are demo rows.')
  process.exit(1)
}

// ── Six months of operating activity (collections + job costs) ───────────────
// Direct cash entries carry the bulk of the trend; invoices/bills below add
// the working A/R + A/P on top.
const MONTHS = [
  ['2026-01', 38000, 29000],
  ['2026-02', 42000, 33000],
  ['2026-03', 51000, 37000],
  ['2026-04', 45000, 35000],
  ['2026-05', 58000, 41000],
  ['2026-06', 31000, 22000],
]
for (const [m, rev, exp] of MONTHS) {
  const cogs = Math.round(exp * 0.7)
  const opex = exp - cogs
  await post('/api/accounting/journal', {
    date: `${m}-10`,
    memo: `${TAG} Progress billings collected ${m}`,
    lines: [
      { account_id: '1000', debit: String(rev), credit: '' },
      { account_id: '4000', debit: '', credit: String(rev) },
    ],
  })
  await post('/api/accounting/journal', {
    date: `${m}-20`,
    memo: `${TAG} Job costs ${m}`,
    lines: [
      { account_id: '5000', debit: String(cogs), credit: '' },
      { account_id: '6100', debit: String(opex), credit: '' },
      { account_id: '1000', debit: '', credit: String(exp) },
    ],
  })
  console.log(`journal ${m}: revenue ${rev}, costs ${exp}`)
}

// ── Invoices: a realistic mix of paid / partial / open / overdue ──────────────
const invoice = (body) => post('/api/accounting/invoices', { net_days: 30, memo: `${TAG} seeded books`, ...body })
const payInvoice = (id, amount, date, method) =>
  post(`/api/accounting/invoices/${id}/payments`, { amount, date, method })

const INVOICES = [
  { customer_name: 'Oakland Schools', issue_date: '2026-01-15', lines: [{ description: 'District boardroom AV refresh', quantity: 1, unit_price: '14200' }], pay: [['14200', '2026-02-10', 'ACH']] },
  { customer_name: 'Beaumont Health', issue_date: '2026-02-12', lines: [{ description: 'Wayfinding displays — Royal Oak campus', quantity: 1, unit_price: '22500' }], pay: [['22500', '2026-03-08', 'check #2214']] },
  { customer_name: 'Troy Community Center', issue_date: '2026-03-05', lines: [{ description: 'Gymnasium sound system', quantity: 1, unit_price: '9800' }], pay: [['9800', '2026-04-01', 'ACH']] },
  { customer_name: 'Somerset Collection', issue_date: '2026-04-10', lines: [{ description: 'Concourse digital directory units', quantity: 4, unit_price: '4600' }], pay: [['18400', '2026-05-06', 'ACH']] },
  { customer_name: 'Oakland Schools', issue_date: '2026-04-20', lines: [{ description: 'Auditorium AV retrofit — phase 1', quantity: 1, unit_price: '5460' }], pay: [] }, // overdue
  { customer_name: 'Troy Community Center', issue_date: '2026-05-22', lines: [{ description: 'Conference room build-out', quantity: 1, unit_price: '8000' }], pay: [['4800', '2026-06-05', 'ACH']] }, // partial
  { customer_name: 'Pistons Performance Center', issue_date: '2026-05-28', lines: [{ description: 'Training floor video wall', quantity: 1, unit_price: '16750' }], pay: [] },
  { customer_name: 'Beaumont Health', issue_date: '2026-06-08', lines: [{ description: 'Digital signage rollout — 12 displays', quantity: 12, unit_price: '1070' }], pay: [] },
]
for (const { pay, ...body } of INVOICES) {
  const inv = await invoice(body)
  for (const [amount, date, method] of pay) await payInvoice(inv._id, amount, date, method)
  console.log(`invoice ${inv.year}-${String(inv.number).padStart(4, '0')} ${body.customer_name} (${pay.length ? 'payments: ' + pay.length : 'open'})`)
}

// ── Bills: paid history + current payables (one due within a week) ───────────
const bill = (body) => post('/api/accounting/bills', { net_days: 30, memo: `${TAG} seeded books`, ...body })
const payBill = (id, amount, date, method) =>
  post(`/api/accounting/bills/${id}/payments`, { amount, date, method })

const BILLS = [
  { vendor_name: 'Motor City Electric', bill_date: '2026-02-03', lines: [{ account_id: '5010', description: 'Electrical rough-in — district boardroom', amount: '6900' }], pay: [['6900', '2026-02-25', 'check #1101']] },
  { vendor_name: 'Sound Productions', bill_date: '2026-03-10', lines: [{ account_id: '5000', description: 'Gym speaker arrays + rigging', amount: '4150' }], pay: [['4150', '2026-04-02', 'ACH']] },
  { vendor_name: 'Madison Heights Steel', bill_date: '2026-04-07', lines: [{ account_id: '5000', description: 'Directory unit mounting frames', amount: '7300' }], pay: [['7300', '2026-05-01', 'check #1118']] },
  { vendor_name: 'Motor City Electric', bill_date: '2026-05-14', lines: [{ account_id: '5010', description: 'Subcontract — low-voltage rough-in', amount: '4200' }], pay: [] }, // due soon
  { vendor_name: 'Sound Productions', bill_date: '2026-06-05', lines: [{ account_id: '5000', description: 'Speakers + mounts', amount: '2750' }], pay: [] },
  { vendor_name: 'Crestwood Permits & Inspection', bill_date: '2026-06-02', lines: [{ account_id: '5040', description: 'Inspection fees — video wall install', amount: '980' }], pay: [] },
]
for (const { pay, ...body } of BILLS) {
  const b = await bill(body)
  for (const [amount, date, method] of pay) await payBill(b._id, amount, date, method)
  console.log(`bill ${b.year}-${String(b.number).padStart(4, '0')} ${body.vendor_name} (${pay.length ? 'paid' : 'open'})`)
}

// ── Period close: lock through Q1 so the close feature shows ─────────────────
await post('/api/accounting/close', { through: '2026-03-31' })
console.log('period locked through 2026-03-31')

console.log('\nDemo books seeded. Clear with: node scripts/demo-books-clear.mjs --yes')
