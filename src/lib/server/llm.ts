import OpenAI from 'openai'
import { env } from '$env/dynamic/private'

// Lazily initialized — avoids throwing during build when OPENAI_API_KEY isn't set.
// Reads via $env/dynamic/private, NOT process.env (empty under Vite 8 SSR — an
// empty key silently degrades parsing via the catch below). See src/lib/server/db.ts.
let _client: OpenAI | null = null
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return _client
}

interface ParsedEmail {
  date: string | null
  assigned_to: string | null
  quote: string | null
  summary: string
}

export async function parseEmailWithLLM(email: {
  subject: string
  from: string
  sender_name?: string
  sender_email?: string
  date: string
  body: string
  attachments?: { filename: string; skipped?: boolean }[]
}): Promise<ParsedEmail> {
  const attNames = (email.attachments ?? [])
    .filter(a => !a.skipped)
    .map(a => a.filename)
    .join(', ')

  const prompt = `
You are an assistant extracting structured data from grocery construction emails.
Return JSON with:
- "date": Task date ISO 8601. Infer from email date if not explicit.
- "assigned_to": Person/team assigned (string). Null if unclear.
- "quote": Monetary figure (raw string, e.g. "$12,300"). Null if none.
- "summary": Concise summary of email content, max 200 chars.

Email:
Subject: ${email.subject}
From: ${email.from}
Date: ${email.date}
Body: ${email.body.slice(0, 1500)}
${attNames ? `Attachments: ${attNames}` : ''}

Return ONLY a JSON object.`.trim()

  try {
    const resp = await getClient().chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 200,
    })
    const raw = resp.choices[0].message.content?.trim() ?? '{}'
    const data = JSON.parse(raw)
    return {
      date: data.date ?? null,
      assigned_to: data.assigned_to ?? null,
      quote: data.quote ?? null,
      summary: (data.summary ?? '').slice(0, 200),
    }
  } catch {
    return {
      date: null,
      assigned_to: null,
      quote: null,
      summary: email.body.slice(0, 200),
    }
  }
}
