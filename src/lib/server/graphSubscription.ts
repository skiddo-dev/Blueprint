import { env } from '$env/dynamic/private'
import { getGraphToken } from './email'
import { getMeta, setMeta } from './db'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const META_ID = 'graph_subscription'
// Message subscriptions cap at ~4230 min (≈2.94 days); stay a little under.
const MAX_MINUTES = 4170
const RENEW_WITHIN_MS = 12 * 60 * 60_000 // renew when <12h remain

function config() {
  const base = env.APP_BASE_URL ?? ''
  return {
    mailbox: env.AZURE_USER_EMAIL ?? '',
    secret: env.GRAPH_WEBHOOK_SECRET ?? '',
    notificationUrl: base ? `${base.replace(/\/$/, '')}/api/graph/notifications` : '',
    // Graph must be able to reach the URL — only a public https origin works.
    public: /^https:\/\//.test(base) && !/localhost|127\.0\.0\.1/.test(base),
  }
}

function nextExpiry(): string {
  return new Date(Date.now() + MAX_MINUTES * 60_000).toISOString()
}

/** Create the mailbox change-notification subscription if missing/expired, or
 *  extend it when it's close to expiring. Safe to call repeatedly (idempotent).
 *  No-op (and logs why) when the app isn't publicly reachable or config is
 *  missing — e.g. local dev, where Graph can't call back. */
export async function ensureGraphSubscription(): Promise<void> {
  const c = config()
  if (!c.public || !c.mailbox || !c.secret) {
    console.log('[graph-sub] skipped (needs public APP_BASE_URL + AZURE_USER_EMAIL + GRAPH_WEBHOOK_SECRET)')
    return
  }

  try {
    const stored = await getMeta(META_ID)
    const subId = stored?.subscriptionId as string | undefined
    const expMs = stored?.expirationDateTime ? Date.parse(String(stored.expirationDateTime)) : 0

    // Healthy and not near expiry → nothing to do (cheap path, no Graph call —
    // this runs on every background tick).
    if (subId && expMs - Date.now() > RENEW_WITHIN_MS) return

    const token = await getGraphToken()
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    // Try to renew an existing subscription first.
    if (subId) {
      const exp = nextExpiry()
      const res = await fetch(`${GRAPH}/subscriptions/${subId}`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ expirationDateTime: exp }),
      })
      if (res.ok) {
        await setMeta(META_ID, { subscriptionId: subId, expirationDateTime: exp })
        console.log('[graph-sub] renewed', subId, 'until', exp)
        return
      }
      console.warn('[graph-sub] renew failed, will recreate:', res.status, await res.text())
    }

    // Create a fresh subscription. Graph immediately calls notificationUrl with a
    // ?validationToken which our webhook echoes — so this only works once the app
    // is deployed and publicly reachable.
    const exp = nextExpiry()
    const res = await fetch(`${GRAPH}/subscriptions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        changeType: 'created,updated',
        notificationUrl: c.notificationUrl,
        resource: `/users/${c.mailbox}/messages`,
        expirationDateTime: exp,
        clientState: c.secret,
      }),
    })
    if (!res.ok) {
      console.error('[graph-sub] create failed:', res.status, await res.text())
      return
    }
    const sub = await res.json()
    await setMeta(META_ID, { subscriptionId: sub.id, expirationDateTime: sub.expirationDateTime ?? exp })
    console.log('[graph-sub] created', sub.id, 'until', sub.expirationDateTime ?? exp)
  } catch (e) {
    console.error('[graph-sub] error:', e)
  }
}
