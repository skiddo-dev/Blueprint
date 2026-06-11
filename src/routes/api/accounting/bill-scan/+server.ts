import { json, error } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import type { RequestHandler } from './$types'
import { requireAdmin } from '$lib/server/authz'
import { getAccounts } from '$lib/server/accounting'
import { listPOs } from '$lib/server/purchaseOrders'
import { aiConfigured, parseBillDocument } from '$lib/server/booksAi'
import { suggestPoMatch } from '$lib/accounting/billScan'
import { parseMoney } from '$lib/money'
import { usd } from '$lib/accounting/format'

// Admin-only. Read a vendor invoice (PDF/photo) into prefill values for the
// new-bill form, plus the open PO it most likely fulfills. Persists NOTHING —
// the user reviews the draft and posts through the normal bills endpoint; only
// then does the file attach to the created bill (orphan-free, same contract as
// the receipt scan).
const dollars = (s: string | null): string | null => {
  if (!s) return null
  try {
    const c = parseMoney(s)
    return c > 0 ? (c / 100).toFixed(2) : null
  } catch {
    return null
  }
}

export const POST: RequestHandler = async ({ request, locals }) => {
  await requireAdmin(locals)
  if (!aiConfigured()) throw error(503, 'Bill scan needs OPENAI_API_KEY configured')
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw error(400, 'Expected multipart/form-data with a file')
  const maxMb = Number(env.MAX_ATTACHMENT_SIZE_MB) > 0 ? Number(env.MAX_ATTACHMENT_SIZE_MB) : 10
  if (file.size > maxMb * 1024 * 1024) throw error(413, `File exceeds the ${maxMb} MB limit`)

  const buf = Buffer.from(await file.arrayBuffer())
  const accounts = await getAccounts()
  const parsed = await parseBillDocument(file.name, file.type || undefined, buf, accounts)
  if (!parsed) throw error(415, 'Unsupported file type — use a PDF, photo (png/jpeg), or text file')

  // The scanned per-line amounts only become the draft when they add up to the
  // printed total (±1 cent per line of rounding); otherwise one line for the
  // whole bill is safer than lines that don't sum.
  const totalDollars = dollars(parsed.total)
  let lines = parsed.lines
    .map((l) => ({ description: l.description, amount: dollars(l.amount), account_id: l.account_id ?? '' }))
    .filter((l) => l.amount !== null)
  if (totalDollars && lines.length) {
    const sum = lines.reduce((s, l) => s + Math.round(Number(l.amount) * 100), 0)
    const total = Math.round(Number(totalDollars) * 100)
    if (Math.abs(sum - total) > lines.length) lines = []
  }
  if (!lines.length && totalDollars) {
    lines = [{ description: parsed.memo || 'Per attached invoice', amount: totalDollars, account_id: parsed.lines[0]?.account_id ?? '' }]
  }

  const pos = await listPOs()
  const totalCents = (() => {
    if (!parsed.total) return null
    try { return parseMoney(parsed.total) } catch { return null }
  })()
  const match = suggestPoMatch(pos, { vendor: parsed.vendor, po: parsed.po, totalCents })

  return json({
    parsed,
    prefill: {
      vendor_name: parsed.vendor ?? '',
      vendor_invoice_no: parsed.vendor_invoice_no ?? '',
      bill_date: parsed.bill_date ?? new Date().toISOString().slice(0, 10),
      memo: parsed.memo,
      lines,
    },
    po_match: match
      ? { ...match, remaining_display: usd(match.remaining) }
      : null,
  })
}
