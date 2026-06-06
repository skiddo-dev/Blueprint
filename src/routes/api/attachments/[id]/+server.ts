import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getAttachment } from '$lib/server/db'
import { assertCanAccessTask } from '$lib/server/authz'

export const GET: RequestHandler = async ({ params, locals }) => {
  const att = await getAttachment(params.id)
  if (!att) throw error(404, 'Attachment not found')

  // Authorize against the OWNING task: an attachment is only visible to someone
  // who can access its task (admin, or assignee/creator). Without this, any
  // signed-in user could fetch any attachment by guessing its id (IDOR).
  await assertCanAccessTask(locals, att.task_id as string)

  return new Response(new Uint8Array(att.data as Buffer), {
    headers: {
      'Content-Type': (att.content_type as string) ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${att.filename}"`,
    },
  })
}
