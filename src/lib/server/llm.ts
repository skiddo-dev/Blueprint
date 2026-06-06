import { getClient, MODEL } from './openai'
import { QUOTE_TYPES, QUOTE_STATUSES } from '$lib/constants'
import { normalizeStoreNumbers } from '$lib/storeNumbers'

export interface ParsedEmail {
  date: string | null
  assigned_to: string | null
  quote: string | null
  quote_type: string | null
  po: string | null
  quote_status: 'Draft' | 'Sent' | 'Won' | 'Lost' | null
  store_numbers: string[]
  summary: string
  /** One-line description of what THIS message says/changes, for the activity timeline. */
  event: string
  /** Model's self-assessed extraction confidence, 0–1. Drives the review flag. */
  confidence: number
  /** Field names the model was unsure about (subset of the extracted fields). */
  uncertain_fields: string[]
}

/** Compact prior-task state, passed when an email is a reply to an existing
 *  thread so the model reports what CHANGED rather than re-deriving from scratch. */
export interface PriorTask {
  quote?: string | null
  quote_type?: string | null
  quote_status?: string | null
  po?: string | null
  store_numbers?: string[]
  assigned_to?: string | null
  date?: string | null
}

interface ParseOpts {
  /** Known people the work can be assigned to; constrains `assigned_to` to real
   *  names (matching the board's "Assign to" dropdown) instead of free text. */
  assignees?: string[]
  /** When set, this email is a follow-up on an existing task — report deltas. */
  priorTask?: PriorTask
}

const UNCERTAINTY_FIELDS = ['date', 'assigned_to', 'quote', 'quote_type', 'po', 'store_numbers']

/** JSON schema for OpenAI Structured Outputs (strict mode → guaranteed valid,
 *  schema-shaped JSON). Every property must be listed in `required`; nullable
 *  fields use `type: ['string', 'null']`. */
function buildSchema(assignees: string[]) {
  const assignedTo = assignees.length
    ? {
        type: ['string', 'null'],
        enum: [...assignees, null],
        description:
          'Person or crew the work is assigned to. Choose EXACTLY one name from the list, or null if unclear. Never invent a name.',
      }
    : { type: ['string', 'null'], description: 'Person or crew assigned. Null if unclear.' }

  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'date', 'assigned_to', 'quote', 'quote_type', 'po', 'quote_status',
      'store_numbers', 'summary', 'event', 'confidence', 'uncertain_fields',
    ],
    properties: {
      date: {
        type: ['string', 'null'],
        description: 'Task due date as ISO 8601 (YYYY-MM-DD). Infer from the email date if not stated. Null if none.',
      },
      assigned_to: assignedTo,
      quote: {
        type: ['string', 'null'],
        description: 'Monetary amount exactly as written, e.g. "$12,300". Null if the email contains no dollar figure.',
      },
      quote_type: {
        type: ['string', 'null'],
        enum: [...QUOTE_TYPES, null],
        description: 'Category of the request. Null if the email is not a quote/estimate request.',
      },
      po: {
        type: ['string', 'null'],
        description: 'Purchase order or work-order number if the email provides one (e.g. "4471", "PO-4471"). Null if none.',
      },
      quote_status: {
        type: ['string', 'null'],
        enum: [...QUOTE_STATUSES, null],
        description:
          'Pipeline stage IF the message signals one: explicit approval / "go ahead" / a PO being issued → "Won"; an estimate being sent → "Sent"; a decline / "passing" / "went another way" → "Lost". Null if the message does not change the stage.',
      },
      store_numbers: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Store/site numbers referenced anywhere in the email, as 3-digit strings (e.g. "412"); strip any "D-" prefix. Empty array if none. Do NOT include phone numbers, zip codes, suite numbers, or dollar amounts.',
      },
      summary: {
        type: 'string',
        description: 'One or two sentences (≤200 chars) describing what the email is asking for.',
      },
      event: {
        type: 'string',
        description:
          'Very short (≤120 chars) note of what THIS message conveys or changes, for an activity log. E.g. "Customer approved; PO 4471 issued" or "Requested quote for cooler repair".',
      },
      confidence: {
        type: 'number',
        description:
          'Your overall confidence in this extraction, from 0 (guessing) to 1 (certain). Be honest — low values route the task to a human for review.',
      },
      uncertain_fields: {
        type: 'array',
        items: { type: 'string', enum: UNCERTAINTY_FIELDS },
        description: 'Names of any fields above you are NOT confident about. Empty array if confident in all.',
      },
    },
  }
}

