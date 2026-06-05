import { getTasks, getUsers, insertTask, updateTaskField, saveAttachment, tryAcquireLease, releaseLease } from './db'
import { fetchRecentEmails, getGraphToken } from './email'
import { parseEmailWithLLM } from './llm'
import { SUPERVISORS, QUOTE_PEOPLE } from '$lib/constants'
import { extractStoreNumbers, normalizeStoreNumbers } from '$lib/storeNumbers'

interface EmailAttachment {
  filename: string
  size: number
  skipped?: boolean
  download_url?: string
  content_type?: string
  is_inline?: boolean
  error?: string
}

export interface SyncResult {
  count: number
  message: string
  skipped?: boolean
}

// Single source of truth for "turn flagged emails into tasks", shared by the
// manual "Sync now" button (POST /api/sync) and the Graph webhook push. The run
// is idempotent (dedupes on exchange_id) and wrapped in a short distributed
// lease so the button + a burst of webhook notifications collapse into ONE
// sweep instead of stampeding.
export async function runEmailSync({ triggeredBy }: { triggeredBy: string }): Promise<SyncResult> {
  if (!(await tryAcquireLease('email_sync', 5 * 60_000))) {
    return { count: 0, message: '⏳ A sync is already in progress.', skipped: true }
  }

  try {
    const emails = await fetchRecentEmails(30)
    const existing = await getTasks()
    const token = await getGraphToken()
    const headers = { Authorization: `Bearer ${token}` }

    // Constrain the LLM's assigned_to to people who actually exist (matching the
    // board's "Assign to" dropdown): supervisors + quote people + provisioned users.
    const dbUsers = await getUsers()
    const assignees = [...new Set([...SUPERVISORS, ...QUOTE_PEOPLE, ...dbUsers.map(u => u.name)])].filter(Boolean)

    let newCount = 0
    for (const email of emails) {
      if (existing.some(t => t.exchange_id === email.id)) continue

      const parsed = await parseEmailWithLLM(email as Parameters<typeof parseEmailWithLLM>[0], { assignees })
      // Stores from the subject (reliable regex) ∪ stores the LLM found in the body.
      const storeNumbers = normalizeStoreNumbers([
        ...extractStoreNumbers(email.subject),
        ...parsed.store_numbers,
      ])
      const attachmentIds: string[] = []
      const task = {
        title: email.subject,
        description: parsed.summary ?? '',
        full_body: email.body,
        quote: parsed.quote,
        quote_type: parsed.quote_type,
        store_numbers: storeNumbers,
        assigned_to: parsed.assigned_to ?? 'Unassigned',
        notes: '',
        date: parsed.date,
        status: 'To Do',
        exchange_id: email.id,
        from: email.from,
        sender_name: email.sender_name,
        sender_email: email.sender_email,
        created_by: triggeredBy,
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

    return {
      count: newCount,
      message: newCount > 0 ? `✅ Synced ${newCount} new flagged email(s)!` : '📭 No new flagged emails.',
    }
  } finally {
    await releaseLease('email_sync')
  }
}
