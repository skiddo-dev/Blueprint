import type { TaskStatus, StatusMeta, ProspectStatus } from './types'

export const KANBAN_STATUSES: TaskStatus[] = [
  'To Do', 'In Progress', 'Review', 'Done', 'On Hold', 'Cancelled',
]

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  'To Do':       { color: '#6366f1', bg: '#eef2ff', text: '#4338ca', icon: '○' },
  'In Progress': { color: '#f59e0b', bg: '#fffbeb', text: '#b45309', icon: '◑' },
  'Review':      { color: '#3b82f6', bg: '#dbeafe', text: '#1d4ed8', icon: '◎' },
  'Done':        { color: '#10b981', bg: '#d1fae5', text: '#047857', icon: '●' },
  'On Hold':     { color: '#94a3b8', bg: '#f1f5f9', text: '#475569', icon: '⊘' },
  'Cancelled':   { color: '#f87171', bg: '#fee2e2', text: '#dc2626', icon: '✕' },
}

export const QUOTE_TYPES = [
  'Assign Quote', 'T&M', 'Service Call', 'Maintenance Request', 'Emergency Repair',
]

export const QUOTE_PEOPLE = [
  'Bob', 'Ben', 'Andrew', 'Mike', 'Riley', 'Kris', 'Bogdan', 'Ady',
]

// Estimators / points of contact from the RAVES Quote Log. Used as datalist
// suggestions on the Quote Generator — free text is still allowed (new names
// appear over time).
export const QUOTE_CONTACTS = [
  'Alex Edge', 'Jeff Bindus', 'Cody Vantrease', 'Zach Hanf', 'Malachi Mosley',
  'Carl Regner', 'Jack Torrance', 'Tyler Washington', 'Kyle Semak',
  'Micah Blackmon', 'Jack Kristensen', 'Ken Kardel', 'Ken Reisig',
]

// Work categories used in the quote log's Description column (datalist
// suggestions; free text allowed).
export const QUOTE_WORK_TYPES = [
  'Extras', 'Misc. Work', 'Front End Work', 'Minor Remodel', 'Pick Up Expansion',
  'Top Stock', 'Freezer', 'Center Store', 'SCOS', 'Remodel', 'Minor Capital',
  'Credit', 'Cart Corral', 'RX Counsel Room', 'Nat Food Int', 'Paint and Putty',
  'Reset', 'Starbucks',
]

// Static roster appended to the task "Assign to" list (alongside provisioned PM
// users) and used as candidates for the email-extraction assignee.
export const SUPERVISORS = ['Ben', 'Kris', 'Vlad', 'Bogdan', 'Frank Crew']

// Quote/bid sales-pipeline stages. Only meaningful for tasks that have a quote;
// an unset status on a quoted task is treated as 'Draft'.
export const QUOTE_STATUSES = ['Draft', 'Sent', 'Won', 'Lost']

export const QUOTE_STATUS_META: Record<string, { color: string; bg: string; text: string }> = {
  'Draft': { color: '#94a3b8', bg: '#f1f5f9', text: '#475569' },
  'Sent':  { color: '#3b82f6', bg: '#dbeafe', text: '#1d4ed8' },
  'Won':   { color: '#10b981', bg: '#d1fae5', text: '#047857' },
  'Lost':  { color: '#ef4444', bg: '#fee2e2', text: '#dc2626' },
}

// ── Prospecting (warehouse leads) ────────────────────────────────────────────
// Search center for the Prospects page. Bloomfield Hills, MI (Oakland County) —
// the geographic anchor for the warehouse pull. Lat/lng feed both the ATTOM
// radius query and the map's center marker + radius circle.
export const PROSPECT_CENTER = { label: 'Bloomfield Hills, MI', lat: 42.5836, lng: -83.2455 }

// Default pull window: warehouses 45,000–75,000 sq ft within 30 miles. These
// seed the form on the Prospects page; an admin can widen/narrow per pull.
export const PROSPECT_DEFAULTS = { radiusMiles: 30, minSqft: 45_000, maxSqft: 75_000 }

// Lead-pipeline stages for prospects, in order. Drive the status dropdown,
// status-colored map markers, and the pipeline breakdown chart.
export const PROSPECT_STATUSES: ProspectStatus[] = ['new', 'contacted', 'qualified', 'dead']

export const PROSPECT_STATUS_META: Record<ProspectStatus, { label: string; color: string; bg: string; text: string }> = {
  'new':       { label: 'New',       color: '#6366f1', bg: '#eef2ff', text: '#4338ca' },
  'contacted': { label: 'Contacted', color: '#f59e0b', bg: '#fffbeb', text: '#b45309' },
  'qualified': { label: 'Qualified', color: '#10b981', bg: '#d1fae5', text: '#047857' },
  'dead':      { label: 'Dead',      color: '#94a3b8', bg: '#f1f5f9', text: '#475569' },
}
