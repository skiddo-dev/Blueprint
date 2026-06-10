// Dev-only mock task generator. Enabled by USE_MOCK_DATA=true so the app
// (dashboard, board) renders without a populated MongoDB.
import type { Task, TaskStatus, Prospect, Quote, TimelineEntry, ProspectStatus } from '$lib/types'
import { KANBAN_STATUSES, QUOTE_TYPES, QUOTE_PEOPLE, QUOTE_STATUSES, QUOTE_WORK_TYPES, PROSPECT_CENTER } from '$lib/constants'
import { milesBetween, destinationPoint } from '$lib/geo'
import { spreadRanks } from '$lib/rank'

const ASSIGNEES = [
  'Unassigned', 'Andrew', 'Mike', 'Riley', 'Kris', 'Bogdan', 'Ady',
  'Frank Crew', 'Bob', 'Dean', 'Vickie', 'Sarah',
]

// Fake PM inboxes so the admin-only "flagged in" chip renders in mock mode.
const MOCK_INBOXES = ['ben@raves.com', 'andrew@raves.com', 'kris@raves.com', 'mike@raves.com']

const TEMPLATES: Array<[string, string, string]> = [
  ['Site Inspection Required', 'Requires immediate attention from site supervisor', 'Follow up with vendor on delivery date'],
  ['Equipment Delivery Scheduled', 'Pending approval from project manager', 'Schedule work within permit validity period'],
  ['Permit Application Submitted', 'Awaiting client feedback before proceeding', 'Notify site crew and update safety barriers'],
  ['Safety Review Completed', "Scheduled for next week's work window", 'Review budget allocation for next phase'],
  ['Budget Approval Pending', 'On hold due to material availability', 'Coordinate with utility company for shutdown'],
  ['Vendor Meeting Scheduled', 'Completed ahead of schedule', "Prepare safety briefing for tomorrow's work"],
  ['Quality Check Performed', 'Requires rework due to quality issues', 'Update client on progress via email'],
  ['Material Shortage Alert', 'Client requested additional features', 'Verify measurements before cutting'],
  ['Weather Delay Notice', 'Regulatory update affects timeline', 'Ensure proper disposal of waste materials'],
  ['Change Order Request', 'Vendor performance review needed', 'Confirm insurance certificates are current'],
  ['Foundation Pour Scheduled', 'Safety incident investigation', 'Check for potential utility conflicts'],
  ['Electrical Rough-In Complete', 'Quality assurance documentation', 'Verify ADA compliance requirements'],
  ['HVAC Installation', 'Final inspection scheduling', 'Check for moisture barrier installation'],
  ['Roofing Materials Delivered', 'Client satisfaction survey', 'Verify proper flashing details'],
  ['Final Walkthrough Scheduled', 'Parking lot resurfacing', 'Verify fire alarm connectivity'],
  ['Project Closeout Meeting', 'Interior demolition work', 'Check paint adhesion'],
]

// Quote $ ranges keyed by type — gives each quote type a realistic spread.
const RANGES: Record<string, [number, number]> = {
  'Assign Quote': [8000, 75000],
  'T&M': [1500, 25000],
  'Service Call': [300, 8000],
  'Maintenance Request': [500, 12000],
  'Emergency Repair': [2000, 30000],
}

const randInt = (n: number) => Math.floor(Math.random() * n)
const pick = <T>(arr: readonly T[]): T => arr[randInt(arr.length)]
const DAY_MS = 86_400_000

