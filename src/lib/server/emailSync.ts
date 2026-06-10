import { env } from '$env/dynamic/private'
import { getTasks, getUsers, insertTask, saveAttachment, patchTask, tryAcquireLease, releaseLease, normName } from './db'
import { fetchRecentEmails, getGraphToken, GraphAuthError } from './email'
import { parseEmailWithLLM } from './llm'
import { analyzeAttachment } from './attachmentParse'
import { classifyEmail, buildNewTask, buildThreadPatch, buildAttachmentPatch, resolveMailboxes, flaggedOnOrAfterCutoff, EMAIL_SYNC_CUTOFF_DEFAULT } from './syncLogic'
import type { SyncEmail, SyncMailbox } from './syncLogic'
import type { Task, User } from '$lib/types'
import { SUPERVISORS, QUOTE_PEOPLE } from '$lib/constants'
import { extractStoreNumbers, normalizeStoreNumbers } from '$lib/storeNumbers'

// Which inboxes to scan for flagged email: every provisioned PM (or an explicit
// PM_MAILBOXES override), plus the legacy central AZURE_USER_EMAIL mailbox.
export function getSyncMailboxes(dbUsers: User[]): SyncMailbox[] {
  return resolveMailboxes({
    users: dbUsers.map(u => ({ _id: String(u._id), name: u.name, role: u.role })),
    explicit: env.PM_MAILBOXES,
    central: env.AZURE_USER_EMAIL,
  })
}

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
  authError?: boolean    // Microsoft sign-in failed (expired secret / revoked consent)
}

// Download, store, and READ each attachment (text docs locally, image scans via
// vision), merging any PO/amount/store numbers it yields into the task (only
// where the task is still empty) and appending a pertinent document's one-line
// summary to the card description, with a timeline entry either way. `acc`
// carries the task's running field state so several attachments on one email
// stack correctly. saveAttachment already $pushes the attachment id, so there's
// no separate id bookkeeping here.
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
        'email', // email-sourced → subject to the 30-day retention purge
      )

      const doc = await analyzeAttachment(att.filename, att.content_type, content)
      if (!doc) continue
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
    // Running list of tasks we match against — seeded from the DB and appended
    // to in-run so a thread's earlier message and its replies collapse onto one
    // card within a single sweep (works across mailboxes too: the same thread
    // flagged by two PMs lands on one card).
    const existing = await getTasks()
    let token: string
    try {
      token = await getGraphToken()
    } catch (e) {
      // A failed client-credentials grant is a config problem (expired secret /
      // revoked consent) that blocks EVERY mailbox — surface it as an actionable
      // message instead of throwing a bare 500 that reads as "Internal error".
      if (e instanceof GraphAuthError) {
        console.error('[email-sync] Graph auth failed:', e.message)
        return {
          count: 0,
          authError: true,
          message:
            '🔒 Email sync couldn’t sign in to Microsoft 365 — the app credentials may have expired ' +
            'or admin consent was revoked. An admin needs to renew the Azure client secret / re-grant consent.',
        }
      }
      throw e
    }
    const headers = { Authorization: `Bearer ${token}` }

    // Constrain the LLM's assigned_to to people who actually exist (matching the
    // board's "Assign to" dropdown): supervisors + quote people + provisioned users.
    const dbUsers = await getUsers()
    const assignees = [...new Set([...SUPERVISORS, ...QUOTE_PEOPLE, ...dbUsers.map(u => u.name)])].filter(Boolean)
    const mailboxes = getSyncMailboxes(dbUsers)
    // Resolve assignee display names → login emails for identity-based ownership.
    const emailByName = new Map(dbUsers.map(u => [normName(u.name), String(u._id).toLowerCase()]))
    // Cutoff: ignore anything flagged on/before it (Graph already filters by this,
    // but guard here too in case the OData filter is ever bypassed).
    const cutoff = env.EMAIL_SYNC_CUTOFF ?? EMAIL_SYNC_CUTOFF_DEFAULT

    let newCount = 0
    let updatedCount = 0
    const failed: string[] = []

    for (const mb of mailboxes) {
      let emails
      try {
        emails = await fetchRecentEmails(mb.email, 30)
      } catch (e) {
        // One unreadable mailbox (no license, access policy, etc.) must not abort
        // the whole sweep — log, record, and move on.
        console.error('[email-sync] fetch failed for', mb.email, e)
        failed.push(mb.email)
        continue
      }

      // Graph returns newest-first; process oldest-first so the opening message
      // of a thread creates the card before its replies try to patch it.
      for (const email of [...emails].reverse()) {
        const e = email as SyncEmail & { attachments?: unknown[] }
        if (!flaggedOnOrAfterCutoff(e.date, cutoff)) continue // flagged on/before the cutoff — out of scope
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
            },
          })
          const { set, timelineEntry } = buildThreadPatch(task, parsed, e)
          // Keep identity in sync if the reply (re)assigned the task to a user.
          if (typeof set.assigned_to === 'string') {
            set.assignee_email = emailByName.get(normName(set.assigned_to)) ?? null
          }
          await patchTask(task._id, set, timelineEntry)
          Object.assign(task, set) // reflect the patch on the running copy
          await processAttachments(task._id, e, headers, task)
          updatedCount++
          continue
        }

        // New task. When the LLM can't infer an assignee, default to the owner of
        // the inbox it was flagged in so it lands in that PM's "My Work".
        const parsed = await parseEmailWithLLM(email as Parameters<typeof parseEmailWithLLM>[0], { assignees })
        // Stores from the subject (reliable regex) ∪ stores the LLM found in the body.
        const storeNumbers = normalizeStoreNumbers([
          ...extractStoreNumbers(e.subject),
          ...parsed.store_numbers,
        ])
        const assigneeName = parsed.assigned_to ?? mb.owner
        const taskDoc = buildNewTask(e, parsed, storeNumbers, triggeredBy, {
          mailbox: mb.email,
          defaultAssignee: mb.owner,
          ownerEmail: mb.email,                                  // the inbox owner owns synced cards
          assigneeEmail: emailByName.get(normName(assigneeName)) ?? null,
        })
        const taskId = await insertTask(taskDoc)
        const created = { ...taskDoc, _id: taskId, id: taskId } as unknown as Task
        existing.push(created)
        await processAttachments(taskId, e, headers, created)
        newCount++
      }
    }

    const bits: string[] = []
    if (newCount) bits.push(`${newCount} new`)
    if (updatedCount) bits.push(`${updatedCount} updated`)
    let message = bits.length
      ? `✅ Synced ${bits.join(' + ')} across ${mailboxes.length} inbox(es)!`
      : `📭 No new flagged emails (scanned ${mailboxes.length} inbox(es)).`
    if (failed.length) message += ` ⚠️ ${failed.length} inbox(es) couldn’t be read.`

    return { count: newCount, updated: updatedCount, message }
  } finally {
    await releaseLease('email_sync')
  }
}
