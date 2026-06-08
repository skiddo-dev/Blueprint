import { env } from '$env/dynamic/private'
import { getTasks, deleteTask, tryAcquireLease, releaseLease } from './db'
import { getGraphToken, GraphAuthError, fetchMessageReceivedDate } from './email'
import { flaggedBeforeCutoff, EMAIL_SYNC_CUTOFF_DEFAULT } from './syncLogic'

// One-off maintenance: permanently remove cards created from emails flagged
// on/before the sync cutoff (see EMAIL_SYNC_CUTOFF_DEFAULT in syncLogic). The
// going-forward filter (email.ts) keeps new pre-cutoff mail out; this cleans up
// the backlog already imported. Surgical: a card is deleted ONLY when its source
// email's date is confirmed before the cutoff — cards whose date can't be
// determined (no stored email_date and the message is gone from Graph) are left
// alone. Mirrors backfill.ts's shape (leased, dry-run preview, result summary).

export interface CutoffBackfillResult {
  scanned: number        // total tasks in the DB
  synced: number         // email-sourced candidates (have an exchange_id)
  removed: number        // deleted (or, in a dry run, would be deleted)
  kept: number           // confirmed on/after the cutoff — left in place
  unverifiable: number   // date couldn't be determined — left in place
  dryRun: boolean
  authError?: boolean    // Microsoft sign-in failed — nothing was removed
  message: string
}

export async function backfillCutoff(
  { dryRun = false, cutoff }: { dryRun?: boolean; cutoff?: string } = {},
): Promise<CutoffBackfillResult> {
  const cut = cutoff ?? env.EMAIL_SYNC_CUTOFF ?? EMAIL_SYNC_CUTOFF_DEFAULT
  const empty = { scanned: 0, synced: 0, removed: 0, kept: 0, unverifiable: 0 }

  // A real run deletes data and may hit Graph once per card — single-flight it.
  if (!dryRun && !(await tryAcquireLease('backfill_cutoff', 15 * 60_000))) {
    return { ...empty, dryRun, message: '⏳ A cutoff backfill is already running.' }
  }

  try {
    const tasks = await getTasks()
    // exchange_id is the email-sync marker; manually-created cards never carry one
    // and are never touched here.
    const synced = tasks.filter(t => (t.exchange_id ?? '').trim() !== '')

    // Only sign in to Graph if at least one card lacks a stored email_date.
    let token: string | null = null
    if (synced.some(t => !t.email_date)) {
      try {
        token = await getGraphToken()
      } catch (e) {
        if (e instanceof GraphAuthError) {
          console.error('[backfill-cutoff] Graph auth failed:', e.message)
          return {
            ...empty,
            scanned: tasks.length,
            synced: synced.length,
            dryRun,
            authError: true,
            message:
              '🔒 Couldn’t sign in to Microsoft 365 to date the older cards — nothing was removed. ' +
              'An admin needs to renew the Azure client secret / re-grant consent, then re-run.',
          }
        }
        throw e
      }
    }

    let removed = 0
    let kept = 0
    let unverifiable = 0
    for (const t of synced) {
      let date = t.email_date ?? null
      if (!date && token && t.source_mailbox && t.exchange_id) {
        date = await fetchMessageReceivedDate(t.source_mailbox, t.exchange_id, token)
      }
      if (!date) {
        unverifiable++ // can't confirm the date — never delete what we can't verify
        continue
      }
      if (flaggedBeforeCutoff(date, cut)) {
        if (!dryRun) await deleteTask(t._id)
        removed++
      } else {
        kept++
      }
    }

    const summary = `${removed} removed, ${kept} kept, ${unverifiable} unverifiable (of ${synced.length} synced card(s))`
    return {
      scanned: tasks.length,
      synced: synced.length,
      removed,
      kept,
      unverifiable,
      dryRun,
      message: dryRun ? `🔎 Dry run — would remove ${removed}. ${summary}.` : `✅ ${summary}.`,
    }
  } finally {
    if (!dryRun) await releaseLease('backfill_cutoff')
  }
}
