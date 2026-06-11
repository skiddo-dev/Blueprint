// LLM features for Blueprint Books. One contract everywhere: the model
// PROPOSES (a category, a draft, a narration), deterministic ledger code
// posts, and the human confirms in between. Nothing in this module writes to
// the database; every function degrades gracefully (empty/null result) when
// the model is unavailable, and dollar figures sent to the model are
// pre-formatted strings so it never does cent arithmetic.
import type OpenAI from 'openai'
import { env } from '$env/dynamic/private'
import { getClient, MODEL } from './openai'
import { getDb } from './db'
import { extractText, imageMime } from './attachmentParse'
import { getAccounts, getLedgerBalances, getTrialBalance, getPeriodBalances, listPostedEntries } from './accounting'
import { getArAging } from './invoicing'
import { getApAging, listVendorsWithStats } from './payables'
import { getBudget } from './budgets'
import { getMonthAnomalies } from './anomalies'
import { getJobDocs } from './jobs'
import { jobProfitability } from '$lib/accounting/jobs'
import { budgetVsActual } from '$lib/accounting/budgets'
import { incomeStatement, balanceSheet, type StatementSection } from '$lib/accounting/statements'
import { isCashLike } from '$lib/accounting/coa'
import { normalizeRoute, describeRoute, routeHref, ASK_REPORT_IDS, type AskRoute } from '$lib/accounting/ask'
import {
  buildMonthEndFacts,
  fallbackNarrative,
  monthBounds,
  prevMonth,
  type MonthEndFacts,
} from '$lib/accounting/narrative'
import type { Anomaly } from '$lib/accounting/anomalies'
import { cents, type Cents } from '$lib/money'
import {
  categoryAccounts,
  sanitizeSuggestions,
  buildPayeeHistory,
  type CategoryLine,
  type LineSuggestion,
  type PayeeHistoryRow,
} from '$lib/accounting/categorize'
import type { ScannedBill } from '$lib/accounting/billScan'
import { usd } from '$lib/accounting/format'
import type { Account } from '$lib/accounting/types'

/** Whether the AI features can run at all. The UI uses this to label buttons
 *  honestly instead of failing on click. */
export function aiConfigured(): boolean {
  return !!env.OPENAI_API_KEY
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

type UserContent = string | OpenAI.Chat.Completions.ChatCompletionContentPart[]

/** One strict Structured-Outputs call. Returns the parsed JSON or null on any
 *  failure (refusal, network, bad JSON) — Books AI features never throw at a
 *  user because a model call went sideways. */
async function structuredCall<T>(opts: {
  system: string
  user: UserContent
  schemaName: string
  schema: Record<string, unknown>
}): Promise<T | null> {
  try {
    const resp = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
      },
    })
    const choice = resp.choices[0]?.message
    if (choice?.refusal) throw new Error(`model refusal: ${choice.refusal}`)
    return JSON.parse(choice?.content ?? 'null') as T
  } catch {
    return null
  }
}

// ── Bank-line categorization ──────────────────────────────────────────────────

/** Payee→account history from past bills and quick expenses — the model's
 *  strongest signal ("you've always coded Acme Supply to 5000"). */
export async function getPayeeHistory(): Promise<PayeeHistoryRow[]> {
  if (env.USE_MOCK_DATA === 'true') return []
  const d = await getDb()
  const [bills, expenses] = await Promise.all([
    col('bills', d)
      .find({ status: { $ne: 'void' } }, { projection: { vendor_name: 1, lines: 1, status: 1 } })
      .sort({ bill_date: -1 })
      .limit(1000)
      .toArray(),
    col('journalEntries', d)
      .find({ status: 'posted', source: 'expense' }, { projection: { memo: 1, lines: 1, source: 1, status: 1 } })
      .sort({ date: -1 })
      .limit(1000)
      .toArray(),
  ])
  return buildPayeeHistory(bills, expenses)
}

function accountCatalog(accounts: Account[]): string {
  const { expense, income } = categoryAccounts(accounts)
  const row = (a: Account) => `${a.code} ${a.name}`
  return [
    'Expense/COGS accounts (for money OUT):',
    ...expense.map(row),
    'Income accounts (for money IN):',
    ...income.map(row),
  ].join('\n')
}

