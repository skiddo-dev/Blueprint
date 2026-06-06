import { PDFParse } from 'pdf-parse'
import { getClient, MODEL } from './openai'
import { normalizeStoreNumbers } from '$lib/storeNumbers'

// Reads the documents PMs retype by hand today — POs, scopes, and bids that
// arrive as email attachments (downloaded + stored, but never opened until now).
// Text is extracted locally (pdf-parse for PDFs, raw decode for txt/csv) and the
// structured fields are pulled by the same gpt-4o-mini Structured-Outputs call
// the email parser uses. Anything else (images, Office docs, archives) is skipped.

const TEXT_CAP = 8000

export interface ParsedDoc {
  doc_type: 'Purchase Order' | 'Quote/Bid' | 'Scope of Work' | 'Invoice' | 'Drawing' | 'Other' | null
  po: string | null
  amount: string | null            // "$12,300" exactly as written
  store_numbers: string[]
  summary: string                  // ≤160 chars
  confidence: number               // 0–1
}

const DOC_TYPES = ['Purchase Order', 'Quote/Bid', 'Scope of Work', 'Invoice', 'Drawing', 'Other']

function isType(filename: string, contentType: string | undefined, ext: string, mime: RegExp): boolean {
  return filename.toLowerCase().endsWith(ext) || (!!contentType && mime.test(contentType))
}

/** Pull plain text from a parseable attachment. Returns null for unsupported
 *  types (image-only PDFs yield little/no text — handled by the caller's null
 *  guard). Never throws — a bad file degrades to null, never blocks a sync. */
export async function extractText(
  filename: string,
  contentType: string | undefined,
  buf: Buffer,
): Promise<string | null> {
  try {
    if (isType(filename, contentType, '.pdf', /pdf/i)) {
      const parser = new PDFParse({ data: buf })
      try {
        const { text } = await parser.getText()
        const trimmed = (text ?? '').trim()
        return trimmed ? trimmed.slice(0, TEXT_CAP) : null
      } finally {
        await parser.destroy()
      }
    }
    if (
      isType(filename, contentType, '.csv', /csv/i) ||
      isType(filename, contentType, '.txt', /text\/plain/i)
    ) {
      const text = buf.toString('utf8').trim()
      return text ? text.slice(0, TEXT_CAP) : null
    }
    return null
  } catch {
    return null
  }
}

function buildSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['doc_type', 'po', 'amount', 'store_numbers', 'summary', 'confidence'],
    properties: {
      doc_type: {
        type: ['string', 'null'],
        enum: [...DOC_TYPES, null],
        description: 'What kind of document this is. Null if it does not fit any category.',
      },
      po: {
        type: ['string', 'null'],
        description: 'Purchase order or work-order number if present (e.g. "4471", "PO-4471"). Null if none.',
      },
      amount: {
        type: ['string', 'null'],
        description: 'The total / quoted dollar amount exactly as written, e.g. "$12,300.00". Null if none.',
      },
      store_numbers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Store/site numbers referenced, as 3-digit strings; strip any "D-" prefix. Empty array if none.',
      },
      summary: {
        type: 'string',
        description: 'One sentence (≤160 chars) describing the document.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence in this extraction from 0 (guessing) to 1 (certain).',
      },
    },
  }
}

const SYSTEM_PROMPT = `You extract structured data from documents attached to RAVES grocery-construction emails — typically purchase orders, quotes/bids, scopes of work, and invoices.
Pull the purchase-order number, the headline dollar amount, and any store/site numbers. Prefer null over guessing. Reflect uncertainty in "confidence".`

/** Extract PO #, amount, store numbers, and a one-line summary from a document's
 *  text. Graceful: any failure returns an empty ParsedDoc so a sync never blocks. */
export async function parseAttachmentWithLLM(text: string, filename: string): Promise<ParsedDoc> {
  const empty: ParsedDoc = {
    doc_type: null, po: null, amount: null, store_numbers: [], summary: '', confidence: 0,
  }
  const trimmed = (text ?? '').trim()
  if (!trimmed) return empty

  try {
    const resp = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Filename: ${filename}\n\n${trimmed.slice(0, TEXT_CAP)}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'doc_extraction', strict: true, schema: buildSchema() },
      },
    })

    const choice = resp.choices[0]?.message
    if (choice?.refusal) throw new Error(`model refusal: ${choice.refusal}`)
    const data = JSON.parse(choice?.content ?? '{}')

    return {
      doc_type: data.doc_type ?? null,
      po: data.po ?? null,
      amount: data.amount ?? null,
      store_numbers: normalizeStoreNumbers(Array.isArray(data.store_numbers) ? data.store_numbers : []),
      summary: String(data.summary ?? '').slice(0, 160),
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    }
  } catch {
    return empty
  }
}
