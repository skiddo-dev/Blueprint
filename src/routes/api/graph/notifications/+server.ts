import { env } from '$env/dynamic/private'
import type { RequestHandler } from './$types'
import { runEmailSync } from '$lib/server/emailSync'
import { ensureGraphSubscription } from '$lib/server/graphSubscription'

// Microsoft Graph change-notification webhook (public — see the allowlist in
// hooks.server.ts). Two jobs:
//   1. Answer the subscription-validation handshake (echo ?validationToken).
//   2. On a valid notification, kick off the email→task sync and ack fast.

function validationResponse(url: URL): Response | null {
  const token = url.searchParams.get('validationToken')
  if (token === null) return null
  // Must echo the token verbatim as text/plain, 200, within 10s.
  return new Response(token, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

interface Notification {
  clientState?: string
  lifecycleEvent?: string
}

export const POST: RequestHandler = async ({ request, url }) => {
  const validation = validationResponse(url)
  if (validation) return validation

  let value: Notification[] = []
  try {
    const body = (await request.json()) as { value?: Notification[] }
    value = Array.isArray(body.value) ? body.value : []
  } catch {
    /* malformed body — fall through to a 202 ack */
  }

  // Only act on notifications carrying our clientState (guards the public URL).
  const secret = env.GRAPH_WEBHOOK_SECRET ?? ''
  const valid = value.filter(n => n.clientState === secret && secret !== '')
  const hasLifecycle = valid.some(n => !!n.lifecycleEvent)
  const hasChange = valid.some(n => !n.lifecycleEvent)

  // Ack immediately (Graph wants a fast 2xx); do the work in the background. The
  // sync's own debounce lease collapses a burst of notifications into one sweep.
  if (hasLifecycle) {
    ensureGraphSubscription().catch(e => console.error('[graph-webhook] ensure:', e))
  }
  if (hasChange) {
    runEmailSync({ triggeredBy: 'Email push' }).catch(e => console.error('[graph-webhook] sync:', e))
  }

  return new Response(null, { status: 202 })
}

// Some validation probes use GET; echo the token there too.
export const GET: RequestHandler = async ({ url }) =>
  validationResponse(url) ?? new Response(null, { status: 202 })
