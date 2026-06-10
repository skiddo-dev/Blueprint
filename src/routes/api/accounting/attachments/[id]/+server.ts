import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { deleteOwnedAttachment, getAttachment, type AttachmentOwner } from '$lib/server/db'
import { requireAdmin, actorOf } from '$lib/server/authz'
import { writeAudit } from '$lib/server/audit'

// Admin-only. Remove an attachment from an accounting document (task
// attachments go through their own scoped endpoint).
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = await requireAdmin(locals)
  const att = await getAttachment(params.id)
  if (!att || att.owner_type === 'task' || !att.owner_type) throw error(404, 'No such accounting attachment')
  const owner = { type: att.owner_type, id: att.owner_id } as AttachmentOwner
  const ok = await deleteOwnedAttachment(owner, params.id)
  if (!ok) throw error(404, 'No such accounting attachment')
  await writeAudit({
    actor: actorOf(user),
    action: 'attachment.delete',
    entity_type: owner.type,
    entity_id: owner.id,
    summary: `Removed attachment ${att.filename ?? params.id}`,
  })
  return json({ ok: true })
}