/** Suggest a ledger account for each unmatched bank-statement line. Suggestion
 *  only: the result is sanitized against the live chart of accounts and the
 *  money direction, and the user still confirms before anything posts. */
export async function categorizeStatementLines(
  lines: CategoryLine[],
  accounts: Account[],
  history: PayeeHistoryRow[],
): Promise<LineSuggestion[]> {
  if (!lines.length) return []
  const { expense, income } = categoryAccounts(accounts)
  const allowed = [...expense, ...income].map((a) => a._id)
  if (!allowed.length) return []

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['suggestions'],
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'account_id', 'confidence', 'reason'],
          properties: {
            index: { type: 'integer', description: 'The 0-based line number being categorized.' },
            account_id: {
              type: ['string', 'null'],
              enum: [...allowed, null],
              description:
                'The account code for this line: an expense/COGS account for money OUT, an income account for money IN. Null when genuinely unsure — never guess.',
            },
            confidence: { type: 'number', description: 'Confidence 0 (guessing) to 1 (certain).' },
            reason: { type: 'string', description: 'Short justification, ≤100 chars, e.g. "fuel merchant; vendor history".' },
          },
        },
      },
    },
  }

  const byId = new Map(accounts.map((a) => [a._id, a]))
  const historyBlock = history.length
    ? 'How this business has coded these payees before (strongest signal):\n' +
      history
        .slice(0, 100)
        .map((h) => `${h.payee} → ${h.account_id} ${byId.get(h.account_id)?.name ?? ''} (×${h.count})`)
        .join('\n')
    : ''
  const lineBlock = lines
    .map(
      (l, i) =>
        `${i}. ${l.date} | ${l.amount < 0 ? 'OUT' : 'IN'} ${usd(Math.abs(l.amount))} | "${l.description.slice(0, 160)}"`,
    )
    .join('\n')

  const parsed = await structuredCall<{ suggestions: unknown }>({
    system:
      `You categorize bank-statement lines for a commercial remodel/construction contractor (RAVES) into their chart of accounts.\n` +
      `Money OUT goes to an expense/COGS account; money IN goes to an income account.\n` +
      `Bank descriptions are noisy (card suffixes, store numbers, ACH codes) — match on the merchant/payee name inside the noise.\n` +
      `When a payee appears in the prior-coding history, strongly prefer that account. Prefer null over a weak guess.`,
    user: [accountCatalog(accounts), historyBlock, 'Statement lines:', lineBlock].filter(Boolean).join('\n\n'),
    schemaName: 'line_categorization',
    schema,
  })
  return sanitizeSuggestions(parsed?.suggestions, lines, accounts)
}

// ── Bill-document ingestion ───────────────────────────────────────────────────

const EMPTY_SCAN: ScannedBill = {
  vendor: null, vendor_invoice_no: null, bill_date: null, po: null,
  total: null, memo: '', lines: [], confidence: 0,
}

const isoDate = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null

/** Read a vendor invoice (PDF / photo / text) into a ScannedBill draft for the
 *  new-bill form. Line accounts are suggested from the expense/COGS chart and
 *  validated against it; amounts stay strings exactly as written. Returns null
 *  for unreadable file types, the empty scan when the model fails — the form
 *  just stays blank either way. */
