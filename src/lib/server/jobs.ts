// Job-costing reads: the known job tags (form datalists) and the document
// projections the pure jobProfitability() rollup consumes.
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import type { Cents } from '$lib/money'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

/** Every job tag in use across invoices, bills, and expense entries. */
export async function listJobs(): Promise<string[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const [a, b, c] = await Promise.all([
    col('invoices', d).distinct('job'),
    col('bills', d).distinct('job'),
    col('journalEntries', d).distinct('job'),
  ])
  return [...new Set([...a, ...b, ...c].filter((j): j is string => typeof j === 'string' && j.trim() !== ''))].sort()
}

export type JobDocs = {
  invoices: { job?: string; total: Cents; status: string }[]
  bills: { job?: string; total: Cents; status: string }[]
  expenses: { job?: string; amount: Cents }[]
}

/** Projections for the job P&L: all invoices/bills (void filtering happens in
 *  the pure rollup) plus job-tagged quick expenses (entry total = its debits). */
export async function getJobDocs(): Promise<JobDocs> {
  if (USE_MOCK) return { invoices: [], bills: [], expenses: [] }
  const d = await getDb()
  const [invoices, bills, expenseEntries] = await Promise.all([
    col('invoices', d).find({}, { projection: { job: 1, total: 1, status: 1 } }).toArray(),
    col('bills', d).find({}, { projection: { job: 1, total: 1, status: 1 } }).toArray(),
    col('journalEntries', d).find({ source: 'expense', status: 'posted' }, { projection: { job: 1, lines: 1 } }).toArray(),
  ])
  return {
    invoices: invoices as JobDocs['invoices'],
    bills: bills as JobDocs['bills'],
    expenses: expenseEntries.map((e) => ({
      ...(e.job ? { job: e.job as string } : {}),
      amount: (e.lines as { debit: number }[]).reduce((s, l) => s + l.debit, 0) as Cents,
    })),
  }
}
