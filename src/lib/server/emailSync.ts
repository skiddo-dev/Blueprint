import { getTasks, getUsers, insertTask, saveAttachment, patchTask, tryAcquireLease, releaseLease } from './db'
import { fetchRecentEmails, getGraphToken } from './email'
import { parseEmailWithLLM } from './llm'
import { extractText, parseAttachmentWithLLM } from './attachmentParse'
import { classifyEmail, buildNewTask, buildThreadPatch, buildAttachmentPatch } from './syncLogic'
import type { SyncEmail } from './syncLogic'
import type { Task } from '$lib/types'
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
  count: number          // brand-new tasks created
  updated?: number       // existing thread cards patched by a reply
  message: string
  skipped?: boolean
}

// Download, store, and READ each attachment, merging any PO/amount/store numbers
// it yields into the task (only where the task is still empty) and logging a
// timeline entry. `acc` carries the task's running field state so several
// attachments on one email stack correctly. saveAttachment already $pushes the
// attachment id, so there's no separate id bookkeeping here.
async function processAttachments(
  taskId: string,
  email: { attachments?: unknown[] },
  headers: Record<string, string>,
  acc: Task,
): Promise<void> {
  const attachments = (email.attachments ?? []) as EmailAttachment[]
  for (const att of attachments) {
    if (att.skipped || !att.download_url) continue
    try {
      const attRes = await fetch(att.download_url, { headers })
      if (!attRes.ok) continue
      const content = Buffer.from(await attRes.arrayBuffer())
      await saveAttachment(
        taskId,
        att.filename,
        content,
        att.size,
        att.content_type ?? 'application/octet-stream',
      )

      const text = await extractText(att.filename, att.content_type, content)
      if (!text) continue
      const doc = await parseAttachmentWithLLM(text, att.filename)
      const patch = buildAttachmentPatch(acc, doc, att.filename)
      if (!patch) continue
      await patchTask(taskId, patch.set, patch.timelineEntry)
      Object.assign(acc, patch.set)
    } catch { /* skip failed attachment */ }
  }
}

// Single source of truth for "turn flagged emails into tasks", shared by the
// manual "Sync now" button (POST /api/sync) and the Graph webhook push. The run
// is idempotent (dedupes on exchange_id) and wrapped in a short distributed
// lease so the button + a burst of webhook notifications collapse into ONE
// sweep instead of stampeding. A reply on a thread we already track patches the
// existing card (and flags it for review) instead of creating a duplicate.
export async function runEmailSync({ triggeredBy }: { triggeredBy: string }): Promise<SyncResult> {
  if (!(await tryAcquireLease('email_sync', 5 * 60_000))) {
    return { count: 0, message: '⏳ A sync is already in progress.', skipped: true }
  }

  try {
    const emails = await fetchRecentEmails(30)
    // Running list of tasks we match against — seeded from the DB and appended
    // to in-run so a thread's earlier message and its replies collapse onto one
    // card within a single sweep.
    const existing = await getTasks()
    const token = await getGraphToken()
    const headers = { Authorization: `Bearer ${token}` }

    // Constrain the LLM's assigned_to to people who actually exist (matching the
    // board's "Assign to" dropdown): supervisors + quote people + provisioned users.
    const dbUsers = await getUsers()
    const assignees = [...new Set([...SUPERVISORS, ...QUOTE_PEOPLE, ...dbUsers.map(u => u.name)])].filter(Boolean)

    let newCount = 0
    let updatedCount = 0

    // Graph returns newest-first; process oldest-first so the opening message of
    // a thread creates the card before its replies try to patch it.
    for (const email of [...emails].reverse()) {
      const e = email as SyncEmail & { attachments?: unknown[] }
      const { action, task } = classifyEmail(e, existing)
      if (action === 'duplicate') continue

      if (action === 'update' && task) {
        const parsed = await parseEmailWithLLM(email as Parameters<typeof parseEmailWithLLM>[0], {
          assignees,
          priorTask: {
            quote: task.quote,
            quote_type: task.quote_type,
            quote_status: task.quote_status,
            po: task.po,
            store_numbers: task.store_numbers,
            assigned_to: task.assigned_to,
            date: task.date,
          },
        })
        const { set, timelineEntry } = buildThreadPatch(task, parsed, e)
        await patchTask(task._id, set, timelineEntry)
        Object.assign(task, set) // reflect the patch on the running copy
        await processAttachments(task._id, e, headers, task)
        updatedCount++
        continue
      }

      // New task
      const parsed = await parseEmailWithLLM(email as Parameters<typeof parseEmailWithLLM>[0], { assignees })
      // Stores from the subject (reliable regex) ∪ stores the LLM found in the body.
      const storeNumbers = normalizeStoreNumbers([
        ...extractStoreNumbers(e.subject),
        ...parsed.store_numbers,
      ])
      const taskDoc = buildNewTask(e, parsed, storeNumbers, triggeredBy)
      const taskId = await insertTask(taskDoc)
      const created = { ...taskDoc, _id: taskId, id: taskId } as unknown as Task
      existing.push(created)
      await processAttachments(taskId, e, headers, created)
      newCount++
    }

    const bits: string[] = []
    if (newCount) bits.push(`${newCount} new`)
    if (updatedCount) bits.push(`${updatedCount} updated`)
    return {
      count: newCount,
      updated: updatedCount,
      message: bits.length
        ? `✅ Synced ${bits.join(' + ')} from flagged email(s)!`
        : '📭 No new flagged emails.',
    }
  } finally {
    await releaseLease('email_sync')
  }
}