export async function parseBillDocument(
  filename: string,
  contentType: string | undefined,
  buf: Buffer,
  accounts: Account[],
): Promise<ScannedBill | null> {
  const { expense } = categoryAccounts(accounts)
  const allowed = expense.map((a) => a._id)

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['vendor', 'vendor_invoice_no', 'bill_date', 'po', 'total', 'memo', 'lines', 'confidence'],
    properties: {
      vendor: { type: ['string', 'null'], description: 'The business that issued this invoice (the seller). Null if unclear.' },
      vendor_invoice_no: { type: ['string', 'null'], description: "The vendor's own invoice number, exactly as printed. Null if none." },
      bill_date: { type: ['string', 'null'], description: 'The invoice date as ISO YYYY-MM-DD, only when clearly printed.' },
      po: { type: ['string', 'null'], description: 'A purchase-order reference printed on the invoice (e.g. "PO-2026-0003", "PO 4471"). Null if none.' },
      total: { type: ['string', 'null'], description: 'The invoice total exactly as written, e.g. "$12,300.00".' },
      memo: { type: 'string', description: 'One line (≤160 chars): what this bill is for.' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'amount', 'account_id'],
          properties: {
            description: { type: 'string', description: 'The line item, ≤120 chars.' },
            amount: { type: ['string', 'null'], description: 'The line amount exactly as written. Null if the invoice shows no per-line amounts.' },
            account_id: {
              type: ['string', 'null'],
              enum: [...allowed, null],
              description: 'The expense/COGS account this line belongs to, from the chart provided. Null when unsure.',
            },
          },
        },
        description: 'The billable line items (skip subtotal/tax/total rows). When the invoice has no itemization, return a single line for the whole amount.',
      },
      confidence: { type: 'number', description: 'Confidence 0–1 in this extraction.' },
    },
  }

  const catalog =
    'Expense/COGS accounts to code lines against:\n' + expense.map((a) => `${a.code} ${a.name}`).join('\n')
  const system =
    `You extract a vendor invoice (bill) for a commercial remodel/construction contractor's accounts-payable entry.\n` +
    `Pull the vendor, their invoice number, the invoice date, any PO reference, the total, and the billable line items; ` +
    `code each line to the closest expense/COGS account from the chart. Prefer null over guessing; reflect doubt in "confidence".`

  let raw: ScannedBill | null = null
  const text = await extractText(filename, contentType, buf)
  if (text) {
    raw = await structuredCall<ScannedBill>({
      system,
      user: `${catalog}\n\nFilename: ${filename}\n\n${text}`,
      schemaName: 'bill_extraction',
      schema,
    })
  } else {
    const mime = imageMime(filename, contentType)
    if (!mime) return null // unreadable type — the caller reports "unsupported"
    if (!buf.length) return { ...EMPTY_SCAN }
    raw = await structuredCall<ScannedBill>({
      system,
      user: [
        { type: 'text', text: `${catalog}\n\nFilename: ${filename}\nThe attached image is a scanned or photographed vendor invoice.` },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } },
      ],
      schemaName: 'bill_extraction',
      schema,
    })
  }
  if (!raw) return { ...EMPTY_SCAN }

  const allowedSet = new Set(allowed)
  return {
    vendor: typeof raw.vendor === 'string' && raw.vendor.trim() ? raw.vendor.trim().slice(0, 120) : null,
    vendor_invoice_no:
      typeof raw.vendor_invoice_no === 'string' && raw.vendor_invoice_no.trim()
        ? raw.vendor_invoice_no.trim().slice(0, 60)
        : null,
    bill_date: isoDate(raw.bill_date),
    po: typeof raw.po === 'string' && raw.po.trim() ? raw.po.trim().slice(0, 60) : null,
    total: typeof raw.total === 'string' && raw.total.trim() ? raw.total.trim().slice(0, 40) : null,
    memo: String(raw.memo ?? '').slice(0, 160),
    lines: (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 25).map((l) => ({
      description: String(l?.description ?? '').slice(0, 120),
      amount: typeof l?.amount === 'string' && l.amount.trim() ? l.amount.trim().slice(0, 40) : null,
      account_id: typeof l?.account_id === 'string' && allowedSet.has(l.account_id) ? l.account_id : null,
    })),
    confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0,
  }
}

// ── Month-end review ──────────────────────────────────────────────────────────

/** Everything the month-end page shows, computed deterministically — the AI
 *  narrative sits on top of these facts and never replaces them. */
