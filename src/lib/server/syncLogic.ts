import type { Task, TimelineEntry } from '$lib/types'
import type { ParsedEmail } from './llm'
import type { ParsedDoc } from './attachmentParse'
import { normalizeStoreNumbers } from '$lib/storeNumbers'

// Pure decision/merge logic for the email sync, kept free of db/network so it's
// unit-testable. runEmailSync (emailSync.ts) wires these to Mongo + the LLM.

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

/** A mailbox to scan, plus the display name of its owner (used as the default
 *  assignee for emails that owner flagged when the LLM can't infer one). */
export interface SyncMailbox {
  email: string
  owner: string
}

// ── Flag-time cutoff ──────────────────────────────────────────────────────────
// We only sync emails flagged AFTER this instant, and the cutoff backfill removes
// cards created from emails flagged on/before it. Microsoft Graph carries no
// reliable "date flagged" for a plain flag (flag.startDateTime/dueDateTime are
// null unless a reminder was set), so we use the message's receivedDateTime as
// the flag-time proxy throughout. Default is the start of 2026-06-08 US/Eastern
// (the client is Michigan-based); override with EMAIL_SYNC_CUTOFF.
export const EMAIL_SYNC_CUTOFF_DEFAULT = '2026-06-08T00:00:00-04:00'

/** True when an email's date is on/after the cutoff — i.e. it's IN scope for sync.
 *  Empty/unparseable dates return false (kept out of sync, the conservative call). */
export function flaggedOnOrAfterCutoff(dateIso: string | null | undefined, cutoffIso: string): boolean {
  const t = Date.parse(dateIso ?? '')
  const c = Date.parse(cutoffIso)
  if (Number.isNaN(t) || Number.isNaN(c)) return false
  return t >= c
}

/** True when an email's date is strictly before the cutoff — i.e. it's removable
 *  by the backfill. Empty/unparseable dates return false so we never delete a card
 *  whose date we couldn't determine. */
export function flaggedBeforeCutoff(dateIso: string | null | undefined, cutoffIso: string): boolean {
  const t = Date.parse(dateIso ?? '')
  const c = Date.parse(cutoffIso)
  if (Number.isNaN(t) || Number.isNaN(c)) return false
  return t < c
}

/** Resolve the set of mailboxes to scan for flagged email. Precedence:
 *  an explicit PM_MAILBOXES list (comma-separated emails) if provided, otherwise
 *  every provisioned user with the 'pm' role. The central AZURE_USER_EMAIL
 *  mailbox, if set, is always included (preserves the original single-mailbox
 *  behavior). De-duped, lower-cased; owner display name attached when known. */
