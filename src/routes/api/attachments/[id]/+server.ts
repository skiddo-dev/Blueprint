import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getAttachment } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'
import { contentDisposition } from '$lib/sanitize'

export const GET: RequestHandler = async ({ params, locals }) => {
  const att = await getAttachment(params.id)
  if (!att) throw error(404, 'Attachment not found')

  // Authorize against the OWNING task: an attachment is only visible to someone
  // who can access its task (admin, or assignee/creator). Without this, any
  // signed-in user could fetch any attachment by guessing its id (IDOR).
  await assertCanAccessTask(locals, att.task_id as string)

  // The metadata row outlives the file: an email attachment's bytes are stripped
  // after the 30-day retention window (data_purged_at set, `data` unset). Serve a
  // clear 410 rather than streaming an empty body.
  if (att.data == null) {
    throw error(410, 'This attachment was removed under the 30-day email-attachment retention policy.')
  }

  return new Response(new Uint8Array(att.data as Buffer), {
    headers: {
      'Content-Type': (att.content_type as string) ?? 'application/octet-stream',
      'Content-Disposition': contentDisposition(String(att.filename ?? 'attachment')),
    },
  })
}
