import { env } from '$env/dynamic/private'

// Read config via $env/dynamic/private, NOT process.env: under Vite 8 SSR,
// process.env is not populated from .env, so client_secret would be empty and
// Microsoft rejects the client_credentials grant (AADSTS7000216). Dynamic env
// also keeps MAX_* optional with code defaults. Same root cause as src/lib/auth.ts.

const FETCH_TIMEOUT_MS = parseInt(env.GRAPH_FETCH_TIMEOUT_MS ?? '20000')
const MAX_SYNC_MESSAGES = parseInt(env.MAX_SYNC_MESSAGES ?? '200')

/** Thrown when the app-only client-credentials grant is rejected by Microsoft —
 *  i.e. a CREDENTIALS/CONSENT problem (expired AZURE_CLIENT_SECRET, wrong tenant,
 *  revoked admin consent), not a transient glitch. Distinguished from generic Graph
 *  errors so the sync layer can surface an actionable message instead of a bare 500. */
export class GraphAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraphAuthError'
  }
}

/** fetch() that aborts after FETCH_TIMEOUT_MS so a hung Graph call can't stall
 *  the whole sync — the run holds a 5-min lease, so without a timeout one wedged
 *  request would block every mailbox queued behind it. */
async function graphFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function getGraphToken(): Promise<string> {
  const tenantId = env.AZURE_TENANT_ID
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const res = await graphFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.AZURE_CLIENT_ID ?? '',
      client_secret: env.AZURE_CLIENT_SECRET ?? '',
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new GraphAuthError(`Graph auth failed: ${data.error_description ?? data.error}`)
  }
  return data.access_token as string
}

// Fetch flagged messages from a SPECIFIC mailbox (app-only Graph perms let us
// read any mailbox in the tenant). The caller — runEmailSync — loops every PM
// inbox; this reads exactly one.
export async function fetchRecentEmails(mailbox: string, pageSize = 30) {
  if (!mailbox) throw new Error('fetchRecentEmails: mailbox is required')
  const maxAttachmentSize = parseInt(env.MAX_ATTACHMENT_SIZE_MB ?? '10') * 1024 * 1024
  const maxAttachmentsPerEmail = parseInt(env.MAX_ATTACHMENTS_PER_EMAIL ?? '5')

  const token = await getGraphToken()
  const headers = { Authorization: `Bearer ${token}` }

  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`

  const params = new URLSearchParams({
    $top: String(pageSize),
    $select: 'id,conversationId,subject,from,receivedDateTime,bodyPreview,body',
    $filter: "flag/flagStatus eq 'flagged'",
  })

  // Page through flagged mail via @odata.nextLink (a mailbox can hold more than
  // one $top page of flags), bounded by MAX_SYNC_MESSAGES so a large backlog
  // can't make a single run unbounded.
  const collected: Record<string, unknown>[] = []
  let next: string | null = `${base}/messages?${params}`
  while (next && collected.length < MAX_SYNC_MESSAGES) {
    const res = await graphFetch(next, { headers })
    if (!res.ok) throw new Error(`Graph messages error: ${res.status}`)
    const data = await res.json()
    collected.push(...((data.value ?? []) as Record<string, unknown>[]))
    next = (data['@odata.nextLink'] as string | undefined) ?? null
  }

  const messages = collected.slice(0, MAX_SYNC_MESSAGES).sort((a, b) =>
    String(b.receivedDateTime ?? '').localeCompare(String(a.receivedDateTime ?? '')),
  )

  const emails = []
  for (const msg of messages) {
    const bodyObj = (msg.body as Record<string, string>) ?? {}
    let body = ''
    if (bodyObj.contentType === 'text') {
      body = bodyObj.content ?? ''
    } else if (bodyObj.contentType === 'html') {
      body = (bodyObj.content ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    } else {
      body = String(msg.bodyPreview ?? '')
    }

    const senderInfo = ((msg.from as Record<string, unknown>)?.emailAddress as Record<string, string>) ?? {}
    const senderEmail = senderInfo.address ?? ''
    const senderName = senderInfo.name ?? ''

    // Fetch attachments for this message
    const attachments: unknown[] = []
    const msgId = msg.id as string
    if (msgId) {
      const attRes = await graphFetch(`${base}/messages/${msgId}/attachments`, { headers })
      if (attRes.ok) {
        const attData = await attRes.json()
        for (const att of (((attData.value as Record<string, unknown>[]) ?? []).slice(0, maxAttachmentsPerEmail))) {
          const size = (att.size as number) ?? 0
          if (att.isInline) {
            attachments.push({ filename: att.name, size, skipped: true, is_inline: true })
          } else if (size > maxAttachmentSize) {
            attachments.push({ filename: att.name, size, skipped: true, error: 'Too large' })
          } else {
            attachments.push({
              filename: att.name,
              size,
              content_type: att.contentType ?? 'application/octet-stream',
              download_url: `${base}/messages/${msgId}/attachments/${att.id}/$value`,
            })
          }
        }
      }
    }

    emails.push({
      id: msgId,
      conversation_id: (msg.conversationId as string) ?? null,
      subject: (msg.subject as string) ?? '(no subject)',
      from: senderName ? `${senderName} <${senderEmail}>` : senderEmail,
      sender_name: senderName,
      sender_email: senderEmail,
      date: (msg.receivedDateTime as string) ?? '',
      body,
      attachments,
    })
  }

  return emails
}