export async function getMonthEndData(month: string): Promise<{ facts: MonthEndFacts; anomalies: Anomaly[] }> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be YYYY-MM')
  const cur = monthBounds(month)
  const prev = monthBounds(prevMonth(month))
  const [accounts, balances, prevBalances, arAging, apAging, budget, anomalies] = await Promise.all([
    getAccounts(),
    getLedgerBalances({ from: cur.from, to: cur.to, excludeClosing: true }),
    getLedgerBalances({ from: prev.from, to: prev.to, excludeClosing: true }),
    getArAging(),
    getApAging(),
    getBudget(Number(month.slice(0, 4))),
    getMonthAnomalies(month),
  ])

  const cashIds = new Set(accounts.filter((a) => a.type === 'asset' && isCashLike(a)).map((a) => a._id))
  const cashNet = cents(balances.reduce((s, b) => s + (cashIds.has(b.account_id) ? b.debit - b.credit : 0), 0))

  let budgetMonth: { income: Cents; expense: Cents } | null = null
  if (budget) {
    const idx = Number(month.slice(5, 7)) - 1
    const typeOf = new Map(accounts.map((a) => [a._id, a.type]))
    let income = 0
    let expense = 0
    for (const [id, months] of Object.entries(budget.amounts)) {
      const t = typeOf.get(id)
      if (t === 'income') income += months[idx] ?? 0
      else if (t === 'expense') expense += months[idx] ?? 0
    }
    if (income > 0 || expense > 0) budgetMonth = { income: cents(income), expense: cents(expense) }
  }

  const facts = buildMonthEndFacts({
    month,
    statement: incomeStatement(balances, accounts),
    prevStatement: incomeStatement(prevBalances, accounts),
    cashNet,
    arTotal: arAging.total,
    arOverdue: cents(arAging.total - arAging.buckets.current),
    apTotal: apAging.total,
    budgetMonth,
    anomalies,
  })
  return { facts, anomalies }
}

/** Turn the finished facts into 2–3 short plain-English paragraphs. The model
 *  is told to use the provided figures verbatim and compute nothing; on any
 *  failure the deterministic fallback paragraph ships instead. */
export async function narrateMonthEnd(facts: MonthEndFacts): Promise<{ narrative: string; ai: boolean }> {
  if (!aiConfigured()) return { narrative: fallbackNarrative(facts), ai: false }
  const parsed = await structuredCall<{ narrative: string }>({
    system:
      `You write the month-end summary for the owner of a small commercial remodel/construction company. ` +
      `He is not an accountant — plain English, no jargon, no headings or bullet lists.\n` +
      `Rules: 2–3 short paragraphs, ≤180 words total. Use ONLY the figures provided, copied verbatim — ` +
      `never compute, estimate, or round a number yourself. Lead with how the month actually went, ` +
      `then where the money stands (cash, receivables, payables), and close with the review flags if any — ` +
      `they are possible bookkeeping errors to check before closing the books, not business problems.`,
    user: facts.promptLines.join('\n'),
    schemaName: 'month_end_narrative',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['narrative'],
      properties: { narrative: { type: 'string', description: 'The 2–3 paragraph summary, plain text.' } },
    },
  })
  const text = parsed?.narrative?.trim()
  if (!text) return { narrative: fallbackNarrative(facts), ai: false }
  return { narrative: text.slice(0, 2000), ai: true }
}

// ── Ask the books ─────────────────────────────────────────────────────────────
// The model routes a question to ONE deterministic report, the report runs
// exactly as it would for its page, and the model narrates the result. It
// never writes a query and never computes a figure — the data it narrates is
// already usd-formatted.

const ROUTE_GUIDE = `Reports you can route to:
- income_statement (params from,to): revenue, costs, profit for a date range. "How did May go", "profit this year".
- balance_sheet (param asOf): what the business owns/owes on a date.
- ar_aging: open customer invoices by age. "Who owes us", "overdue invoices".
- ap_aging: open vendor bills by age. "What do we owe", "bills due".
- cash: current bank account balances.
- vendor_spend (param year): total billed per vendor. "How much have we spent with Acme".
- job_profit: revenue, costs, profit per job. "Which jobs made money".
- register (params account,from,to): one account's activity; account is the 4-digit code from the chart.
- budget_vs_actual (param year): plan vs reality.
- none: not answerable from these books (payroll detail, forecasts, anything outside the ledger).`

/** Pick the report (and parameters) that answers a question. Null when the
 *  books can't answer it. */
