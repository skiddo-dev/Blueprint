import type { Task } from '$lib/types'

/**
 * Canonical form for comparing a person's identity across sources (Entra display
 * name vs. the "Assign to" dropdown vs. login email). Case- and
 * surrounding-whitespace-insensitive so trivial drift doesn't hide a user's own
 * tasks. Mirror of the server-side helper in db.ts — kept here (client-safe, no
 * Mongo import) so the board can reuse the same rule.
 */
export function normName(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

export interface Identity {
  email?: string | null
  /** Display name, for the legacy name fallback only. */
  name?: string | null
}

/**
 * Whether `task` belongs to `who` — the SINGLE ownership rule shared by the
 * server authz check (canAccessTask) and the board's "My Work" filter, so the
 * two can't drift. Ownership is keyed on IDENTITY (login email) the moment a
 * task carries one: a task is yours if your email matches its assignee_email,
 * one of its co_assignee_emails, or created_by_email. Only un-backfilled tasks
 * (no identity yet) fall back to the legacy display-name match against
 * assigned_to/co_assignees/created_by — which is exactly why "My Work" must not
 * match on name alone: assigned_to holds the dropdown name ("Ben"), not the
 * user's Entra displayName ("ben@ravesinc.com").
 */
export function isOwnedBy(
  task: Pick<Task, 'assigned_to' | 'co_assignees' | 'created_by' | 'assignee_email' | 'co_assignee_emails' | 'created_by_email'>,
  who: Identity,
): boolean {
  const coEmails = task.co_assignee_emails ?? []
  if (task.assignee_email || task.created_by_email || coEmails.length) {
    const email = normName(who.email)
    return !!email && (
      email === normName(task.assignee_email) ||
      email === normName(task.created_by_email) ||
      coEmails.some(c => normName(c) === email)
    )
  }
  const name = normName(who.name)
  return !!name && (
    normName(task.assigned_to) === name ||
    normName(task.created_by) === name ||
    (task.co_assignees ?? []).some(c => normName(c) === name)
  )
}