const SYSTEM_PROMPT = `You extract structured task data from RAVES grocery-construction emails (store remodels, refrigeration, soffits, flooring, electrical, etc.).
Notes for this domain:
- Stores are often referenced as "D-123", "D123", or a bare 3-digit number — keep them in the summary when present.
- "quote_type" classifies the request; pick the closest option or null if it isn't a quote/estimate.
- Map "assigned_to" to one of the provided people; prefer null over guessing a wrong name.
- Capture a purchase-order / work-order number in "po" when present.
- Set "quote_status" ONLY when the message clearly signals a stage change (approval, sent, declined); otherwise null.
- If a "PRIOR TASK STATE" block is given, this email is a follow-up: report only what changed versus that state.
Be precise and prefer null when genuinely unsure rather than fabricating a value, and reflect that uncertainty in "confidence" / "uncertain_fields".`

function priorTaskBlock(p: PriorTask): string {
  const parts = [
    p.quote ? `quote ${p.quote}` : null,
    p.quote_status ? `status ${p.quote_status}` : null,
    p.quote_type ? `type ${p.quote_type}` : null,
    p.po ? `PO ${p.po}` : null,
    p.store_numbers?.length ? `stores ${p.store_numbers.join(', ')}` : null,
    p.assigned_to ? `assigned ${p.assigned_to}` : null,
    p.date ? `due ${p.date}` : null,
  ].filter(Boolean)
  return `PRIOR TASK STATE: ${parts.length ? parts.join('; ') : '(empty)'}\nThis email is a reply on that thread — report what changed.`
}

export async function parseEmailWithLLM(
  email: {
    subject: string
    from: string
    sender_name?: string
    sender_email?: string
    date: string
    body: string
    attachments?: { filename: string; skipped?: boolean }[]
  },
  opts: ParseOpts = {},
): Promise<ParsedEmail> {
  const assignees = (opts.assignees ?? []).filter(Boolean)
  const attNames = (email.attachments ?? [])
    .filter(a => !a.skipped)
    .map(a => a.filename)
    .join(', ')

  const userContent = [
    opts.priorTask ? priorTaskBlock(opts.priorTask) : '',
    assignees.length ? `Known assignees: ${assignees.join(', ')}` : '',
    `Subject: ${email.subject}`,
    `From: ${email.sender_name || email.from}`,
    `Date: ${email.date}`,
    attNames ? `Attachments: ${attNames}` : '',
    '',
    `Body:\n${email.body.slice(0, 4000)}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const resp = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'task_extraction', strict: true, schema: buildSchema(assignees) },
      },
    })

    const choice = resp.choices[0]?.message
    if (choice?.refusal) throw new Error(`model refusal: ${choice.refusal}`)
    const data = JSON.parse(choice?.content ?? '{}')

    return {
      date: data.date ?? null,
      assigned_to: data.assigned_to ?? null,
      quote: data.quote ?? null,
      quote_type: data.quote_type ?? null,
      po: data.po ?? null,
      quote_status: data.quote_status ?? null,
      store_numbers: normalizeStoreNumbers(Array.isArray(data.store_numbers) ? data.store_numbers : []),
      summary: String(data.summary ?? '').slice(0, 200),
      event: String(data.event ?? '').slice(0, 120),
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      uncertain_fields: Array.isArray(data.uncertain_fields) ? data.uncertain_fields.map(String) : [],
    }
  } catch {
    // Degrade gracefully — never block a sync on a parse failure. confidence 0
    // routes the task to the review lane so the miss is visible, not silent.
    return {
      date: null,
      assigned_to: null,
      quote: null,
      quote_type: null,
      po: null,
      quote_status: null,
      store_numbers: [],
      summary: email.body.slice(0, 200),
      event: '',
      confidence: 0,
      uncertain_fields: [],
    }
  }
}
