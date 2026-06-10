// Pure job-costing rollup — no database. Accrual-by-document v1: a job's
// revenue is its non-void invoice totals, its costs are non-void bill totals
// plus job-tagged quick expenses. Documents without a job tag pool under
// "Unassigned" so nothing silently disappears from the totals.
import { type Cents, cents } from '$lib/money'

export const UNASSIGNED = 'Unassigned'

export type JobRow = {
  job: string
  revenue: Cents
  costs: Cents
  profit: Cents
  margin: number | null // profit / revenue; null when there's no revenue
}

export function jobProfitability(
  invoices: { job?: string; total: Cents; status: string }[],
  bills: { job?: string; total: Cents; status: string }[],
  expenses: { job?: string; amount: Cents }[] = [],
): { rows: JobRow[]; totals: Omit<JobRow, 'job'> } {
  const acc = new Map<string, { revenue: number; costs: number }>()
  const bucket = (job: string | undefined) => {
    const key = job?.trim() || UNASSIGNED
    let b = acc.get(key)
    if (!b) { b = { revenue: 0, costs: 0 }; acc.set(key, b) }
    return b
  }
  for (const i of invoices) if (i.status !== 'void') bucket(i.job).revenue += i.total
  for (const b of bills) if (b.status !== 'void') bucket(b.job).costs += b.total
  for (const e of expenses) bucket(e.job).costs += e.amount

  const rows: JobRow[] = [...acc.entries()]
    .map(([job, { revenue, costs }]) => ({
      job,
      revenue: cents(revenue),
      costs: cents(costs),
      profit: cents(revenue - costs),
      margin: revenue > 0 ? (revenue - costs) / revenue : null,
    }))
    // Real jobs by revenue desc; Unassigned always sinks to the bottom.
    .sort((a, b) => (a.job === UNASSIGNED ? 1 : b.job === UNASSIGNED ? -1 : b.revenue - a.revenue))

  const totals = rows.reduce(
    (t, r) => ({ revenue: t.revenue + r.revenue, costs: t.costs + r.costs }),
    { revenue: 0, costs: 0 },
  )
  return {
    rows,
    totals: {
      revenue: cents(totals.revenue),
      costs: cents(totals.costs),
      profit: cents(totals.revenue - totals.costs),
      margin: totals.revenue > 0 ? (totals.revenue - totals.costs) / totals.revenue : null,
    },
  }
}
