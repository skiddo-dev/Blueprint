import { sequence } from '@sveltejs/kit/hooks'
import { handle as authHandle } from '$lib/auth'
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { dev } from '$app/environment'
import { ensureGraphSubscriptions } from '$lib/server/graphSubscription'
import { runEmailSync } from '$lib/server/emailSync'
import { log } from '$lib/server/log'
import { building } from '$app/environment'
import { missingProdEnv } from '$lib/server/config'

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

// Refuse to boot a production runtime that is missing required configuration,
// rather than silently degrade (blank Entra creds / localhost Mongo / keyless
// OpenAI). Production-only (NODE_ENV is set by the Dockerfile); dev keeps its
// convenient fallbacks. Skipped during build.
if (!building && process.env.NODE_ENV === 'production') {
  const missing = missingProdEnv()
  if (missing.length) {
    throw new Error(
      `Refusing to start: missing required production env (${missing.join(', ')}). ` +
        'Set them as Container App secrets/settings.',
    )
  }
}

// ── HTTP security headers ─────────────────────────────────────────────────────
// Sent on every response. The strong directives (frame-ancestors / base-uri /
// form-action / object-src) and the supporting headers (nosniff, X-Frame-Options,
// Referrer-Policy, Permissions-Policy, HSTS) cost nothing and close clickjacking,
// MIME-sniffing, and referrer-leak vectors.
//
// CSP deliberately keeps 'unsafe-inline' for script/style. The app has legitimate
// inline scripts (app.html's no-flash theme boot, SvelteKit's per-page hydration
// payload) and the admin Competitive Landscape page drops a self-contained sheet —
// inline <script>/<style> + Google Fonts — into a sandboxed `srcdoc` iframe that
// INHERITS this policy. A nonce/hash scheme can't reach that runtime-injected
// iframe markup without extra plumbing, and Leaflet/Chart.js set inline styles too.
// So we allow inline here and rely on DOMPurify (user content) + the Entra gate.
// Upgrading script-src to nonces (via kit.csp) is a tracked follow-up.
export const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // The "Sign in with Microsoft" form POSTs to /auth/signin (self), and Auth.js
  // answers with a redirect to login.microsoftonline.com's OAuth authorize endpoint.
  // form-action governs the whole form-submission redirect chain, so the Entra host
  // must be allowed here or the sign-in navigation is refused.
  "form-action 'self' https://login.microsoftonline.com",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:", // Leaflet raster tiles + inline data URIs
  "connect-src 'self'",
  "frame-src 'self'", // the Competitive Landscape srcdoc iframe
].join('; ')

/** The security headers for a response. Pure + exported so it's unit-testable.
 *  CSP is skipped in dev because Vite's HMR client injects inline scripts and uses
 *  eval/websockets that a strict policy would block; it's enforced in every built
 *  (preview/prod) run. HSTS is only meaningful over real HTTPS (the prod ingress) —
 *  browsers ignore it on http/localhost — so it's gated on dev + the actual scheme. */
export function buildSecurityHeaders({ dev, https }: { dev: boolean; https: boolean }): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  }
  if (!dev) headers['Content-Security-Policy'] = CSP
  if (!dev && https) headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains'
  return headers
}

/** Apply headers to a response, tolerating immutable-header responses. Most
 *  responses have mutable headers, but `Response.redirect()` — which Auth.js uses
 *  for the OAuth sign-in redirect to Microsoft Entra — returns a response whose
 *  headers are IMMUTABLE, so a bare `headers.set()` throws `TypeError: immutable`
 *  and 500s the sign-in (caught in prod, not dev: DEV_FAKE_AUTH skips the real
 *  redirect). In that case rebuild the response with a fresh, mutable Headers
 *  carrying both sets. Pure + exported so it's unit-testable. */
export function applySecurityHeaders(response: Response, extra: Record<string, string>): Response {
  try {
    for (const [k, v] of Object.entries(extra)) response.headers.set(k, v)
    return response
  } catch {
    const headers = new Headers(response.headers)
    for (const [k, v] of Object.entries(extra)) headers.set(k, v)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event)
  // Behind the Container Apps ingress TLS terminates at the proxy, so the request
  // the node server sees is http — trust the forwarded scheme for the HSTS gate.
  const https =
    event.url.protocol === 'https:' ||
    event.request.headers.get('x-forwarded-proto') === 'https'
  return applySecurityHeaders(response, buildSecurityHeaders({ dev, https }))
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
//
// IMPORTANT: cross-origin application/json POSTs are kept safe by the browser's
// CORS preflight (no permissive Access-Control-Allow-Origin is ever sent, so a
// forged cross-site JSON request can't be read/sent). Do NOT add a permissive
// CORS header anywhere without also tightening this guard to cover JSON.
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
    (path.startsWith('/dashboard') ||
      path.startsWith('/quotes') ||
      path.startsWith('/prospects') ||
      path.startsWith('/competitive-landscape')) &&
    user.role !== 'admin'
  ) {
    throw redirect(302, '/')
  }

  return resolve(event)
}

export const handle = sequence(securityHeaders, csrfGuard, authHandle, devAuthBypass, guard)

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
