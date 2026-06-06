import OpenAI from 'openai'
import { env } from '$env/dynamic/private'

// Single lazily-initialized OpenAI client shared by the email parser (llm.ts)
// and the attachment parser (attachmentParse.ts). Lazy init avoids throwing
// during build when OPENAI_API_KEY isn't set. Reads via $env/dynamic/private,
// NOT process.env (empty under Vite 8 SSR — an empty key silently degrades
// parsing). See src/lib/server/db.ts for the same root cause.
let _client: OpenAI | null = null
export function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return _client
}

// Email/document extraction is a bulk, structured-parsing job: pick a fast,
// cheap, non-reasoning model (reasoning/"think-always" models are slower and
// worse for this — see the local-LLM bench notes). gpt-4o-mini supports strict
// Structured Outputs; override with OPENAI_MODEL (e.g. gpt-4.1-mini) if desired.
export const MODEL = env.OPENAI_MODEL || 'gpt-4o-mini'
