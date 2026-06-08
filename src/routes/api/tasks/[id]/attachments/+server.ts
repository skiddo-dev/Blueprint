import { json, error } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import type { RequestHandler } from './$types'
import { saveAttachment } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'

// Cap an upload at the same size as the email-sync attachment limit
// (MAX_ATTACHMENT_SIZE_MB, default 10 MB) so the card can't smuggle in a bigger
// blob than the inbound path allows.
const MAX_BYTES = (parseInt(env.MAX_ATTACHMENT_SIZE_MB ?? '10', 10) || 10) * 1024 * 1024

// Upload a file to a card. Anyone who can access the task may attach to it — the
// same rule the comment / download endpoints share (assertCanAccessTask). The
// file rides in as multipart/form-data under the `file` field; the bytes land in
// the `attachments` collection and the display metadata is pushed onto the task.
export const POST: RequestHandler = async ({ params, request, locals }) => {
  await assertCanAccessTask(locals, params.id)

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) throw error(400, 'No file provided')
  if (file.size > MAX_BYTES) {
    throw error(413, `File too large — max ${Math.round(MAX_BYTES / 1024 / 1024)} MB`)
  }

  // Keep just the base name (strip any path the browser leaked) and bound its
  // length; the download endpoint header-sanitizes it again on the way out.
  const filename = (file.name || 'attachment').split(/[\\/]/).pop()!.slice(0, 255) || 'attachment'
  const content = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || 'application/octet-stream'

  // 'upload' → a file a user deliberately attached; kept like task details, never
  // auto-purged by the email-attachment retention policy.
  const attachment = await saveAttachment(params.id, filename, content, file.size, contentType, 'upload')
  return json({ ok: true, attachment }, { status: 201 })
}
