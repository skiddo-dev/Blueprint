import { env } from '$env/dynamic/private'
import { getGraphToken } from './email'
import { getMeta, setMeta, getUsers, tryAcquireLease, releaseLease } from './db'
import { resolveMailboxes } from './syncLogic'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const META_ID = 'graph_subscriptions'
const LEGACY_META_ID = 'graph_subscription' // the old single-mailbox doc
// Message subscriptions cap at ~4230 min (≈2.94 days); stay a little under.
const MAX_MINUTES = 4170
const RENEW_WITHIN_MS = 12 * 60 * 60_000 // renew when <12h remain

interface SubRecord {
  mailbox: string
  id: string
  expirationDateTime: string
}

function config() {
  const base = env.APP_BASE_URL ?? ''
  return {
    secret: env.GRAPH_WEBHOOK_SECRET ?? '',
    notificationUrl: base ? `${base.replace(/\/$/, '')}/api/graph/notifications` : '',
    // Graph must be able to reach the URL — only a public https origin works.
    public: /^https:\/\//.test(base) && !/localhost|127\.0\.0\.1/.test(base),
  }
}

function nextExpiry(): string {
  return new Date(Date.now() + MAX_MINUTES * 60_000).toISOString()
}

// The same mailbox set runEmailSync scans (provisioned PMs / PM_MAILBOXES +
// the central AZURE_USER_EMAIL), so a subscription exists for every inbox we poll.
async function listMailboxes(): Promise<string[]> {
  const users = await getUsers()
  return resolveMailboxes({
    users: users.map(u => ({ _id: String(u._id), name: u.name, role: u.role })),
    explicit: env.PM_MAILBOXES,
    central: env.AZURE_USER_EMAIL,
  }).map(m => m.email)
}

/** Create/renew a Microsoft Graph change-notification subscription for EACH PM
 *  mailbox (so flagged email syncs in real time across all of them), and tear
 *  down subscriptions for mailboxes no longer in scope. Safe to call repeatedly
 *  (idempotent) and leased so only one replica manages subscriptions at a time.
 *  No-op when the app isn't publicly reachable (e.g. local dev). */
export async function ensureGraphSubscriptions(): Promise<void> {
  const c = config()
  if (!c.public || !c.secret) {
    console.log('[graph-sub] skipped (needs public APP_BASE_URL + GRAPH_WEBHOOK_SECRET)')
    return
  }

  // Single-flight across replicas so we don't create duplicate subscriptions.
  if (!(await tryAcquireLease('graph_subs', 2 * 60_000))) return

  try {
    const mailboxes = await listMailboxes()
    if (!mailboxes.length) {
      console.log('[graph-sub] no mailboxes (provision PMs, or set PM_MAILBOXES / AZURE_USER_EMAIL)')
      return
    }

    const storedDoc = await getMeta(META_ID)
    const stored = (storedDoc?.subs as SubRecord[] | undefined) ?? undefined
    const subs = new Map<string, SubRecord>((stored ?? []).map(s => [s.mailbox, s]))

    // One-time migration: fold the legacy single-mailbox subscription into the map
    // so we renew it instead of orphaning it (it would otherwise linger ~3 days).
    if (!stored) {
      const legacy = await getMeta(LEGACY_META_ID)
      const legacyMailbox = (env.AZURE_USER_EMAIL ?? '').trim().toLowerCase()
      if (legacy?.subscriptionId && legacyMailbox) {
        subs.set(legacyMailbox, {
          mailbox: legacyMailbox,
          id: String(legacy.subscriptionId),
          expirationDateTime: String(legacy.expirationDateTime ?? new Date(0).toISOString()),
        })
      }
    }

    const token = await getGraphToken()
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const wanted = new Set(mailboxes)

    // Drop (and best-effort delete) subscriptions for mailboxes we no longer scan.
    for (const email of [...subs.keys()]) {
      if (!wanted.has(email)) {
        const rec = subs.get(email)!
        subs.delete(email)
        fetch(`${GRAPH}/subscriptions/${rec.id}`, { method: 'DELETE', headers: auth }).catch(() => {})
        console.log('[graph-sub] removed (mailbox out of scope)', email)
      }
    }

    // Create or renew per mailbox. One mailbox failing doesn't block the others.
    for (const email of mailboxes) {
      const rec = subs.get(email)
      const expMs = rec?.expirationDateTime ? Date.parse(rec.expirationDateTime) : 0
      if (rec && expMs - Date.now() > RENEW_WITHIN_MS) continue // healthy, not near expiry

      const exp = nextExpiry()
      try {
        if (rec) {
          const res = await fetch(`${GRAPH}/subscriptions/${rec.id}`, {
            method: 'PATCH',
            headers: auth,
            body: JSON.stringify({ expirationDateTime: exp }),
          })
          if (res.ok) {
            subs.set(email, { mailbox: email, id: rec.id, expirationDateTime: exp })
            console.log('[graph-sub] renewed', email)
            continue
          }
          console.warn('[graph-sub] renew failed, recreating', email, res.status)
        }

        const res = await fetch(`${GRAPH}/subscriptions`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({
            changeType: 'created,updated',
            notificationUrl: c.notificationUrl,
            resource: `/users/${encodeURIComponent(email)}/messages`,
            expirationDateTime: exp,
            clientState: c.secret,
          }),
        })
        if (!res.ok) {
          console.error('[graph-sub] create failed', email, res.status, await res.text())
          continue
        }
        const sub = await res.json()
        subs.set(email, { mailbox: email, id: sub.id, expirationDateTime: sub.expirationDateTime ?? exp })
        console.log('[graph-sub] created', email, sub.id)
      } catch (e) {
        console.error('[graph-sub] error for', email, e)
      }
    }

    await setMeta(META_ID, { subs: [...subs.values()] })
  } finally {
    await releaseLease('graph_subs')
  }
}
