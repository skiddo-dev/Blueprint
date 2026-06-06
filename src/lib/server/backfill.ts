import { getTasks, updateTaskField, tryAcquireLease, releaseLease } from './db'
import { parseEmailWithLLM } from './llm'
import type { Task } from '$lib/types'

// One-off maintenance: re-run the LLM title extraction over tasks created before
// the LLM-title feature, so their card titles become clean summaries instead of
// raw "RE:/FW:" email subjects. Reuses parseEmailWithLLM (same prompt/schema) so
// the backfill can't drift from the live extraction.

export interface BackfillResult {
  scanned: number      // total tasks in the DB
  candidates: number   // tasks selected for re-titling
  updated: number      // titles actually changed
  skipped: number      // unchanged or failed
  dryRun: boolean
  message: string
}

/** Heuristic for a title that's really a raw email subject (so it's worth
 *  re-titling). LLM titles are short, clean, and ≤80 chars; raw subjects tend to
 *  carry RE:/FW: prefixes, CRM ticket tags, or run long. Pure + tested. */
export function looksLikeRawSubject(title: string | undefined | null): boolean {
  const t = (title ?? '').trim()
  if (!t) return false
  if (t.length > 80) return true                  // LLM titles are capped at 80
  if (/^(re|fw|fwd)\s*:/i.test(t)) return true     // reply/forward prefix
  if (/\bcrm:\s*\d/i.test(t)) return true          // embedded CRM ticket id
  return false
}

/** An email-sourced task we can re-title (has the raw email body to work from). */
function isEmailSourced(t: Task): boolean {
  return (t.full_body ?? '').trim().length > 0
}

export async function backfillTitles(
  { dryRun = false, all = false }: { dryRun?: boolean; all?: boolean } = {},
): Promise<BackfillResult> {
  // A real run can take a while (one LLM call per task) — single-flight it.
  if (!dryRun && !(await tryAcquireLease('backfill_titles', 15 * 60_000))) {
    return { scanned: 0, candidates: 0, updated: 0, skipped: 0, dryRun, message: '⏳ A title backfill is already running.' }
  }

  try {
    const tasks = await getTasks()
    const candidates = tasks.filter(
      t => isEmailSourced(t) && (all || looksLikeRawSubject(t.title)),
    )

    if (dryRun) {
      return {
        scanned: tasks.length,
        candidates: candidates.length,
        updated: 0,
        skipped: 0,
        dryRun: true,
        message: `${candidates.length} of ${tasks.length} task(s) would be re-titled${all ? ' (all email-sourced)' : ''}.`,
      }
    }

    let updated = 0
    let skipped = 0
    for (const t of candidates) {
      try {
        // Feed the stored subject (current title) + raw body back through the
        // same extractor; we only adopt the `title` it returns.
        const parsed = await parseEmailWithLLM({
          subject: t.title ?? '',
          from: t.from ?? t.sender_email ?? '',
          sender_name: t.sender_name,
          sender_email: t.sender_email,
          date: t.created_at ?? '',
          body: t.full_body ?? '',
        })
        const newTitle = (parsed.title ?? '').trim()
        if (newTitle && newTitle !== t.title) {
          await updateTaskField(t._id, 'title', newTitle)
          updated++
        } else {
          skipped++
        }
      } catch {
        skipped++ // never let one bad task abort the batch
      }
    }

    return {
      scanned: tasks.length,
      candidates: candidates.length,
      updated,
      skipped,
      dryRun: false,
      message: `✅ Re-titled ${updated} task(s); ${skipped} unchanged or skipped.`,
    }
  } finally {
    if (!dryRun) await releaseLease('backfill_titles')
  }
}
