// Server-side bank reconciliation. A reconciliation record (its own collection)
// references the journal entries it cleared — posted entries are never mutated,
// so the ledger stays immutable; "cleared" is derived from the reconciliations.
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { getAccounts } from './accounting'
import { writeAudit } from './audit'
import { usd } from '$lib/accounting/format'
import { accountEffect, type BankTxn } from '$lib/accounting/reconciliation'
import { type Cents, cents } from '$lib/money'
import type { Account } from '$lib/accounting/types'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

export interface Reconciliation {
  _id: string
  account_id: string
  statement_date: string
  statement_balance: Cents
  beginning_balance: Cents
  cleared_total: Cents
  cleared_entry_ids: string[]
  created_by?: string
  created_at: string
}

/** Bank/cash accounts (CoA subtype 'bank') — the accounts you reconcile. */
export async function getBankAccounts(): Promise<Account[]> {
  return (await getAccounts()).filter((a) => a.subtype === 'bank' && a.active)
}

async function clearedEntryIds(accountId: string, d: Awaited<ReturnType<typeof getDb>>): Promise<Set<string>> {
  const recs = await col('reconciliations', d).find({ account_id: accountId }).toArray()
  const set = new Set<string>()
  for (const r of recs) for (const id of (r.cleared_entry_ids ?? [])) set.add(String(id))
  return set
}

/** All posted transactions hitting a bank account, each flagged cleared/uncleared,
 *  plus the cleared (reconciled) balance and the full book balance. */
export async function getBankTransactions(
  accountId: string,
): Promise<{ txns: BankTxn[]; clearedBalance: Cents; bookBalance: Cents }> {
  if (USE_MOCK) return { txns: [], clearedBalance: cents(0), bookBalance: cents(0) }
  const d = await getDb()
  const entries = await col('journalEntries', d)
    .find({ status: 'posted', 'lines.account_id': accountId })
    .sort({ date: 1, created_at: 1 })
    .toArray()
  const cleared = await clearedEntryIds(accountId, d)
  let book = 0
  let clearedBal = 0
  const txns: BankTxn[] = entries.map((e) => {
    const amount = accountEffect(e, accountId)
    book += amount
    const isCleared = cleared.has(String(e._id))
    if (isCleared) clearedBal += amount
    return {
      entry_id: String(e._id),
      date: e.date as string,
      memo: e.memo as string | undefined,
      source: e.source as string,
      amount,
      cleared: isCleared,
    }
  })
  return { txns, clearedBalance: cents(clearedBal), bookBalance: cents(book) }
}

/** Record a completed reconciliation. Validates that the previously-cleared
 *  balance plus the newly-ticked transactions equals the statement balance, and
 *  that none of the ticked entries were already reconciled. */
export async function createReconciliation(input: {
  account_id: string
  statement_date: string
  statement_balance: Cents
  cleared_entry_ids: string[]
  created_by?: string
}): Promise<Reconciliation> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.statement_date)) throw new Error('statement_date must be ISO YYYY-MM-DD')
  const d = await getDb()
  const { txns, clearedBalance } = await getBankTransactions(input.account_id)
  const byId = new Map(txns.map((t) => [t.entry_id, t]))

  let clearedTotal = 0
  for (const id of input.cleared_entry_ids) {
    const t = byId.get(id)
    if (!t) throw new Error(`Transaction ${id} is not on this account`)
    if (t.cleared) throw new Error(`Transaction ${id} is already reconciled`)
    clearedTotal += t.amount
  }

  const reconciled = (clearedBalance as number) + clearedTotal
  if (reconciled !== input.statement_balance) {
    throw new Error(`Does not reconcile: cleared balance ${reconciled} ≠ statement balance ${input.statement_balance}`)
  }

  const rec: Reconciliation = {
    _id: crypto.randomUUID(),
    account_id: input.account_id,
    statement_date: input.statement_date,
    statement_balance: input.statement_balance,
    beginning_balance: clearedBalance,
    cleared_total: cents(clearedTotal),
    cleared_entry_ids: input.cleared_entry_ids,
    ...(input.created_by ? { created_by: input.created_by } : {}),
    created_at: new Date().toISOString(),
  }
  await col('reconciliations', d).insertOne(rec)
  await writeAudit({
    actor: input.created_by ?? 'system',
    action: 'reconciliation.create',
    entity_type: 'reconciliation',
    entity_id: rec._id,
    summary: `Reconciled ${input.account_id} to ${usd(input.statement_balance)} as of ${input.statement_date} (${input.cleared_entry_ids.length} cleared)`,
  })
  return rec
}

/** Reconciliation history for an account, most recent statement first. */
export async function listReconciliations(accountId: string): Promise<Reconciliation[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('reconciliations', d).find({ account_id: accountId }).sort({ statement_date: -1 }).toArray()
  return rows.map((r) => ({ ...r, _id: String(r._id) })) as Reconciliation[]
}