export function resolveMailboxes(opts: {
  users: { _id: string; name: string; role: string }[]
  explicit?: string | null
  central?: string | null
}): SyncMailbox[] {
  const byEmail = new Map(opts.users.map(u => [u._id.toLowerCase(), u.name]))
  const explicit = (opts.explicit ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  const pmEmails = explicit.length
    ? explicit
    : opts.users.filter(u => u.role === 'pm').map(u => u._id.toLowerCase())
  const central = opts.central ? [opts.central.trim().toLowerCase()] : []

  const seen = new Set<string>()
  const out: SyncMailbox[] = []
  for (const email of [...central, ...pmEmails]) {
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push({ email, owner: byEmail.get(email) ?? '' })
  }
  return out
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

/** Build the task document for a brand-new email (shape mirrors the manual
 *  "New Task" path plus an opening timeline entry). `opts.defaultAssignee` (the
 *  owner of the inbox it was flagged in) is used when the LLM couldn't infer an
 *  assignee, so the card lands in that PM's "My Work". `opts.mailbox` records
 *  which inbox the email came from. The card title is the LLM's cleaned-up task
 *  name (falling back to the raw subject). The due date is left empty for a PM to
 *  set — it's not AI-guessed. */
export function buildNewTask(
  email: SyncEmail,
  parsed: ParsedEmail,
  storeNumbers: string[],
  triggeredBy: string,
  opts: { mailbox?: string; defaultAssignee?: string; ownerEmail?: string; assigneeEmail?: string | null } = {},
): Record<string, unknown> {
  const now = new Date().toISOString()
  const opening = (parsed.event || parsed.summary || email.subject).slice(0, 160)
  const timeline: TimelineEntry[] = [
    { at: now, kind: 'created', text: `Created from email — ${opening}`.slice(0, 180), from: email.sender_name },
  ]
  const fallbackAssignee = opts.defaultAssignee?.trim() || 'Unassigned'
  return {
    title: parsed.title || email.subject,
    description: parsed.summary ?? '',
    full_body: email.body,
    quote: parsed.quote,
    quote_type: parsed.quote_type,
    quote_status: parsed.quote_status ?? (parsed.quote ? 'Draft' : null),
    po: parsed.po ?? null,
    store_numbers: storeNumbers,
    assigned_to: parsed.assigned_to ?? fallbackAssignee,
    notes: '',
    date: null,
    status: 'To Do',
    exchange_id: email.id,
    conversation_id: email.conversation_id ?? null,
    email_date: email.date,          // receivedDateTime — the flag-time proxy (pins this card's cutoff date)
    source_mailbox: opts.mailbox,
    from: email.from,
    sender_name: email.sender_name,
    sender_email: email.sender_email,
    created_by: triggeredBy,
    created_by_email: opts.ownerEmail ?? null,
    assignee_email: opts.assigneeEmail ?? null,
    attachment_ids: [],
    timeline,
    created_at: now,
  }
}

/** Patch an existing thread's card from a reply. Sets ONLY fields the reply
 *  actually provides (never silently overwrites a value the PM may have set):
 *  a newly-present quote/PO, a stage change, an assignee for a still-unassigned
 *  task, and the union of store numbers. Always refreshes exchange_id and
 *  contributes a timeline entry. */
export function buildThreadPatch(
  task: Task,
  parsed: ParsedEmail,
  email: SyncEmail,
): { set: Record<string, unknown>; timelineEntry: TimelineEntry } {
  const set: Record<string, unknown> = {}

  if (parsed.quote && !task.quote) set.quote = parsed.quote
  if (parsed.quote_type && !task.quote_type) set.quote_type = parsed.quote_type
  if (parsed.quote_status && parsed.quote_status !== task.quote_status) set.quote_status = parsed.quote_status
  if (parsed.po && !task.po) set.po = parsed.po
  if (parsed.assigned_to && (!task.assigned_to || task.assigned_to === 'Unassigned'))
    set.assigned_to = parsed.assigned_to

  const union = normalizeStoreNumbers([...(task.store_numbers ?? []), ...parsed.store_numbers])
  if (union.length !== (task.store_numbers?.length ?? 0)) set.store_numbers = union

  set.exchange_id = email.id

  const timelineEntry: TimelineEntry = {
    at: new Date().toISOString(),
    kind: 'email',
    text: (parsed.event || parsed.summary || 'Reply received').slice(0, 160),
    from: email.sender_name,
  }
  return { set, timelineEntry }
}

/** Merge a parsed attachment into a task. Fills po/quote/stores ONLY where the
 *  task is still empty, and — when the model judged the document pertinent —
 *  appends its one-line summary to the card description (never replaces what's
 *  there, and skips files the description already mentions so a re-attached file
 *  on a thread reply can't stack duplicates). Returns null when the document
 *  yielded nothing useful (so we don't spam the timeline with "read a file that
 *  told us nothing"). `current` is the task's running field state (so several
 *  attachments on one email stack correctly). */
export function buildAttachmentPatch(
  current: { po?: string | null; quote?: string | null; quote_status?: string | null; store_numbers?: string[]; description?: string | null },
  doc: ParsedDoc,
  filename: string,
): { set: Record<string, unknown>; timelineEntry: TimelineEntry } | null {
  const union = normalizeStoreNumbers([...(current.store_numbers ?? []), ...doc.store_numbers])
  const newStores = union.length !== (current.store_numbers?.length ?? 0)

  const summary = doc.summary.trim().slice(0, 160)
  const desc = (current.description ?? '').trim()
  const blurb = doc.pertinent && summary && !desc.includes(filename)
    ? `📎 ${filename}${doc.doc_type ? ` (${doc.doc_type})` : ''}: ${summary}`
    : null

  if (!doc.po && !doc.amount && !newStores && !blurb) return null

  const set: Record<string, unknown> = {}
  if (doc.po && !current.po) set.po = doc.po
  if (doc.amount && !current.quote) {
    set.quote = doc.amount
    if (!current.quote_status) set.quote_status = 'Draft'
  }
  if (newStores) set.store_numbers = union
  if (blurb) set.description = desc ? `${desc}\n\n${blurb}` : blurb

  const found = [doc.po && `PO ${doc.po}`, doc.amount].filter(Boolean).join(' — ')
  const detail = found || (blurb ? summary : '')
  const timelineEntry: TimelineEntry = {
    at: new Date().toISOString(),
    kind: 'attachment',
    text: `📎 ${filename}${detail ? `: ${detail}` : ` (${doc.doc_type ?? 'document'})`}`.slice(0, 160),
  }
  return { set, timelineEntry }
}
