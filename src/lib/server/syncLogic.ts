import type { Task, TimelineEntry } from '$lib/types'
import type { ParsedEmail } from './llm'
import type { ParsedDoc } from './attachmentParse'
import { normalizeStoreNumbers } from '$lib/storeNumbers'

// Pure decision/merge logic for the email sync, kept free of db/network so it's
// unit-testable. runEmailSync (emailSync.ts) wires these to Mongo + the LLM.

/** Below this self-reported confidence, a new task is routed to the review lane. */
export const REVIEW_CONFIDENCE = 0.6

export interface SyncEmail {
  id: string
  subject: string
  from?: string
  sender_name?: string
  sender_email?: string
  date: string
  body: string
  conversation_id?: string | null
}

export type EmailAction = 'new' | 'duplicate' | 'update'

/** Decide what a freshly-fetched email means for the board:
 *  - `duplicate`: we already turned this exact message into a task (exchange_id).
 *  - `update`: it's a reply on a thread we already track (conversation_id) — patch
 *    the most recent card in that thread instead of making a new one.
 *  - `new`: otherwise.
 *  `existing` is the running list, so appending in-run keeps a burst of replies
 *  collapsing onto one card within a single sweep. */
export function classifyEmail(
  email: { id: string; conversation_id?: string | null },
  existing: Task[],
): { action: EmailAction; task?: Task } {
  const dup = existing.find(t => t.exchange_id && t.exchange_id === email.id)
  if (dup) return { action: 'duplicate', task: dup }

  if (email.conversation_id) {
    const inThread = existing
      .filter(t => t.conversation_id && t.conversation_id === email.conversation_id)
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    if (inThread.length) return { action: 'update', task: inThread[0] }
  }
  return { action: 'new' }
}

/** Whether an extraction should be flagged for a human, and why. The reason is
 *  user-facing (shown on the card badge), so keep it plain. */
export function computeReview(parsed: ParsedEmail): { needs_review: boolean; review_reason: string } {
  if (parsed.confidence < REVIEW_CONFIDENCE)
    return { needs_review: true, review_reason: `Low extraction confidence (${Math.round(parsed.confidence * 100)}%)` }
  if (!parsed.assigned_to)
    return { needs_review: true, review_reason: 'No assignee found — confirm who owns this' }
  if (parsed.quote && !parsed.quote_type)
    return { needs_review: true, review_reason: 'Has a quote amount but no quote type' }
  if (parsed.uncertain_fields.length)
    return { needs_review: true, review_reason: `Unsure about: ${parsed.uncertain_fields.join(', ')}` }
  return { needs_review: false, review_reason: '' }
}

/** Build the task document for a brand-new email (shape mirrors the manual
 *  "New Task" path plus the AI trust signals + opening timeline entry). */
export function buildNewTask(
  email: SyncEmail,
  parsed: ParsedEmail,
  storeNumbers: string[],
  triggeredBy: string,
): Record<string, unknown> {
  const now = new Date().toISOString()
  const review = computeReview(parsed)
  const opening = (parsed.event || parsed.summary || email.subject).slice(0, 160)
  const timeline: TimelineEntry[] = [
    { at: now, kind: 'created', text: `Created from email — ${opening}`.slice(0, 180), from: email.sender_name },
  ]
  return {
    title: email.subject,
    description: parsed.summary ?? '',
    full_body: email.body,
    quote: parsed.quote,
    quote_type: parsed.quote_type,
    quote_status: parsed.quote_status ?? (parsed.quote ? 'Draft' : null),
    po: parsed.po ?? null,
    store_numbers: storeNumbers,
    assigned_to: parsed.assigned_to ?? 'Unassigned',
    notes: '',
    date: parsed.date,
    status: 'To Do',
    exchange_id: email.id,
    conversation_id: email.conversation_id ?? null,
    from: email.from,
    sender_name: email.sender_name,
    sender_email: email.sender_email,
    created_by: triggeredBy,
    attachment_ids: [],
    confidence: parsed.confidence,
    needs_review: review.needs_review,
    review_reason: review.review_reason,
    timeline,
    created_at: now,
  }
}

/** Patch an existing thread's card from a reply. Sets ONLY fields the reply
 *  actually provides (never silently overwrites a value the PM may have set):
 *  a changed due date, a newly-present quote/PO, a stage change, an assignee for
 *  a still-unassigned task, and the union of store numbers. Always refreshes
 *  exchange_id, flags for review, and contributes a timeline entry. */
export function buildThreadPatch(
  task: Task,
  parsed: ParsedEmail,
  email: SyncEmail,
): { set: Record<string, unknown>; timelineEntry: TimelineEntry } {
  const set: Record<string, unknown> = {}

  if (parsed.date && parsed.date !== task.date) set.date = parsed.date
  if (parsed.quote && !task.quote) set.quote = parsed.quote
  if (parsed.quote_type && !task.quote_type) set.quote_type = parsed.quote_type
  if (parsed.quote_status && parsed.quote_status !== task.quote_status) set.quote_status = parsed.quote_status
  if (parsed.po && !task.po) set.po = parsed.po
  if (parsed.assigned_to && (!task.assigned_to || task.assigned_to === 'Unassigned'))
    set.assigned_to = parsed.assigned_to

  const union = normalizeStoreNumbers([...(task.store_numbers ?? []), ...parsed.store_numbers])
  if (union.length !== (task.store_numbers?.length ?? 0)) set.store_numbers = union

  set.exchange_id = email.id
  set.needs_review = true
  const who = email.sender_name || email.sender_email || 'someone'
  set.review_reason = `Reply from ${who} updated this thread`

  const timelineEntry: TimelineEntry = {
    at: new Date().toISOString(),
    kind: 'email',
    text: (parsed.event || parsed.summary || 'Reply received').slice(0, 160),
    from: email.sender_name,
  }
  return { set, timelineEntry }
}

/** Merge a parsed attachment into a task. Fills po/quote/stores ONLY where the
 *  task is still empty. Returns null when the document yielded nothing useful (so
 *  we don't spam the timeline with "read a file that told us nothing"). `current`
 *  is the task's running field state (so several attachments on one email stack
 *  correctly). */
export function buildAttachmentPatch(
  current: { po?: string | null; quote?: string | null; quote_status?: string | null; store_numbers?: string[] },
  doc: ParsedDoc,
  filename: string,
): { set: Record<string, unknown>; timelineEntry: TimelineEntry } | null {
  const union = normalizeStoreNumbers([...(current.store_numbers ?? []), ...doc.store_numbers])
  const newStores = union.length !== (current.store_numbers?.length ?? 0)

  if (!doc.po && !doc.amount && !newStores) return null

  const set: Record<string, unknown> = {}
  if (doc.po && !current.po) set.po = doc.po
  if (doc.amount && !current.quote) {
    set.quote = doc.amount
    if (!current.quote_status) set.quote_status = 'Draft'
  }
  if (newStores) set.store_numbers = union

  const found = [doc.po && `PO ${doc.po}`, doc.amount].filter(Boolean).join(' — ')
  const timelineEntry: TimelineEntry = {
    at: new Date().toISOString(),
    kind: 'attachment',
    text: `📎 ${filename}${found ? `: ${found}` : ` (${doc.doc_type ?? 'document'})`}`.slice(0, 160),
  }
  return { set, timelineEntry }
}