export async function routeQuestion(question: string, today: string): Promise<AskRoute | null> {
  const accounts = await getAccounts()
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['report', 'from', 'to', 'asOf', 'account', 'year'],
    properties: {
      report: { type: 'string', enum: [...ASK_REPORT_IDS], description: 'The one report that answers the question, or "none".' },
      from: { type: ['string', 'null'], description: 'ISO YYYY-MM-DD range start, when the question implies one.' },
      to: { type: ['string', 'null'], description: 'ISO YYYY-MM-DD range end.' },
      asOf: { type: ['string', 'null'], description: 'ISO date for balance_sheet.' },
      account: { type: ['string', 'null'], description: 'Account code for register, from the chart provided.' },
      year: { type: ['integer', 'null'], description: 'Year for vendor_spend / budget_vs_actual.' },
    },
  }
  const raw = await structuredCall<Record<string, unknown>>({
    system:
      `You route a question about a small construction company's books to exactly one report.\n${ROUTE_GUIDE}\n` +
      `Today is ${today}. Resolve relative dates ("last month", "this year") to ISO dates yourself. ` +
      `Pick "none" rather than a report that only half-fits.`,
    user:
      `Chart of accounts (for register routing):\n${accounts.filter((a) => a.active).map((a) => `${a.code} ${a.name}`).join('\n')}\n\n` +
      `Question: ${question}`,
    schemaName: 'ask_route',
    schema,
  })
  return normalizeRoute(raw, today)
}

const sec = (s: StatementSection) => ({
  lines: s.lines.map((l) => ({ name: l.name, amount: usd(l.amount) })),
  total: usd(s.total),
})

type AgingResult = Awaited<ReturnType<typeof getArAging>>
function agingData(aging: AgingResult) {
  return {
    total_outstanding: usd(aging.total),
    by_age: Object.fromEntries(Object.entries(aging.buckets).map(([k, v]) => [k, usd(v as number)])),
    largest_open: aging.rows
      .slice()
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 12)
      .map((r) => ({ who: r.name, doc_number: r.number, balance: usd(r.balance), due: r.due_date, age: r.bucket })),
  }
}

/** Run one route exactly the way its report page would. Everything returned is
 *  display-ready (usd strings) — the narration model copies, never computes. */
export async function runAskRoute(route: AskRoute): Promise<unknown> {
  switch (route.report) {
    case 'income_statement': {
      const [accounts, balances] = await Promise.all([
        getAccounts(),
        getLedgerBalances({ from: route.from, to: route.to, excludeClosing: true }),
      ])
      const s = incomeStatement(balances, accounts)
      return {
        period: `${route.from} → ${route.to}`,
        revenue: sec(s.revenue),
        cogs: sec(s.cogs),
        gross_profit: usd(s.grossProfit),
        operating_expenses: sec(s.expenses),
        net_income: usd(s.netIncome),
      }
    }
    case 'balance_sheet': {
      const [accounts, balances] = await Promise.all([getAccounts(), getLedgerBalances({ to: route.asOf })])
      const b = balanceSheet(balances, accounts)
      return {
        as_of: route.asOf,
        assets: sec(b.assets),
        liabilities: sec(b.liabilities),
        equity: sec(b.equity),
        balanced: b.balanced,
      }
    }
    case 'ar_aging': return { customers_owe_us: agingData(await getArAging()) }
    case 'ap_aging': return { we_owe_vendors: agingData(await getApAging()) }
    case 'cash': {
      const [accounts, tb] = await Promise.all([getAccounts(), getTrialBalance()])
      const cashAccts = accounts.filter((a) => a.type === 'asset' && isCashLike(a) && a.active)
      const rows = cashAccts.map((a) => ({
        account: `${a.code} ${a.name}`,
        balance: usd(tb.rows.find((r) => r.account_id === a._id)?.net ?? 0),
      }))
      const total = cashAccts.reduce((s, a) => s + (tb.rows.find((r) => r.account_id === a._id)?.net ?? 0), 0)
      return { note: 'current book balances', accounts: rows, total: usd(total) }
    }
    case 'vendor_spend': {
      const vendors = await listVendorsWithStats()
      return {
        note: 'totals are all-time billed amounts per vendor',
        vendors: vendors
          .filter((v) => v.billCount > 0)
          .sort((a, b) => b.totalBilled - a.totalBilled)
          .slice(0, 15)
          .map((v) => ({ vendor: v.name, bills: v.billCount, total_billed: usd(v.totalBilled), open_balance: usd(v.outstanding) })),
      }
    }
    case 'job_profit': {
      const { invoices, bills, expenses } = await getJobDocs()
      const report = jobProfitability(invoices, bills, expenses)
      const pc = (m: number | null) => (m === null ? null : `${(m * 100).toFixed(1)}%`)
      return {
        jobs: report.rows.map((r) => ({
          job: r.job, revenue: usd(r.revenue), costs: usd(r.costs), profit: usd(r.profit), margin: pc(r.margin),
        })),
        totals: { revenue: usd(report.totals.revenue), costs: usd(report.totals.costs), profit: usd(report.totals.profit), margin: pc(report.totals.margin) },
      }
    }
    case 'register': {
      const accounts = await getAccounts()
      const account = accounts.find((a) => a._id === route.account)
      if (!account) return { error: `No account ${route.account} in the chart` }
      const entries = await listPostedEntries({ account: route.account, from: route.from, to: route.to })
      let debit = 0
      let credit = 0
      const rows: { date: string; memo: string; debit: string; credit: string }[] = []
      for (const e of entries) {
        let d = 0
        let c = 0
        for (const l of e.lines) {
          if (l.account_id !== route.account) continue
          d += l.debit
          c += l.credit
        }
        if (d === 0 && c === 0) continue
        debit += d
        credit += c
        rows.push({ date: e.date, memo: e.memo ?? '', debit: d ? usd(d) : '', credit: c ? usd(c) : '' })
      }
      return {
        account: `${account.code} ${account.name}`,
        period: `${route.from} → ${route.to}`,
        activity: rows.slice(-40),
        shown: Math.min(rows.length, 40),
        total_rows: rows.length,
        period_debits: usd(debit),
        period_credits: usd(credit),
        period_net: usd(debit - credit),
      }
    }
    case 'budget_vs_actual': {
      const year = route.year as number
      const [accounts, period, budget] = await Promise.all([getAccounts(), getPeriodBalances(), getBudget(year)])
      if (!budget) return { error: `No budget exists for ${year}` }
      const now = new Date().toISOString().slice(0, 7)
      const through = now.startsWith(String(year)) ? Number(now.slice(5, 7)) : 12
      const r = budgetVsActual(period, budget, accounts, year, through)
      const row = (b: typeof r.totals.income) => ({
        actual_ytd: usd(b.actualYtd), budget_ytd: usd(b.budgetYtd), variance_ytd_favorable: usd(b.varianceYtd),
      })
      return {
        year,
        months_counted: through,
        income: row(r.totals.income),
        expenses: row(r.totals.expense),
        biggest_variances: r.rows
          .slice()
          .sort((a, b) => Math.abs(b.varianceYtd) - Math.abs(a.varianceYtd))
          .slice(0, 8)
          .map((x) => ({ account: x.name, type: x.type, actual_ytd: usd(x.actualYtd), budget_ytd: usd(x.budgetYtd), variance_favorable: usd(x.varianceYtd) })),
      }
    }
  }
}

