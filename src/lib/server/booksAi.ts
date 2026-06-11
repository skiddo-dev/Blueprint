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
