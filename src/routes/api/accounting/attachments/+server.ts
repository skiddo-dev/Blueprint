import { json, error } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import type { RequestHandler } from './$types'
import { saveOwnedAttachment, getDb, type AttachmentOwner } from '$lib/server/db'
import { requireAdmin, actorOf } from '$lib/server/authz'
import { writeAudit } from '$lib/server/audit'

const OWNER_TYPES = new Set(['invoice', 'bill', 'journal-entry'])
const OWNER_COLLECTION: Record<string, string> = {
  invoice: 'invoices', bill: 'bills', 'journal-entry': 'journalEntries',
}

// Admin-only. Upload a file onto an accounting document (invoice, bill, or a
// journal entry — receipts on expenses). multipart/form-data: owner_type,
// owner_id, file. Same size cap as task attachments.
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireAdmin(locals)
  const form = await request.formData().catch(() => null)
  if (!form) throw error(400, 'Expected multipart/form-data')
  const ownerType = String(form.get('owner_type') ?? '')
  const ownerId = String(form.get('owner_id') ?? '')
  const file = form.get('file')
  if (!OWNER_TYPES.has(ownerType) || !ownerId || !(file instanceof File)) {
    throw error(400, 'Expected owner_type (invoice|bill|journal-entry), owner_id, and a file')
  }

  const maxMb = Number(env.MAX_ATTACHMENT_SIZE_MB) > 0 ? Number(env.MAX_ATTACHMENT_SIZE_MB) : 10
  if (file.size > maxMb * 1024 * 1024) throw error(413, `File exceeds the ${maxMb} MB limit`)

  const d = await getDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerDoc = await (d.collection(OWNER_COLLECTION[ownerType]) as any).findOne({ _id: ownerId }, { projection: { _id: 1 } })
  if (!ownerDoc) throw error(404, `No such ${ownerType}`)

  const buf = Buffer.from(await file.arrayBuffer())
  const meta = await saveOwnedAttachment(
    { type: ownerType, id: ownerId } as AttachmentOwner,
    file.name, buf, file.size, file.type || 'application/octet-stream',
  )
  await writeAudit({
    actor: actorOf(user),
    action: 'attachment.upload',
    entity_type: ownerType,
    entity_id: ownerId,
    summary: `Attached ${file.name} (${Math.round(file.size / 1024)} KB)`,
    meta: { attachment_id: meta.id },
  })
  return json(meta, { status: 201 })
}