export interface BooksAnswer {
  answer: string
  basedOn: string | null
  href: string | null
}

const CANT_ANSWER =
  "I can't answer that from the books. I can read the income statement, balance sheet, A/R and A/P aging, cash balances, vendor spend, job profitability, an account register, or budget vs actual."

/** The full ask pipeline: route → run → narrate. Every step degrades to an
 *  honest "can't answer" rather than a guess. */
export async function answerBooksQuestion(question: string, today: string): Promise<BooksAnswer> {
  const route = await routeQuestion(question, today)
  if (!route) return { answer: CANT_ANSWER, basedOn: null, href: null }
  const data = await runAskRoute(route)
  const parsed = await structuredCall<{ answer: string }>({
    system:
      `You answer a question about a small construction company's books from ONE report's data, provided as JSON.\n` +
      `Rules: use ONLY this data — copy dollar amounts verbatim, never compute or estimate a number. ` +
      `Plain English, ≤120 words, no headings. If the data doesn't actually contain the answer, say what's missing. ` +
      `Numbers in the data are already formatted; "variance_favorable" amounts are positive when favorable.`,
    user: `Question: ${question}\n\nReport: ${describeRoute(route)}\nData:\n${JSON.stringify(data, null, 1).slice(0, 12000)}`,
    schemaName: 'books_answer',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['answer'],
      properties: { answer: { type: 'string', description: 'The plain-English answer, ≤120 words.' } },
    },
  })
  const text = parsed?.answer?.trim()
  if (!text) return { answer: CANT_ANSWER, basedOn: describeRoute(route), href: routeHref(route) }
  return { answer: text.slice(0, 1500), basedOn: describeRoute(route), href: routeHref(route) }
}
