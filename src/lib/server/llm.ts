import { getClient, MODEL } from './openai'
import { QUOTE_TYPES, QUOTE_STATUSES } from '$lib/constants'
import { normalizeStoreNumbers } from '$lib/storeNumbers'

export interface ParsedEmail {
  /** Short, clean task name for the board card — a summary of the request, NOT a
   *  verbatim copy of the email subject. */
  title: string
  assigned_to: string | null
  quote: string | null
  quote_type: string | null
  po: string | null
  quote_status: 'Draft' | 'Sent' | 'Won' | 'Lost' | null
  store_numbers: string[]
  summary: string
  /** One-line description of what THIS message says/changes, for the activity timeline. */
  event: string
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
}

interface ParseOpts {
  /** Known people the work can be assigned to; constrains `assigned_to` to real
   *  names (matching the board's "Assign to" dropdown) instead of free text. */
  assignees?: string[]
  /** When set, this email is a follow-up on an existing task — report deltas. */
  priorTask?: PriorTask
}

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
      'title', 'assigned_to', 'quote', 'quote_type', 'po', 'quote_status',
      'store_numbers', 'summary', 'event',
    ],
    properties: {
      title: {
        type: 'string',
        description:
          'A short, clear task name for the board card (≤80 chars) summarizing the actual request — e.g. "Cooler repair quote — Store 412". Summarize; do NOT copy the email subject verbatim, and drop "RE:"/"FW:" prefixes and thread noise.',
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
    },
  }
}

const SYSTEM_PROMPT = `You extract structured task data from RAVES grocery-construction emails (store remodels, refrigeration, soffits, flooring, electrical, etc.).
Notes for this domain:
- "title" is the board card's name: a concise summary of the request (≤80 chars), not a copy of the subject line.
- Stores are often referenced as "D-123", "D123", or a bare 3-digit number — keep them in the summary when present.
- "quote_type" classifies the request; pick the closest option or null if it isn't a quote/estimate.
- Map "assigned_to" to one of the provided people; prefer null over guessing a wrong name.
- Capture a purchase-order / work-order number in "po" when present.
- Set "quote_status" ONLY when the message clearly signals a stage change (approval, sent, declined); otherwise null.
- If a "PRIOR TASK STATE" block is given, this email is a follow-up: report only what changed versus that state.
Be precise and prefer null when genuinely unsure rather than fabricating a value.`

function priorTaskBlock(p: PriorTask): string {
  const parts = [
    p.quote ? `quote ${p.quote}` : null,
    p.quote_status ? `status ${p.quote_status}` : null,
    p.quote_type ? `type ${p.quote_type}` : null,
    p.po ? `PO ${p.po}` : null,
    p.store_numbers?.length ? `stores ${p.store_numbers.join(', ')}` : null,
    p.assigned_to ? `assigned ${p.assigned_to}` : null,
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
      title: String(data.title ?? '').slice(0, 80) || email.subject,
      assigned_to: data.assigned_to ?? null,
      quote: data.quote ?? null,
      quote_type: data.quote_type ?? null,
      po: data.po ?? null,
      quote_status: data.quote_status ?? null,
      store_numbers: normalizeStoreNumbers(Array.isArray(data.store_numbers) ? data.store_numbers : []),
      summary: String(data.summary ?? '').slice(0, 200),
      event: String(data.event ?? '').slice(0, 120),
    }
  } catch {
    // Degrade gracefully — never block a sync on a parse failure. Falling back to
    // the raw subject keeps the card titled (just not LLM-cleaned).
    return {
      title: email.subject,
      assigned_to: null,
      quote: null,
      quote_type: null,
      po: null,
      quote_status: null,
      store_numbers: [],
      summary: email.body.slice(0, 200),
      event: '',
    }
  }
}

const SUMMARY_SYSTEM_PROMPT = `You summarize a RAVES grocery-construction task thread (the original email plus any later replies and PM comments) into ONE tight, factual summary for the board card.
- Lead with the current ask / state, then the key facts (store #, quote/PO, dates, who's waiting on what).
- Reflect the LATEST state of the thread — if a reply changed something (approved, declined, rescheduled), say the current status, not the original request.
- No greetings, signatures, or filler. Plain text, ≤ ~280 characters.`

/**
 * Condense a card's whole thread (title + raw email body + later reply/comment
 * events) into a single at-a-glance summary for the board card's description.
 *
 * Reuses the same client/model as the email parser. Returns `null` on any error
 * (or an empty result) so the caller can leave the existing description in place
 * — never throws, mirroring parseEmailWithLLM's never-block discipline.
 */
export async function summarizeThread(input: {
  title?: string
  body?: string
  events?: string[]
}): Promise<string | null> {
  const events = (input.events ?? []).filter(Boolean)
  const content = [
    input.title ? `Task: ${input.title}` : '',
    events.length ? `Thread updates (oldest → newest):\n- ${events.join('\n- ')}` : '',
    input.body ? `Original email:\n${input.body}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 6000)

  if (!content.trim()) return null

  try {
    const resp = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'thread_summary',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['summary'],
            properties: {
              summary: { type: 'string', description: 'The condensed task summary (≤ ~280 chars).' },
            },
          },
        },
      },
    })

    const choice = resp.choices[0]?.message
    if (choice?.refusal) return null
    const data = JSON.parse(choice?.content ?? '{}')
    const summary = String(data.summary ?? '').trim().slice(0, 280)
    return summary || null
  } catch {
    return null
  }
}
