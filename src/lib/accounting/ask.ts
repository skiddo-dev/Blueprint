// Pure side of "Ask the books" — no database, no LLM. The model's only two
// jobs are picking which deterministic report answers a question (the route)
// and narrating the data that report returns; this module is the rails:
// the closed set of routes, parameter normalization/defaults, and the
// human-readable "based on" label so every answer says exactly which numbers
// it came from. The model never writes a query and never computes a figure.

export const ASK_REPORT_IDS = [
  'income_statement', // P&L for a date range
  'balance_sheet',    // position as of a date
  'ar_aging',         // who owes us
  'ap_aging',         // who we owe
  'cash',             // bank balances right now
  'vendor_spend',     // billed totals per vendor
  'job_profit',       // profit per job
  'register',         // one account's activity in a range
  'budget_vs_actual', // plan vs reality for a year
  'none',             // not answerable from the books
] as const

export type AskReportId = (typeof ASK_REPORT_IDS)[number]

export interface AskRoute {
  report: Exclude<AskReportId, 'none'>
  from?: string
  to?: string
  asOf?: string
  account?: string
  year?: number
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isoOrNull = (v: unknown): string | null => (typeof v === 'string' && ISO.test(v) ? v : null)

/** Coerce whatever the model returned into a runnable route with sane
 *  defaults (`today` anchors them): date ranges default to the current year so
 *  "how's revenue?" means this year, not all time. Returns null when the
 *  question isn't answerable from the books ('none' or garbage). */
export function normalizeRoute(raw: unknown, today: string): AskRoute | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const report = ASK_REPORT_IDS.includes(r.report as AskReportId) ? (r.report as AskReportId) : 'none'
  if (report === 'none') return null
  const yearStart = `${today.slice(0, 4)}-01-01`
  const currentYear = Number(today.slice(0, 4))

  const route: AskRoute = { report }
  switch (report) {
    case 'income_statement': {
      let from = isoOrNull(r.from) ?? yearStart
      let to = isoOrNull(r.to) ?? today
      if (from > to) [from, to] = [to, from]
      route.from = from
      route.to = to
      break
    }
    case 'balance_sheet':
      route.asOf = isoOrNull(r.asOf) ?? today
      break
    case 'register': {
      const account = typeof r.account === 'string' ? r.account.trim() : ''
      if (!account) return null // a register without an account is no question at all
      route.account = account
      let from = isoOrNull(r.from) ?? yearStart
      let to = isoOrNull(r.to) ?? today
      if (from > to) [from, to] = [to, from]
      route.from = from
      route.to = to
      break
    }
    case 'vendor_spend':
    case 'budget_vs_actual': {
      const y = typeof r.year === 'number' && Number.isInteger(r.year) ? r.year : currentYear
      route.year = Math.min(2100, Math.max(2000, y))
      break
    }
    // ar_aging / ap_aging / cash / job_profit take no parameters.
  }
  return route
}

const LABELS: Record<AskRoute['report'], string> = {
  income_statement: 'Income statement',
  balance_sheet: 'Balance sheet',
  ar_aging: 'A/R aging',
  ap_aging: 'A/P aging',
  cash: 'Cash on hand',
  vendor_spend: 'Vendor spend',
  job_profit: 'Job profitability',
  register: 'Account register',
  budget_vs_actual: 'Budget vs actual',
}

/** "Income statement · 2026-01-01 → 2026-06-10" — every answer cites this. */
export function describeRoute(route: AskRoute): string {
  const base = LABELS[route.report]
  if (route.from && route.to) return `${base}${route.account ? ` · ${route.account}` : ''} · ${route.from} → ${route.to}`
  if (route.asOf) return `${base} · as of ${route.asOf}`
  if (route.year) return `${base} · ${route.year}`
  return base
}

/** Where "open the full report" goes for each route. */
export function routeHref(route: AskRoute): string {
  switch (route.report) {
    case 'income_statement': return '/accounting/income-statement'
    case 'balance_sheet': return '/accounting/balance-sheet'
    case 'ar_aging': return '/accounting/aging'
    case 'ap_aging': return '/accounting/ap-aging'
    case 'cash': return '/accounting'
    case 'vendor_spend': return '/accounting/vendors'
    case 'job_profit': return '/accounting/reports/jobs'
    case 'register': return `/accounting/register/${encodeURIComponent(route.account ?? '')}`
    case 'budget_vs_actual': return '/accounting/reports/budget-vs-actual'
  }
}
