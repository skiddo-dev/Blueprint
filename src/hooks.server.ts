import { sequence } from '@sveltejs/kit/hooks'
import { handle as authHandle } from '$lib/auth'
import { redirect, type Handle } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { dev } from '$app/environment'
import { ensureGraphSubscriptions } from '$lib/server/graphSubscription'
import { runEmailSync } from '$lib/server/emailSync'

// ── Background jobs ──────────────────────────────────────────────────────────
// Keep the Microsoft Graph push subscriptions alive (one per PM mailbox, renewed
// before expiry) and run a low-frequency safety-net sync so a missed webhook is
// never permanently lost. Runs in the always-on server process (min 1 replica).
// Both ensureGraphSubscriptions() and runEmailSync() hold their own distributed
// leases, so across the (up to 2) replicas the worst case is a skipped tick, not
// a conflict or duplicate subscriptions.
// Skipped unless APP_BASE_URL is a public https origin — never runs in dev/build.
let _bgStarted = false
function startBackgroundJobs() {
  if (_bgStarted) return
  const base = env.APP_BASE_URL ?? ''
  const isPublic = /^https:\/\//.test(base) && !/localhost|127\.0\.0\.1/.test(base)
  if (!isPublic) return
  _bgStarted = true

  const run = async (label: string) => {
    try {
      await ensureGraphSubscriptions()
      await runEmailSync({ triggeredBy: 'Email sync' })
    } catch (e) {
      console.error('[bg]', label, e)
    }
  }
  setTimeout(() => run('boot'), 15_000) // shortly after boot: create the subscription + initial sync
  setInterval(() => run('interval'), 10 * 60_000) // every 10 min: renew-if-needed + safety-net sync
}
startBackgroundJobs()

// Re-implementation of SvelteKit's CSRF origin check (disabled via
// kit.csrf.checkOrigin in svelte.config.js because it runs before hooks and 403s
// Graph's text/plain validation handshake). Same rule — block cross-origin form
// submissions — but exempt the Graph webhook, which is authenticated by
// clientState instead. The app's own mutations use application/json (not a form
// content-type), so they're unaffected either way.
const FORM_CONTENT_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const csrfGuard: Handle = async ({ event, resolve }) => {
  const { request, url } = event
  if (!url.pathname.startsWith('/api/graph/') && MUTATING.has(request.method)) {
    const ct = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const origin = request.headers.get('origin')
    if (FORM_CONTENT_TYPES.includes(ct) && origin !== url.origin) {
      return new Response(`Cross-site ${request.method} form submissions are forbidden`, { status: 403 })
    }
  }
  return resolve(event)
}

// ── DEV-ONLY auth bypass ─────────────────────────────────────────────────────
// Injects a fake admin session so the app can be previewed/screenshotted locally
// without an interactive Microsoft Entra sign-in. HARD-GATED two ways: `dev` (this
// branch is stripped from the production `vite build`) AND an explicit opt-in env
// flag (DEV_FAKE_AUTH=true). It is inert by default even in dev, and can never run
// in production. Remove this handle (and its entry in the sequence below) to drop
// the capability entirely.
const devAuthBypass: Handle = async ({ event, resolve }) => {
  if (dev && env.DEV_FAKE_AUTH === 'true') {
    const email = (env.ADMIN_EMAILS ?? '').split(',')[0].trim().toLowerCase() || 'dev@local'
    event.locals.auth = (async () => ({
      user: { email, name: 'Dev Admin', role: 'admin', displayName: 'Dev Admin' },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    })) as typeof event.locals.auth
  }
  return resolve(event)
}

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

  // Admin-only pages (API routes do their own role checks + return 403)
  if (
    (path.startsWith('/dashboard') || path.startsWith('/quotes') || path.startsWith('/prospects')) &&
    user.role !== 'admin'
  ) {
    throw redirect(302, '/')
  }

  return resolve(event)
}

export const handle = sequence(csrfGuard, authHandle, devAuthBypass, guard)
