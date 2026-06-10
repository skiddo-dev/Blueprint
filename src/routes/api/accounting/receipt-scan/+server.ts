import { json, error } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { analyzeAttachment } from '$lib/server/attachmentParse'
import { parseMoney } from '$lib/money'

// Admin-only. Read a receipt (photo/PDF) with the existing attachment-analysis
// pipeline and return prefill values for the expense form. Persists NOTHING —
// the user confirms the draft, posts the expense, and only then uploads the
// file as an attachment on the new entry (orphan-free, two requests).
export const POST: RequestHandler = async ({ request, locals }) => {
  await requireAdmin(locals)
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw error(400, 'Expected multipart/form-data with a file')
  const maxMb = Number(env.MAX_ATTACHMENT_SIZE_MB) > 0 ? Number(env.MAX_ATTACHMENT_SIZE_MB) : 10
  if (file.size > maxMb * 1024 * 1024) throw error(413, `File exceeds the ${maxMb} MB limit`)

  const buf = Buffer.from(await file.arrayBuffer())
  const parsed = await analyzeAttachment(file.name, file.type || undefined, buf)
  if (!parsed) throw error(415, 'Unsupported file type — use a photo (png/jpeg) or PDF')

  // Amount: tolerate model formatting; null prefill on garbage instead of a 500.
  let amount: string | null = null
  if (parsed.amount) {
    try {
      amount = (parseMoney(parsed.amount) / 100).toFixed(2)
    } catch {
      amount = null
    }
  }
  return json({
    parsed,
    prefill: {
      payee: parsed.vendor ?? '',
      amount,
      date: parsed.doc_date ?? new Date().toISOString().slice(0, 10),
      memo: parsed.summary,
    },
  })
}
