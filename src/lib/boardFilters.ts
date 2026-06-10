// Board filter model + matching. One composable filter state drives the filter
// bar, the per-column CSS hiding, and the pill counts — pure functions here so
// the matching rules are unit-testable away from Svelte.
import type { Task } from './types'
import { extractStoreNumbers } from './storeNumbers'

export interface BoardFilters {
  /** Match assigned_to OR any co-assignee (dropdown names). Empty = any. */
  assignees: string[]
  /** Match any of the card's store numbers. Empty = any. */
  stores: string[]
  due: 'any' | 'overdue' | 'week' | 'none'
  /** Quote pipeline stage; 'none' = the card has no quote at all. */
  quote: 'any' | 'Draft' | 'Sent' | 'Won' | 'Lost' | 'none'
  source: 'any' | 'email' | 'manual'
  /** Case-insensitive substring over title + description. */
  text: string
}

export function defaultFilters(): BoardFilters {
  return { assignees: [], stores: [], due: 'any', quote: 'any', source: 'any', text: '' }
}

export function anyFilterActive(f: BoardFilters): boolean {
  return f.assignees.length > 0 || f.stores.length > 0 || f.due !== 'any' || f.quote !== 'any' ||
    f.source !== 'any' || f.text.trim() !== ''
}

/** Count of individually clearable filters — drives the bar's badge. */
export function activeFilterCount(f: BoardFilters): number {
  return f.assignees.length + f.stores.length +
    (f.due !== 'any' ? 1 : 0) + (f.quote !== 'any' ? 1 : 0) +
    (f.source !== 'any' ? 1 : 0) + (f.text.trim() ? 1 : 0)
}

export const taskStores = (t: Task): string[] => t.store_numbers ?? extractStoreNumbers(t.title)

/** ISO date `days` from today (local), YYYY-MM-DD. */
function isoInDays(days: number, today: string): string {
  const d = new Date(today + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whether one task passes every active filter. `today` is injected (YYYY-MM-DD)
 *  so the due-window rules are deterministic under test. */
export function taskMatchesFilters(t: Task, f: BoardFilters, today: string): boolean {
  if (f.assignees.length) {
    const people = [t.assigned_to, ...(t.co_assignees ?? [])].filter(Boolean)
    if (!f.assignees.some(a => people.includes(a))) return false
  }

  if (f.stores.length) {
    const stores = taskStores(t)
    if (!f.stores.some(s => stores.includes(s))) return false
  }

  if (f.due !== 'any') {
    const open = t.status !== 'Done' && t.status !== 'Cancelled'
    if (f.due === 'none') {
      if (t.date) return false
    } else if (f.due === 'overdue') {
      // Same rule as the card's overdue chip: past-due AND still open.
      if (!(t.date && t.date < today && open)) return false
    } else if (f.due === 'week') {
      // Due in the next 7 days (today inclusive). Overdue cards have their own
      // lens — don't double-count them here.
      if (!(t.date && t.date >= today && t.date <= isoInDays(7, today))) return false
    }
  }

  if (f.quote !== 'any') {
    if (f.quote === 'none') {
      if (t.quote) return false
    } else {
      if (!t.quote) return false
      if ((t.quote_status ?? 'Draft') !== f.quote) return false
    }
  }

  if (f.source !== 'any') {
    const isEmail = !!t.exchange_id
    if (f.source === 'email' ? !isEmail : isEmail) return false
  }

  const q = f.text.trim().toLowerCase()
  if (q) {
    const hay = `${t.title} ${t.description ?? ''}`.toLowerCase()
    if (!hay.includes(q)) return false
  }

  return true
}
