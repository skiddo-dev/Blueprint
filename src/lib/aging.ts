// Card aging — how long a card has sat in its current column, and whether
// that's long enough to flag. Pure functions (now injected) shared by both
// card faces; thresholds live in constants.ts and are re-served by /api/config
// so iOS reads the same contract.
import type { Task } from './types'
import { AGING_THRESHOLDS } from './constants'

export type AgingLevel = 'none' | 'warn' | 'alert'

// Only ACTIVE columns age. Done/Cancelled are finished; On Hold is parked on
// purpose — flagging it as stale would just train people to ignore the signal.
const AGING_STATUSES = new Set<string>(['To Do', 'In Progress', 'Review'])

type AgingInput = Pick<Task, 'status' | 'status_changed_at' | 'created_at'>

/** Whole days the card has been in its current column. Falls back to
 *  created_at for docs that predate the status_changed_at backfill. */
export function daysInColumn(t: AgingInput, now: Date): number {
  const since = Date.parse(t.status_changed_at ?? t.created_at ?? '')
  if (Number.isNaN(since)) return 0
  return Math.max(0, Math.floor((now.getTime() - since) / 86_400_000))
}

export function agingLevel(t: AgingInput, now: Date): AgingLevel {
  if (!AGING_STATUSES.has(t.status)) return 'none'
  const days = daysInColumn(t, now)
  if (days >= AGING_THRESHOLDS.alertDays) return 'alert'
  if (days >= AGING_THRESHOLDS.warnDays) return 'warn'
  return 'none'
}
