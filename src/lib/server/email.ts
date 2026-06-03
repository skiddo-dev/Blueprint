const MAX_ATTACHMENT_SIZE = parseInt(process.env.MAX_ATTACHMENT_SIZE_MB ?? '10') * 1024 * 1024
const MAX_ATTACHMENTS_PER_EMAIL = parseInt(process.env.MAX_ATTACHMENTS_PER_EMAIL ?? '5')

export async function getGraphToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID ?? '',
      client_secret: process.env.AZURE_CLIENT_SECRET ?? '',
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Graph auth failed: ${data.error_description ?? data.error}`)
  }
  return data.access_token as string
}

export async function fetchRecentEmails(maxResults = 30) {
  const token = await getGraphToken()
  const headers = { Authorization: `Bearer ${token}` }

  const base =
    process.env.AZURE_CLIENT_SECRET && process.env.AZURE_USER_EMAIL
      ? `https://graph.microsoft.com/v1.0/users/${process.env.AZURE_USER_EMAIL}`
      : 'https://graph.microsoft.com/v1.0/me'

  const params = new URLSearchParams({
    $top: String(maxResults),
    $select: 'id,subject,from,receivedDateTime,bodyPreview,body',
    $filter: "flag/flagStatus eq 'flagged'",
  })

  const res = await fetch(`${base}/messages?${params}`, { headers })
  if (!res.ok) throw new Error(`Graph messages error: ${res.status}`)
  const data = await res.json()

  const messages = ((data.value ?? []) as Record<string, unknown>[]).sort((a, b) =>
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
      const attRes = await fetch(`${base}/messages/${msgId}/attachments`, { headers })
      if (attRes.ok) {
        const attData = await attRes.json()
        for (const att of (attData.value as Record<string, unknown>[]).slice(0, MAX_ATTACHMENTS_PER_EMAIL)) {
          const size = (att.size as number) ?? 0
          if (att.isInline) {
            attachments.push({ filename: att.name, size, skipped: true, is_inline: true })
          } else if (size > MAX_ATTACHMENT_SIZE) {
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
