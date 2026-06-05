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
