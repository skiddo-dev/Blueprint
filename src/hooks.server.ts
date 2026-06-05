import { sequence } from '@sveltejs/kit/hooks'
import { handle as authHandle } from '$lib/auth'
import { redirect, type Handle } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { ensureGraphSubscription } from '$lib/server/graphSubscription'
import { runEmailSync } from '$lib/server/emailSync'
import { tryAcquireLease } from '$lib/server/db'

// ── Background jobs ──────────────────────────────────────────────────────────
// Keep the Microsoft Graph push subscription alive (renew before it expires) and
// run a low-frequency safety-net sync so a missed webhook is never permanently
// lost. Runs in the always-on server process (min 1 replica); a Mongo lease lets
// only one replica act per tick. Skipped unless APP_BASE_URL is a public https
// origin — so it never starts in local dev or during build.
let _bgStarted = false
function startBackgroundJobs() {
  if (_bgStarted) return
  const base = env.APP_BASE_URL ?? ''
  const isPublic = /^https:\/\//.test(base) && !/localhost|127\.0\.0\.1/.test(base)
  if (!isPublic) return
  _bgStarted = true

  const tick = async () => {
    try {
      if (!(await tryAcquireLease('graph_manager', 9 * 60_000))) return
      await ensureGraphSubscription()
      await runEmailSync({ triggeredBy: 'Email sync' })
    } catch (e) {
      console.error('[bg] tick error:', e)
    }
  }
  setTimeout(tick, 15_000) // shortly after boot: create the subscription + initial sync
  setInterval(tick, 10 * 60_000) // every 10 min: renew-if-needed + safety-net sync
}
startBackgroundJobs()

const guard: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname

  // Always-public: Auth.js routes, sign-in/unauthorized, and the Graph webhook
  // (Microsoft posts to it without a user session).
  if (
    path === '/login' ||
    path.startsWith('/auth/') ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/graph/')
  ) {
    return resolve(event)
  }

  const session = await event.locals.auth()
  const user = session?.user as Record<string, unknown> | undefined

  if (!user) {
    const callbackUrl = encodeURIComponent(event.url.pathname)
    throw redirect(302, `/login?callbackUrl=${callbackUrl}`)
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
