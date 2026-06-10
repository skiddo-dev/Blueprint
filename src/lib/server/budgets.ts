// Server-side budgets: one doc per fiscal year, full-doc replace on save (the
// grid is edited as a whole — atomic, no per-cell merge headaches).
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { writeAudit } from './audit'
import { getAccounts } from './accounting'
import { validateBudgetAmounts, type BudgetDoc } from '$lib/accounting/budgets'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

export async function getBudget(year: number): Promise<BudgetDoc | null> {
  if (USE_MOCK) return null
  const d = await getDb()
  const doc = await col('budgets', d).findOne({ _id: String(year) })
  return doc ? ({ ...doc, _id: String(doc._id) } as BudgetDoc) : null
}

export async function saveBudget(
  year: number,
  amounts: Record<string, number[]>,
  updated_by?: string,
): Promise<BudgetDoc> {
  const accounts = await getAccounts()
  const problems = validateBudgetAmounts(amounts, accounts)
  if (problems.length) throw new Error(`Invalid budget: ${problems.join('; ')}`)
  const doc: BudgetDoc = {
    _id: String(year),
    year,
    amounts,
    ...(updated_by ? { updated_by } : {}),
    updated_at: new Date().toISOString(),
  }
  const d = await getDb()
  await col('budgets', d).replaceOne({ _id: doc._id }, doc, { upsert: true })
  await writeAudit({
    actor: updated_by ?? 'system',
    action: 'budget.update',
    entity_type: 'budget',
    entity_id: doc._id,
    summary: `Budget ${year} saved (${Object.keys(amounts).length} accounts)`,
  })
  return doc
}
