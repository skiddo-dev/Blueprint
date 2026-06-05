export type TaskStatus = 'To Do' | 'In Progress' | 'Review' | 'Done' | 'On Hold' | 'Cancelled'

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
  store_numbers?: string[]
  assigned_to: string
  notes?: string
  date?: string
  status: TaskStatus
  exchange_id?: string
  from?: string
  sender_name?: string
  sender_email?: string
  created_by: string
  attachment_ids: string[]
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
