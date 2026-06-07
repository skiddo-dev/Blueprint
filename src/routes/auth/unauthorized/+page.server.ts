import { fail } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { createAccessRequest } from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  return {
    email: (user?.email as string) ?? '',
    name: (user?.displayName as string) || (user?.name as string) || '',
  }
}

export const actions: Actions = {
  // Record a pending access request for the signed-in (but un-provisioned) user.
  // Admins see it in the User Access panel (it's polled there); no email is sent.
  requestAccess: async ({ request, locals }) => {
    const session = await locals.auth()
    const user = session?.user as Record<string, unknown> | undefined
    const email = (user?.email as string | undefined)?.toLowerCase()
    if (!email) return fail(401, { error: 'You need to be signed in to request access.' })

    const form = await request.formData()
    const note = String(form.get('note') ?? '').trim().slice(0, 500)
    const name = (user?.displayName as string) || (user?.name as string) || email

    await createAccessRequest(email, name, note)
    return { success: true }
  },
}
