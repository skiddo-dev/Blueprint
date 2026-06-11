// Pure side of the month-end review — no database, no LLM. The numbers are
// computed and FORMATTED here, deterministically; the model only turns the
// finished facts into prose (and a fallback paragraph exists so the page works
// with no AI at all). The model never does arithmetic: every figure it sees is
// a pre-formatted string from this module.
import { type Cents } from '$lib/money'
import { usd } from './format'
import type { incomeStatement } from './statements'
import type { Anomaly } from './anomalies'

export type MonthStatement = ReturnType<typeof incomeStatement>

export interface MonthEndInput {
  month: string // "YYYY-MM"
  statement: MonthStatement
  prevStatement: MonthStatement
  cashNet: Cents            // net movement on cash-like accounts this month
  arTotal: Cents
  arOverdue: Cents
  apTotal: Cents
  budgetMonth: { income: Cents; expense: Cents } | null // this month's budget, when one exists
  anomalies: Anomaly[]
}

export interface MonthEndFacts {
  month: string
  label: string // "June 2026"
  figures: { label: string; value: string; note?: string }[]
  topExpenses: { name: string; amount: string }[]
  anomalySummaries: string[]
  promptLines: string[] // the flattened facts the model narrates from
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[(m ?? 1) - 1] ?? month} ${y}`
}

/** "YYYY-MM" immediately before the given month. */
export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return d.toISOString().slice(0, 7)
}

/** First/last ISO day of a "YYYY-MM" month. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  }
}

function deltaNote(now: Cents, prev: Cents, prevLabel: string): string {
  if (prev === 0 && now === 0) return `flat vs ${prevLabel}`
  if (prev === 0) return `${prevLabel} was $0.00`
  const diff = now - prev
  if (diff === 0) return `same as ${prevLabel}`
  return `${diff > 0 ? 'up' : 'down'} ${usd(Math.abs(diff))} vs ${prevLabel} (${usd(prev)})`
}

/** Fold one month's statements and balances into display-ready facts. */
export function buildMonthEndFacts(input: MonthEndInput): MonthEndFacts {
  const { statement: s, prevStatement: p } = input
  const label = monthLabel(input.month)
  const prevLabel = monthLabel(prevMonth(input.month))

  const figures: MonthEndFacts['figures'] = [
    { label: 'Revenue', value: usd(s.revenue.total), note: deltaNote(s.revenue.total, p.revenue.total, prevLabel) },
    { label: 'Job costs (COGS)', value: usd(s.cogs.total), note: deltaNote(s.cogs.total, p.cogs.total, prevLabel) },
    { label: 'Gross profit', value: usd(s.grossProfit) },
    { label: 'Operating expenses', value: usd(s.expenses.total), note: deltaNote(s.expenses.total, p.expenses.total, prevLabel) },
    { label: 'Net income', value: usd(s.netIncome), note: deltaNote(s.netIncome, p.netIncome, prevLabel) },
    {
      label: 'Cash movement',
      value: `${input.cashNet >= 0 ? '+' : '−'}${usd(Math.abs(input.cashNet))}`,
      note: 'net change across bank/undeposited accounts this month',
    },
    {
      label: 'A/R outstanding',
      value: usd(input.arTotal),
      note: input.arOverdue > 0 ? `${usd(input.arOverdue)} of it past due` : 'none past due',
    },
    { label: 'A/P outstanding', value: usd(input.apTotal) },
  ]
  if (input.budgetMonth) {
    const revVar = s.revenue.total - input.budgetMonth.income
    const totalExpenses = s.cogs.total + s.expenses.total
    const expVar = input.budgetMonth.expense - totalExpenses
    figures.push({
      label: 'Against budget',
      value: `revenue ${revVar >= 0 ? 'ahead' : 'behind'} ${usd(Math.abs(revVar))}`,
      note: `spending ${expVar >= 0 ? 'under' : 'over'} by ${usd(Math.abs(expVar))} (budget: ${usd(input.budgetMonth.income)} in / ${usd(input.budgetMonth.expense)} out)`,
    })
  }

  const topExpenses = [...s.cogs.lines, ...s.expenses.lines]
    .filter((l) => l.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((l) => ({ name: l.name, amount: usd(l.amount) }))

  const anomalySummaries = input.anomalies.map((a) => a.summary)

  const promptLines = [
    `Month under review: ${label}`,
    ...figures.map((f) => `${f.label}: ${f.value}${f.note ? ` — ${f.note}` : ''}`),
    topExpenses.length ? `Largest cost accounts: ${topExpenses.map((t) => `${t.name} ${t.amount}`).join('; ')}` : '',
    anomalySummaries.length
      ? `Review flags (${anomalySummaries.length}):\n${anomalySummaries.map((s2) => `- ${s2}`).join('\n')}`
      : 'Review flags: none.',
  ].filter(Boolean)

  return { month: input.month, label, figures, topExpenses, anomalySummaries, promptLines }
}

/** The narrative used when no model is configured (or it fails): short,
 *  deterministic, and built from the same facts the model would get. */
export function fallbackNarrative(facts: MonthEndFacts): string {
  const get = (label: string) => facts.figures.find((f) => f.label === label)
  const rev = get('Revenue')
  const net = get('Net income')
  const ar = get('A/R outstanding')
  const sentences = [
    `${facts.label}: revenue ${rev?.value}${rev?.note ? ` (${rev.note})` : ''}, net income ${net?.value}.`,
    ar ? `Accounts receivable stand at ${ar.value} (${ar.note}).` : '',
    facts.topExpenses.length ? `Biggest cost: ${facts.topExpenses[0].name} at ${facts.topExpenses[0].amount}.` : '',
    facts.anomalySummaries.length
      ? `${facts.anomalySummaries.length} item${facts.anomalySummaries.length === 1 ? ' needs' : 's need'} review before closing.`
      : 'No review flags this month.',
  ]
  return sentences.filter(Boolean).join(' ')
}
