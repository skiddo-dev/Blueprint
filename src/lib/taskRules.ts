import type { TaskStatus } from './types'

/** Sentinel `assigned_to` value meaning "no one is assigned". */
export const UNASSIGNED = 'Unassigned'

/** True when `assigned_to` names an actual person — not blank, and not the
 *  "Unassigned" sentinel the board/modal use for an empty assignment. */
export function isRealAssignee(assignedTo: unknown): assignedTo is string {
  return typeof assignedTo === 'string' && assignedTo.trim() !== '' && assignedTo !== UNASSIGNED
}

/**
 * Assigning work starts it. When a real person is put on a task that hasn't been
 * started yet ("To Do"), it auto-advances to "In Progress". Returns the status to
 * move to, or `null` to leave the status untouched.
 *
 * We deliberately only promote from "To Do": a task already In Progress needs no
 * change, finished/cancelled work isn't resurrected by a reassignment, and a
 * deliberately-chosen Review / On Hold state is respected. Keeping this a pure
 * function lets the API (the source of truth, also enforced for the iOS client)
 * and the board's optimistic UI share one rule so the two never drift.
 */
export function statusOnAssign(current: TaskStatus, next: unknown): TaskStatus | null {
  return isRealAssignee(next) && current === 'To Do' ? 'In Progress' : null
}
