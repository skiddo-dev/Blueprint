import { sequence } from '@sveltejs/kit/hooks'
import { handle as authHandle } from '$lib/auth'
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { ensureGraphSubscriptions } from '$lib/server/graphSubscription'
import { runEmailSync } from '$lib/server/emailSync'
import { log } from '$lib/server/log'
import { building } from '$app/environment'

// ── Production safety guard ───────────────────────────────────────────────────
// Refuse to boot a production build that still has the dev-only auth bypass
// (DEV_FAKE_AUTH) enabled. Keyed on NODE_ENV=production (set by the Dockerfile),
// so it never interferes with local `vite dev` / `vite preview`. Runs at module
// load, so the server crashes on startup rather than ever serving with auth off.
export function fakeAuthInProd(nodeEnv: string | undefined, fakeAuth: string | undefined): boolean {
  return nodeEnv === 'production' && !!fakeAuth
}
if (!building && fakeAuthInProd(process.env.NODE_ENV, env.DEV_FAKE_AUTH)) {
  throw new Error(
    'Refusing to start: DEV_FAKE_AUTH is set with NODE_ENV=production. This dev-only ' +
      'auth bypass must never run in production — unset DEV_FAKE_AUTH.',
  )
}

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
      log.error('background job failed', { label, error: e instanceof Error ? e.message : String(e) })
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

const guard: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname

  // Always-public: Auth.js routes, sign-in/unauthorized, the Graph webhook
  // (Microsoft posts to it without a user session), and the health probes.
  if (
    path === '/login' ||
    path === '/healthz' ||
    path === '/readyz' ||
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

export const handle = sequence(csrfGuard, authHandle, guard)

// Catches UNEXPECTED server errors (thrown error()/redirect() are handled by
// SvelteKit and never reach here). Logs the full error with a correlation id and
// returns a sanitized shape — the stack/message never leak to the client; the id
// lets a user quote it for support.
export const handleError: HandleServerError = ({ error, event, status }) => {
  const id = crypto.randomUUID()
  log.error('unhandled server error', {
    id,
    status,
    method: event.request.method,
    path: event.url.pathname,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return { message: 'Internal error', id }
}