export function generateMockTasks(count = 35): Task[] {
  const tasks: Task[] = []
  for (let i = 1; i <= count; i++) {
    const [title, description, notes] = TEMPLATES[randInt(TEMPLATES.length)]
    const quoteType = pick(QUOTE_TYPES)
    const [lo, hi] = RANGES[quoteType] ?? [250, 5000]
    const amount = lo + randInt(hi - lo)
    const id = `mock_${String(i).padStart(2, '0')}`
    const quoteStr = `$${amount.toLocaleString('en-US')}.00`
    const createdAt = new Date(Date.now() - randInt(60) * DAY_MS).toISOString()
    // Seed a slice of tasks with a PO + activity timeline so the PO chip and the
    // Activity log have something to render in mock mode.
    const hasReply = i % 4 === 0
    const hasPo = i % 3 === 0
    const po = hasPo ? `45${1000 + i}` : undefined
    const timeline: TimelineEntry[] = [
      { at: createdAt, kind: 'created', text: `Created from email — ${description}`, from: 'Vendor Co.' },
    ]
    if (hasPo) {
      timeline.push({
        at: new Date(Date.now() - randInt(10) * DAY_MS).toISOString(),
        kind: 'attachment',
        text: `📎 PO_${po}.pdf: PO ${po} — ${quoteStr}`,
      })
    }
    if (hasReply) {
      timeline.push({
        at: new Date().toISOString(),
        kind: 'email',
        text: 'Reply received — customer asked to confirm scope',
        from: 'Vendor Co.',
      })
    }
    tasks.push({
      _id: id,
      id,
      title,
      description,
      notes,
      quote: quoteStr,
      quote_type: quoteType,
      quote_assignee: pick(QUOTE_PEOPLE),
      quote_status: pick(QUOTE_STATUSES),
      po,
      assigned_to: pick(ASSIGNEES),
      // A slice of tasks carries co-assignees so the 👥 chips render in mock mode.
      co_assignees: i % 5 === 0 ? ['Dean', 'Vickie'] : i % 7 === 0 ? ['Riley'] : [],
      date: new Date(Date.now() - randInt(270) * DAY_MS).toISOString().slice(0, 10),
      status: pick(KANBAN_STATUSES) as TaskStatus,
      exchange_id: `mock_exchange_${String(i).padStart(3, '0')}`,
      conversation_id: `mock_thread_${String(i).padStart(3, '0')}`,
      source_mailbox: pick(MOCK_INBOXES),
      created_by: 'system',
      attachment_ids: [],
      timeline,
      created_at: createdAt,
      // Aging clock: entered its column sometime in the last 3 weeks, so the
      // flow signals have a realistic spread to render in mock mode.
      status_changed_at: new Date(Date.now() - randInt(21) * DAY_MS).toISOString(),
    })
  }
  // Ranks mirror prod: per status column, evenly spaced in created_at-desc
  // order (what migration 0005 seeds), so drag-reorder works in mock mode.
  for (const status of KANBAN_STATUSES) {
    const inCol = tasks
      .filter(t => t.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    const ranks = spreadRanks(inCol.length)
    inCol.forEach((t, i) => { t.rank = ranks[i] })
  }
  // Same order the DB layer serves (rank asc) so the board renders identically.
  return tasks.sort((a, b) => (a.rank! < b.rank! ? -1 : a.rank! > b.rank! ? 1 : 0))
}

// ── Mock tracked quotes ──────────────────────────────────────────────────────
// Backs USE_MOCK_DATA for the quotes log + dashboard quote analytics, so the
// win/loss metrics and the Quotes page render with realistic numbers offline.
// Status spread is weighted (more open, a healthy win share) so the dashboard
// charts look representative.
const QUOTE_OUTCOMES: Array<'won' | 'lost' | 'open'> = [
  'won', 'won', 'won', 'lost', 'lost', 'open', 'open', 'open', 'open',
]

export function generateMockQuotes(count = 28): Quote[] {
  const quotes: Quote[] = []
  for (let i = 1; i <= count; i++) {
    const ageDays = randInt(540)
    const sent = new Date(Date.now() - ageDays * DAY_MS)
    quotes.push({
      _id: `mock_quote_${String(i).padStart(2, '0')}`,
      quote_number: i,
      year: sent.getFullYear(),
      store_number: String(1000 + randInt(8000)),
      point_of_contact: pick(QUOTE_PEOPLE),
      description: pick(QUOTE_WORK_TYPES),
      amount: 2500 + randInt(88_000),
      date_sent: sent.toISOString().slice(0, 10),
      status: pick(QUOTE_OUTCOMES),
      source: 'imported',
      created_at: sent.toISOString(),
    })
  }
  return quotes
}

// ── Mock warehouse prospects ─────────────────────────────────────────────────
// Used by the Prospects page when USE_MOCK_DATA=true, so the feature is fully
// demoable offline without reaching the live OSM / county-GIS sources. Scatters
// realistic warehouse listings inside the requested radius/size window around
// the search center, with metro-Detroit city/owner flavor.

// Suburbs ringing Bloomfield Hills, roughly ordered by distance — paired with a
// rough bearing so a generated point lands near a plausible city name.
const MOCK_CITIES: Array<[string, string, number]> = [
  // [city, zip, approx bearing from center in degrees]
  ['Pontiac', '48340', 340], ['Auburn Hills', '48326', 25], ['Troy', '48083', 110],
  ['Rochester Hills', '48309', 50], ['Madison Heights', '48071', 160], ['Southfield', '48034', 215],
  ['Farmington Hills', '48335', 250], ['Novi', '48377', 270], ['Sterling Heights', '48312', 95],
  ['Warren', '48089', 135], ['Royal Oak', '48067', 175], ['Waterford', '48328', 300],
  ['Wixom', '48393', 280], ['Clawson', '48017', 130], ['Walled Lake', '48390', 290],
]
const STREETS = [
  'Industrial Row', 'Commerce Dr', 'Enterprise Ct', 'Technology Pkwy', 'Distribution Blvd',
  'Logistics Way', 'Manufacturing Dr', 'Corporate Dr', 'Research Dr', 'Centerpoint Pkwy',
]
const OWNER_SUFFIX = ['Holdings LLC', 'Properties LLC', 'Realty Trust', 'Industrial LP', 'Logistics Inc', 'Capital Partners']
const OWNER_NAME = ['Great Lakes', 'Oakland', 'Midwest', 'Summit', 'Cardinal', 'Liberty', 'Pinnacle', 'Heartland', 'Ironwood', 'Northpointe']
// Weighted pipeline spread so the demo charts/markers show variety.
const STATUS_SPREAD: ProspectStatus[] = ['new', 'new', 'new', 'contacted', 'contacted', 'qualified', 'dead']

const randIn = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
const round = (n: number, step: number) => Math.round(n / step) * step

/** Generate mock warehouse prospects inside the radius/size window. */
export function generateMockProspects(opts: {
  lat?: number
  lng?: number
  radiusMiles: number
  minSqft: number
  maxSqft: number
  count?: number
}): Prospect[] {
  const lat = opts.lat ?? PROSPECT_CENTER.lat
  const lng = opts.lng ?? PROSPECT_CENTER.lng
  const count = opts.count ?? 14
  const now = new Date().toISOString()
  const out: Prospect[] = []
  for (let i = 0; i < count; i++) {
    const [city, zip] = MOCK_CITIES[i % MOCK_CITIES.length]
    // Keep points comfortably inside the radius (90%) so none round out of range.
    const dist = randIn(2, opts.radiusMiles * 0.9)
    const bearing = randIn(0, 360)
    const { lat: plat, lng: plng } = destinationPoint(lat, lng, bearing, dist)
    const sqft = round(randIn(opts.minSqft, opts.maxSqft), 500)
    const yearBuilt = Math.round(randIn(1968, 2016))
    const streetNum = Math.round(randIn(100, 9900))
    const street = STREETS[i % STREETS.length]
    const address = `${streetNum} ${street}, ${city}, MI ${zip}`
    const owner = `${OWNER_NAME[i % OWNER_NAME.length]} ${OWNER_SUFFIX[i % OWNER_SUFFIX.length]}`
    const assessed = round(sqft * randIn(38, 70), 1000)
    const id = `mock_prospect_${String(i + 1).padStart(2, '0')}`
    out.push({
      _id: id,
      attom_id: id,
      address,
      street: `${streetNum} ${street}`,
      city,
      state: 'MI',
      zip,
      latitude: Number(plat.toFixed(6)),
      longitude: Number(plng.toFixed(6)),
      building_sqft: sqft,
      lot_acres: Number((sqft / 43_560 * randIn(1.6, 3.2)).toFixed(2)),
      year_built: yearBuilt,
      property_type: 'WAREHOUSE',
      property_use: 'Industrial / Warehouse',
      owner,
      assessed_value: assessed,
      market_value: round(assessed * randIn(1.05, 1.4), 1000),
      last_sale_date: new Date(Date.now() - randInt(2400) * DAY_MS).toISOString().slice(0, 10),
      last_sale_amount: round(assessed * randIn(0.9, 1.6), 1000),
      distance_miles: Number(milesBetween(lat, lng, plat, plng).toFixed(1)),
      pipeline_status: STATUS_SPREAD[i % STATUS_SPREAD.length],
      assignee: i % 4 === 0 ? undefined : QUOTE_PEOPLE[i % QUOTE_PEOPLE.length],
      source: 'mock',
      created_at: now,
      updated_at: now,
    })
  }
  return out.sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0))
}
