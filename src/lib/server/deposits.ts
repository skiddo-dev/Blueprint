// Server-side bank deposits: group undeposited customer payments (sitting on
// 1050) into one posted Dr-bank entry — the single line the bank statement
// will show, so reconciliation auto-match works on batched checks.
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { withTxn } from './txn'
import { postEntry, postReversal } from './accounting'
import { writeAudit } from './audit'
import { depositJournalLines, depositTotal } from '$lib/accounting/deposits'
import { ACCT } from '$lib/accounting/invoicing'
import { usd } from '$lib/accounting/format'
import { cents, type Cents } from '$lib/money'
import type { Payment } from '$lib/accounting/types'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

export interface Deposit {
  _id: string
  account_id: string        // bank account the batch went into
  date: string
  memo?: string
  payment_ids: string[]
  payment_entry_ids: string[]
  total: Cents
  status: 'posted' | 'void'
  entry_id: string
  created_by?: string
  created_at: string
}

export type UndepositedPayment = Payment & { invoice_number?: number; invoice_year?: number; customer_name?: string }

/** Payments parked on 1050 and not yet grouped into a deposit, oldest first,
 *  with invoice context for the picker. */
export async function listUndepositedPayments(): Promise<UndepositedPayment[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const payments = (await col('payments', d)
    .find({ deposit_to: ACCT.undeposited, deposit_id: { $exists: false } })
    .sort({ date: 1, created_at: 1 })
    .toArray()) as Payment[]
  if (!payments.length) return []
  const invoiceIds = [...new Set(payments.map((p) => p.invoice_id))]
  const invoices = await col('invoices', d)
    .find({ _id: { $in: invoiceIds } }, { projection: { number: 1, year: 1, customer_name: 1 } })
    .toArray()
  const byId = new Map(invoices.map((i) => [String(i._id), i]))
  return payments.map((p) => {
    const inv = byId.get(p.invoice_id)
    return {
      ...p,
      _id: String(p._id),
      ...(inv ? { invoice_number: inv.number as number, invoice_year: inv.year as number, customer_name: inv.customer_name as string } : {}),
    }
  })
}

export async function listDeposits(limit = 50): Promise<Deposit[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('deposits', d).find({}).sort({ date: -1, created_at: -1 }).limit(limit).toArray()
  return rows.map((r) => ({ ...r, _id: String(r._id) })) as Deposit[]
}

/** Group undeposited payments into one posted deposit. Race-safe: the member
 *  payments are claimed atomically — if another deposit grabbed any of them
 *  first, the whole transaction aborts (and the claim rolls back with it). */
export async function createDeposit(input: {
  account_id: string
  date: string
  payment_ids: string[]
  memo?: string
  created_by?: string
}): Promise<Deposit> {
  if (!input.payment_ids.length) throw new Error('Pick at least one payment to deposit')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be ISO YYYY-MM-DD')
  const d = await getDb()
  const bank = await col('accounts', d).findOne({ _id: input.account_id })
  if (!bank || bank.subtype !== 'bank' || !bank.active) throw new Error('account_id must be an active bank account')

  return withTxn(async (session) => {
    const ids = [...new Set(input.payment_ids)]
    const payments = (await col('payments', d)
      .find({ _id: { $in: ids } }, { session })
      .toArray()) as Payment[]
    if (payments.length !== ids.length) throw new Error('Some payments no longer exist')
    for (const p of payments) {
      if (p.deposit_to !== ACCT.undeposited) throw new Error(`Payment ${p._id} is not in Undeposited Funds`)
      if (p.deposit_id) throw new Error('Some payments are already in another deposit')
    }
    const entries = await col('journalEntries', d)
      .find({ source: 'payment', source_ref: { $in: ids } }, { session })
      .toArray()
    if (entries.length !== ids.length) throw new Error('Missing journal entries for some payments')
    if (entries.some((e) => e.status !== 'posted' || e.reversed_by)) {
      throw new Error('Some payment entries are reversed — they cannot be deposited')
    }

    const deposit: Deposit = {
      _id: crypto.randomUUID(),
      account_id: input.account_id,
      date: input.date,
      ...(input.memo ? { memo: input.memo } : {}),
      payment_ids: ids,
      payment_entry_ids: entries.map((e) => String(e._id)),
      total: depositTotal(payments),
      status: 'posted',
      entry_id: '', // set below
      ...(input.created_by ? { created_by: input.created_by } : {}),
      created_at: new Date().toISOString(),
    }

    // Atomic claim — the guard against two deposits racing for one check.
    const claim = await col('payments', d).updateMany(
      { _id: { $in: ids }, deposit_id: { $exists: false } },
      { $set: { deposit_id: deposit._id } },
      { session },
    )
    if (claim.modifiedCount !== ids.length) throw new Error('Another deposit claimed one of these payments — refresh and retry')

    const entry = await postEntry(
      {
        date: input.date,
        memo: `Deposit — ${ids.length} payment${ids.length === 1 ? '' : 's'}, ${usd(deposit.total)}`,
        source: 'deposit',
        source_ref: deposit._id,
        lines: depositJournalLines(cents(deposit.total), input.account_id),
        created_by: input.created_by,
      },
      { session },
    )
    deposit.entry_id = entry._id
    await col('deposits', d).insertOne(deposit, { session })
    await writeAudit({
      actor: input.created_by ?? 'system',
      action: 'deposit.create',
      entity_type: 'deposit',
      entity_id: deposit._id,
      summary: `Deposit ${usd(deposit.total)} to ${input.account_id} (${ids.length} payment${ids.length === 1 ? '' : 's'})`,
    }, { session })
    return deposit
  })
}

/** Void a deposit: reverse its entry (dated today) and release the member
 *  payments back to the undeposited pool. Refused while the deposit's entry is
 *  reconciled — undo the reconciliation first. */
export async function voidDeposit(id: string, opts: { created_by?: string } = {}): Promise<Deposit> {
  const d = await getDb()
  const dep = await col('deposits', d).findOne({ _id: id })
  if (!dep) throw new Error(`No deposit ${id}`)
  if (dep.status === 'void') return { ...dep, _id: String(dep._id) } as Deposit

  const reconciled = await col('reconciliations', d).findOne({ cleared_entry_ids: dep.entry_id })
  if (reconciled) throw new Error('This deposit is reconciled — undo that reconciliation before voiding it')

  const reversal = await postReversal(String(dep.entry_id), {
    date: new Date().toISOString().slice(0, 10),
    memo: `Void deposit — ${usd(dep.total as number)} to ${dep.account_id}`,
    ...(opts.created_by ? { created_by: opts.created_by } : {}),
  })
  await col('payments', d).updateMany({ _id: { $in: dep.payment_ids } }, { $unset: { deposit_id: '' } })
  await col('deposits', d).updateOne({ _id: id }, { $set: { status: 'void' } })
  await writeAudit({
    actor: opts.created_by ?? 'system',
    action: 'deposit.void',
    entity_type: 'deposit',
    entity_id: id,
    summary: `Voided deposit ${usd(dep.total as number)} (${dep.date}) — payments returned to Undeposited Funds`,
    meta: { reversal_entry_id: reversal._id },
  })
  return { ...dep, _id: String(dep._id), status: 'void' } as Deposit
}
