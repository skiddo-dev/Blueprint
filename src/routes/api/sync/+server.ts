import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTasks, insertTask, updateTaskField, saveAttachment } from '$lib/server/db'
import { fetchRecentEmails, getGraphToken } from '$lib/server/email'
import { parseEmailWithLLM } from '$lib/server/llm'

interface EmailAttachment {
  filename: string
  size: number
  skipped?: boolean
  download_url?: string
  content_type?: string
  is_inline?: boolean
  error?: string
}

export const POST: RequestHandler = async ({ locals }) => {
  const session = await locals.auth()
  const user = session?.user as Record<string, unknown> | undefined
  if (!user) throw error(401)
  if (user.role !== 'admin') throw error(403)
  const userName = (user.displayName as string) ?? (user.name as string) ?? 'admin'

  const emails = await fetchRecentEmails(30)
  const existing = await getTasks()
  const token = await getGraphToken()
  const headers = { Authorization: `Bearer ${token}` }
  let newCount = 0

  for (const email of emails) {
    if (existing.some(t => t.exchange_id === email.id)) continue

    const parsed = await parseEmailWithLLM(email as Parameters<typeof parseEmailWithLLM>[0])
    const attachmentIds: string[] = []
    const task = {
      title: email.subject,
      description: parsed.summary ?? '',
      full_body: email.body,
      quote: parsed.quote,
      assigned_to: parsed.assigned_to ?? 'Unassigned',
      notes: '',
      date: parsed.date,
      status: 'To Do',
      exchange_id: email.id,
      from: email.from,
      sender_name: email.sender_name,
      sender_email: email.sender_email,
      created_by: userName,
      attachment_ids: attachmentIds,
      created_at: new Date().toISOString(),
    }

    const taskId = await insertTask(task)

    // Download and store attachments
    const attachments = (email.attachments ?? []) as EmailAttachment[]
    for (const att of attachments) {
      if (att.skipped || !att.download_url) continue
      try {
        const attRes = await fetch(att.download_url, { headers })
        if (!attRes.ok) continue
        const content = Buffer.from(await attRes.arrayBuffer())
        const attId = await saveAttachment(
          taskId,
          att.filename,
          content,
          att.size,
          att.content_type ?? 'application/octet-stream',
        )
        attachmentIds.push(attId)
        await updateTaskField(taskId, 'attachment_ids', attachmentIds)
      } catch { /* skip failed attachment */ }
    }

    newCount++
  }

  const msg = newCount > 0
    ? `✅ Synced ${newCount} new flagged email(s)!`
    : '📭 No new flagged emails.'
  return json({ ok: true, message: msg, count: newCount })
}
