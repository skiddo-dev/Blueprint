// Server-side sales-tax operations: the monthly report over 2200 activity and
// the remittance lifecycle (record → posted entry; void → reversal dated today,
// matching the voidInvoice convention so period locks never block a correction).
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { withTxn } from './txn'
import { postEntry, postReversal, listPostedEntries, getAccounts } from './accounting'
import { writeAudit } from './audit'
import { salesTaxSummary, remittanceJournalLines, SALES_TAX_ACCT, type SalesTaxMonth } from '$lib/accounting/salesTax'
import { usd } from '$lib/accounting/format'
import type { Cents } from '$lib/money'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

export interface SalesTaxRemittance {
  _id: string
  date: string
  amount: Cents
  account_id: string // bank account the remittance was paid from
  memo?: string
  status: 'posted' | 'void'
  entry_id: string
  created_by?: string
  created_at: string
}

/** Monthly collected/credited/remitted view + current 2200 balance. */
export async function getSalesTaxReport(): Promise<{ months: SalesTaxMonth[]; balance: Cents }> {
  const entries = await listPostedEntries({ account: SALES_TAX_ACCT })
  return salesTaxSummary(entries)
}

export async function listRemittances(): Promise<SalesTaxRemittance[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('salesTaxRemittances', d).find({}).sort({ date: -1, created_at: -1 }).toArray()
  return rows.map((r) => ({ ...r, _id: String(r._id) })) as SalesTaxRemittance[]
}

/** Record a remittance: insert the doc and post Dr 2200 / Cr bank together. */
export async function recordRemittance(input: {
  date: string
  amount: Cents
  account_id: string
  memo?: string
  created_by?: string
}): Promise<SalesTaxRemittance> {
  if (input.amount <= 0) throw new Error('Remittance amount must be positive')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be ISO YYYY-MM-DD')
  const bank = (await getAccounts()).find((a) => a._id === input.account_id)
  if (!bank || bank.subtype !== 'bank' || !bank.active) throw new Error('account_id must be an active bank account')

  return withTxn(async (session) => {
    const d = await getDb()
    const rem: SalesTaxRemittance = {
      _id: crypto.randomUUID(),
      date: input.date,
      amount: input.amount,
      account_id: input.account_id,
      ...(input.memo ? { memo: input.memo } : {}),
      status: 'posted',
      entry_id: '', // filled below once the entry exists
      ...(input.created_by ? { created_by: input.created_by } : {}),
      created_at: new Date().toISOString(),
    }
    const entry = await postEntry(
      {
        date: input.date,
        memo: `Sales tax remittance — ${usd(input.amount)}${input.memo ? ` (${input.memo})` : ''}`,
        source: 'sales-tax-remittance',
        source_ref: rem._id,
        lines: remittanceJournalLines(input.amount, input.account_id),
        created_by: input.created_by,
      },
      { session },
    )
    rem.entry_id = entry._id
    await col('salesTaxRemittances', d).insertOne(rem, { session })
    await writeAudit({
      actor: input.created_by ?? 'system',
      action: 'sales-tax.remit',
      entity_type: 'sales-tax-remittance',
      entity_id: rem._id,
      summary: `Sales tax remittance ${usd(input.amount)} from ${input.account_id} on ${input.date}`,
    }, { session })
    return rem
  })
}

/** Void a remittance: reverse its entry (dated today) and mark the doc void. */
export async function voidRemittance(id: string, opts: { created_by?: string } = {}): Promise<SalesTaxRemittance> {
  const d = await getDb()
  const rem = await col('salesTaxRemittances', d).findOne({ _id: id })
  if (!rem) throw new Error(`No remittance ${id}`)
  if (rem.status === 'void') return { ...rem, _id: String(rem._id) } as SalesTaxRemittance

  const reversal = await postReversal(String(rem.entry_id), {
    date: new Date().toISOString().slice(0, 10),
    memo: `Void — sales tax remittance ${usd(rem.amount as number)}`,
    ...(opts.created_by ? { created_by: opts.created_by } : {}),
  })
  await col('salesTaxRemittances', d).updateOne({ _id: id }, { $set: { status: 'void' } })
  await writeAudit({
    actor: opts.created_by ?? 'system',
    action: 'sales-tax.void-remittance',
    entity_type: 'sales-tax-remittance',
    entity_id: id,
    summary: `Voided sales tax remittance ${usd(rem.amount as number)} (${rem.date})`,
    meta: { reversal_entry_id: reversal._id },
  })
  return { ...rem, _id: String(rem._id), status: 'void' } as SalesTaxRemittance
}
