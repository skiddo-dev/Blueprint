// Dev-only mock task generator. Enabled by USE_MOCK_DATA=true so the app
// (dashboard, board) renders without a populated MongoDB.
import type { Task, TaskStatus } from '$lib/types'
import { KANBAN_STATUSES, QUOTE_TYPES, QUOTE_PEOPLE } from '$lib/constants'

const ASSIGNEES = [
  'Unassigned', 'Andrew', 'Mike', 'Riley', 'Kris', 'Bogdan', 'Ady',
  'Frank Crew', 'Bob', 'Dean', 'Vickie', 'Sarah',
]

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
    tasks.push({
      _id: id,
      id,
      title,
      description,
      notes,
      quote: `$${amount.toLocaleString('en-US')}.00`,
      quote_type: quoteType,
      quote_assignee: pick(QUOTE_PEOPLE),
      assigned_to: pick(ASSIGNEES),
      date: new Date(Date.now() - randInt(270) * DAY_MS).toISOString().slice(0, 10),
      status: pick(KANBAN_STATUSES) as TaskStatus,
      exchange_id: `mock_exchange_${String(i).padStart(3, '0')}`,
      created_by: 'system',
      attachment_ids: [],
      created_at: new Date(Date.now() - randInt(60) * DAY_MS).toISOString(),
    })
  }
  return tasks
}
