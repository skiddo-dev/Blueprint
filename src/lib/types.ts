export type TaskStatus = 'To Do' | 'In Progress' | 'Review' | 'Done' | 'On Hold' | 'Cancelled'

// One entry in a task's activity log. Email syncs append entries as a thread
// progresses (a reply lands, an attachment is parsed) so a card carries its own
// history instead of the board silently mutating under the PM. `comment` entries
// are human notes posted from the card (the rest are system-generated).
export interface TimelineEntry {
  at: string                                       // ISO timestamp
  kind: 'created' | 'email' | 'attachment' | 'system' | 'comment'
  text: string                                     // e.g. "Customer approved; PO 4471; due 6/12"
  from?: string                                    // sender name, for email entries
  author?: string                                  // display name of the commenter (comment entries)
  mentions?: string[]                              // names @mentioned in a comment (for highlight + future notify)
  // ── Comment-only fields (edit / delete / reply / react) ──────────────────
  id?: string                                      // stable id for new comments — addresses one entry
  author_email?: string                            // commenter's login email (authz for edit/delete)
  parent_id?: string                               // set on a reply → the top-level comment's id
  edited_at?: string                               // set when a comment is edited
  reactions?: Record<string, string[]>             // emoji → reactor display names, e.g. { "👍": ["Ben"] }
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
  source_mailbox?: string      // which PM inbox this flagged email was synced from
  from?: string
  sender_name?: string
  sender_email?: string
  created_by: string
  created_by_email?: string     // stable owner identity (login email); ownership is keyed on this
  assignee_email?: string       // assignee's login email when they're a provisioned app user
  attachment_ids: string[]
  timeline?: TimelineEntry[]   // activity log (created / replies / parsed attachments)
  created_at: string
  updated_at?: string
}

export interface User {
  _id: string
  name: string
  role: 'admin' | 'pm' | 'viewer'
  firstSeenAt?: string   // when the user was first provisioned
  lastActiveAt?: string  // last page load (throttled to ~5 min) — drives the admin usage view
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

// Lead-pipeline stage for a prospect (user-managed; not from ATTOM).
export type ProspectStatus = 'new' | 'contacted' | 'qualified' | 'dead'

// A commercial-property prospect (target: warehouses in a size/radius window).
// Pulled from the ATTOM Data API (or generated in dev/mock mode) and stored in
// the `prospects` collection, keyed by ATTOM's stable attomId so re-pulls
// upsert in place instead of duplicating. Surfaced on the admin Prospects page.
export interface Prospect {
  _id: string                  // === attom_id (natural dedupe key)
  attom_id: string
  address: string              // one-line display address
  street?: string
  city?: string
  state?: string
  zip?: string
  latitude?: number
  longitude?: number
  building_sqft?: number       // gross building size — the 45k–75k filter target
  lot_acres?: number
  year_built?: number
  property_type?: string       // ATTOM proptype (e.g. "WAREHOUSE")
  property_use?: string        // ATTOM propsubtype / use label
  owner?: string
  assessed_value?: number
  market_value?: number
  last_sale_date?: string      // ISO YYYY-MM-DD
  last_sale_amount?: number
  distance_miles?: number      // from the search center (Bloomfield Hills)
  // ── User-managed pipeline fields (preserved across ATTOM re-pulls) ──────────
  pipeline_status?: ProspectStatus  // defaults to 'new'
  assignee?: string                 // BD rep working the lead
  notes?: string
  source: 'attom' | 'mock'
  created_at: string
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
