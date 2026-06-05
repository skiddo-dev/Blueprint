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

// A quote produced by the Quote Generator (`/quotes`). Persisted to the
// `quotes` collection so it can be tracked in the dashboard analytics.
export interface Quote {
  _id: string
  customer: string
  quote_type: string
  architect: string          // the quote person (QUOTE_PEOPLE)
  project_location?: string
  description?: string
  notes?: string
  labor: number
  materials: number
  total: number              // final quote amount (numeric)
  date_received: string      // YYYY-MM-DD
  bid_due_date?: string
  created_by?: string        // who generated it
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
