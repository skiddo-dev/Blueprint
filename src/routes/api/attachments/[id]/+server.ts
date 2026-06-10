import { error } from '@sveltejs/kit'
import { Binary } from 'mongodb'
import type { RequestHandler } from './$types'
import { getAttachment } from '$lib/server/db'
import { assertCanAccessTask, requireAdmin } from '$lib/server/authz'
import { contentDisposition } from '$lib/sanitize'

export const GET: RequestHandler = async ({ params, locals }) => {
  const att = await getAttachment(params.id)
  if (!att) throw error(404, 'Attachment not found')

  // Authorize against the OWNING document. Task attachments (including legacy
  // rows from before owner_type existed) are visible to whoever can access the
  // task; accounting-document attachments are admin-only, matching the
  // /accounting guard. Without this, any signed-in user could fetch any
  // attachment by guessing its id (IDOR).
  if (att.owner_type === 'task' || (!att.owner_type && att.task_id)) {
    await assertCanAccessTask(locals, (att.task_id ?? att.owner_id) as string)
  } else {
    await requireAdmin(locals)
  }

  // The metadata row outlives the file: an email attachment's bytes are stripped
  // after the 30-day retention window (data_purged_at set, `data` unset). Serve a
  // clear 410 rather than streaming an empty body.
  if (att.data == null) {
    throw error(410, 'This attachment was removed under the 30-day email-attachment retention policy.')
  }

  // The driver deserializes a stored Buffer as BSON Binary, and
  // `new Uint8Array(someBinary)` is silently ZERO-LENGTH (Binary's `length` is a
  // method, not a property) — serving it shipped 0-byte downloads. Unwrap first.
  const bytes = att.data instanceof Binary ? att.data.value() : (att.data as Uint8Array)

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': (att.content_type as string) ?? 'application/octet-stream',
      'Content-Disposition': contentDisposition(String(att.filename ?? 'attachment')),
    },
  })
}
