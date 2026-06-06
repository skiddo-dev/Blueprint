export type TaskStatus = 'To Do' | 'In Progress' | 'Review' | 'Done' | 'On Hold' | 'Cancelled'

// One entry in a task's activity log. Email syncs append entries as a thread
// progresses (a reply lands, an attachment is parsed) so a card carries its own
// history instead of the board silently mutating under the PM.
export interface TimelineEntry {
  at: string                                       // ISO timestamp
  kind: 'created' | 'email' | 'attachment' | 'system'
  text: string                                     // e.g. "Customer approved; PO 4471; due 6/12"
  from?: string                                    // sender name, for email entries
}

export interface Task {
  _id: string
  id: string  // mirrors _id — required by svelte-dnd-action
  title: string
  description?: string
  full_body?: string
  quote?: string
  quote_type?: string
  quote_assignee?: string
  quote_status?: string
  po?: string                  // purchase order # (from a reply or a parsed attachment)
  store_numbers?: string[]
  assigned_to: string
  notes?: string
  date?: string
  status: TaskStatus
  exchange_id?: string
  conversation_id?: string     // Graph thread id — replies match back to this card
  from?: string
  sender_name?: string
  sender_email?: string
  created_by: string
  attachment_ids: string[]
  // ── AI extraction trust signals ──────────────────────────────────────────
  confidence?: number          // overall extraction confidence 0–1
  needs_review?: boolean       // flagged for a human to confirm (low confidence / thread update)
  review_reason?: string       // why it's flagged (shown on the card badge)
  timeline?: TimelineEntry[]   // activity log
  created_at: string
  updated_at?: string
}

export interface User {
  _id: string
  name: string
  role: 'admin' | 'pm' | 'viewer'
  updated_at?: string
}

// A tracked quote — mirrors the RAVES Quote Log (one row per quote). Stored in
// the `quotes` collection and surfaced in the dashboard analytics. Rows come
// from two sources: the historical log import and the Quote Generator.
export interface Quote {
  _id: string
  quote_number?: number      // sequential per year (from the log)
  year: number               // calendar year of the quote
  store_number?: string      // store #, may be empty or 'N/A'
  point_of_contact: string   // estimator / rep who sent the quote
  description: string        // work category (Minor Remodel, Extras, …)
  amount: number             // quoted $ (negative = credit)
  date_sent?: string         // ISO YYYY-MM-DD
  sitefolio?: boolean        // tracked in Sitefolio
  po?: string                // purchase order
  notes?: string
  status?: 'won' | 'lost' | 'open'  // log row colour: green=won, red/orange=lost, none=open
  source: 'imported' | 'generated'
  created_by?: string        // who generated it (generated quotes only)
  created_at: string
}

export interface StatusMeta {
  color: string
  bg: string
  text: string
  icon: string
}

export interface AppSession {
  user: {
    email: string
    name: string
    role: 'admin' | 'pm' | 'viewer' | null
    displayName: string
  }
}
