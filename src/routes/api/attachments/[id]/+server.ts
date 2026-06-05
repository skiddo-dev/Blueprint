import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getAttachment } from '$lib/server/db'

export const GET: RequestHandler = async ({ params, locals }) => {
  const session = await locals.auth()
  if (!session?.user) throw error(401)

  const att = await getAttachment(params.id)
  if (!att) throw error(404, 'Attachment not found')

  return new Response(new Uint8Array(att.data as Buffer), {
    headers: {
      'Content-Type': (att.content_type as string) ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${att.filename}"`,
    },
  })
}
