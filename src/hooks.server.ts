import { sequence } from '@sveltejs/kit/hooks'
import { handle as authHandle } from '$lib/auth'
import { redirect, type Handle } from '@sveltejs/kit'

const guard: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname

  // Auth.js routes and the sign-in / unauthorized pages are always public
  if (
    path.startsWith('/auth/') ||
    path.startsWith('/api/auth/')
  ) {
    return resolve(event)
  }

  const session = await event.locals.auth()
  const user = session?.user as Record<string, unknown> | undefined

  if (!user) {
    throw redirect(302, '/auth/signin')
  }

  // Provisioned check — role is attached by the session callback in auth.ts
  if (!user.role) {
    if (path !== '/auth/unauthorized') {
      throw redirect(302, '/auth/unauthorized')
    }
    return resolve(event)
  }

  // Admin-only pages
  if ((path.startsWith('/dashboard') || path.startsWith('/quotes')) && user.role !== 'admin') {
    throw redirect(302, '/')
  }

  return resolve(event)
}

export const handle = sequence(authHandle, guard)
