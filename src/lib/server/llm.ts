import OpenAI from 'openai'
import { env } from '$env/dynamic/private'
import { QUOTE_TYPES } from '$lib/constants'

// Lazily initialized — avoids throwing during build when OPENAI_API_KEY isn't set.
// Reads via $env/dynamic/private, NOT process.env (empty under Vite 8 SSR — an
// empty key silently degrades parsing via the catch below). See src/lib/server/db.ts.
let _client: OpenAI | null = null
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return _client
}

// Email-to-task extraction is a bulk, structured-parsing job: pick a fast,
// cheap, non-reasoning model (reasoning/"think-always" models are slower and
// worse for this — see the local-LLM bench notes). gpt-4o-mini supports strict
// Structured Outputs; override with OPENAI_MODEL (e.g. gpt-4.1-mini) if desired.
const MODEL = env.OPENAI_MODEL || 'gpt-4o-mini'

export interface ParsedEmail {
  date: string | null
  assigned_to: string | null
  quote: string | null
  quote_type: string | null
  summary: string
}

interface ParseOpts {
  /** Known people the work can be assigned to; constrains `assigned_to` to real
   *  names (matching the board's "Assign to" dropdown) instead of free text. */
  assignees?: string[]
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
    required: ['date', 'assigned_to', 'quote', 'quote_type', 'summary'],
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
      summary: {
        type: 'string',
        description: 'One or two sentences (≤200 chars) describing what the email is asking for.',
      },
    },
  }
}

const SYSTEM_PROMPT = `You extract structured task data from RAVES grocery-construction emails (store remodels, refrigeration, soffits, flooring, electrical, etc.).
Notes for this domain:
- Stores are often referenced as "D-123", "D123", or a bare 3-digit number — keep them in the summary when present.
- "quote_type" classifies the request; pick the closest option or null if it isn't a quote/estimate.
- Map "assigned_to" to one of the provided people; prefer null over guessing a wrong name.
Be precise and prefer null when genuinely unsure rather than fabricating a value.`

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
      summary: String(data.summary ?? '').slice(0, 200),
    }
  } catch {
    // Degrade gracefully — never block a sync on a parse failure.
    return {
      date: null,
      assigned_to: null,
      quote: null,
      quote_type: null,
      summary: email.body.slice(0, 200),
    }
  }
}
