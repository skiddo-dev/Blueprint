// Pure, framework-free helpers for the Prospects dashboard: filtering, chart
// aggregations, and CSV export. No DOM/Node/$lib-server deps so it runs on the
// client, the server, and under Vitest.
import type { Prospect, ProspectStatus } from './types'

export interface ProspectFilters {
  search: string
  city: string // '' = all cities
  status: ProspectStatus | 'all'
  minSqft: number
  maxSqft: number
  maxDistance: number
  minYear: number
  maxYear: number
}

export const statusOf = (p: Prospect): ProspectStatus => p.pipeline_status ?? 'new'

/** Apply the dashboard's filter bar to a prospect list. A null field on a
 *  prospect never excludes it (we only filter on values we actually know). */
export function filterProspects(list: Prospect[], f: ProspectFilters): Prospect[] {
  const q = f.search.trim().toLowerCase()
  return list.filter(p => {
    if (q) {
      const hay = `${p.address ?? ''} ${p.owner ?? ''} ${p.city ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (f.city && p.city !== f.city) return false
    if (f.status !== 'all' && statusOf(p) !== f.status) return false
    if (p.building_sqft != null && (p.building_sqft < f.minSqft || p.building_sqft > f.maxSqft)) return false
    if (p.distance_miles != null && p.distance_miles > f.maxDistance) return false
    if (p.year_built != null && (p.year_built < f.minYear || p.year_built > f.maxYear)) return false
    return true
  })
}

export interface Bucket {
  label: string
  count: number
}

const kSf = (n: number) => (n % 1000 === 0 ? `${n / 1000}k` : `${(n / 1000).toFixed(1)}k`)

/** Building-size histogram, bucketed by `bucketSize` sq ft. */
export function sizeHistogram(list: Prospect[], bucketSize = 5000): Bucket[] {
  const counts = new Map<number, number>()
  for (const p of list) {
    if (p.building_sqft == null) continue
    const bucket = Math.floor(p.building_sqft / bucketSize) * bucketSize
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }
  return [...counts.keys()]
    .sort((a, b) => a - b)
    .map(b => ({ label: `${kSf(b)}–${kSf(b + bucketSize)}`, count: counts.get(b)! }))
}

/** Prospect count per city, busiest first. */
export function byCity(list: Prospect[]): Bucket[] {
  const counts = new Map<string, number>()
  for (const p of list) {
    const c = p.city || 'Unknown'
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

/** Prospect count per decade built (e.g. "1990s"). */
export function byDecade(list: Prospect[]): Bucket[] {
  const counts = new Map<number, number>()
  for (const p of list) {
    if (p.year_built == null) continue
    const decade = Math.floor(p.year_built / 10) * 10
    counts.set(decade, (counts.get(decade) ?? 0) + 1)
  }
  return [...counts.keys()].sort((a, b) => a - b).map(d => ({ label: `${d}s`, count: counts.get(d)! }))
}

/** Prospect count per distance band (e.g. "0–10 mi") out to the search radius. */
export function distanceBands(list: Prospect[], band = 10): Bucket[] {
  const counts = new Map<number, number>()
  for (const p of list) {
    if (p.distance_miles == null) continue
    const b = Math.floor(p.distance_miles / band) * band
    counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  return [...counts.keys()].sort((a, b) => a - b).map(b => ({ label: `${b}–${b + band} mi`, count: counts.get(b)! }))
}

/** Count of prospects in each pipeline stage (zero-filled for all stages). */
export function byStatus(list: Prospect[], stages: ProspectStatus[]): Record<ProspectStatus, number> {
  const out = Object.fromEntries(stages.map(s => [s, 0])) as Record<ProspectStatus, number>
  for (const p of list) out[statusOf(p)] = (out[statusOf(p)] ?? 0) + 1
  return out
}

// ── CSV export ───────────────────────────────────────────────────────────────
const CSV_COLUMNS: Array<[string, (p: Prospect) => unknown]> = [
  ['Address', p => p.address],
  ['City', p => p.city],
  ['State', p => p.state],
  ['Zip', p => p.zip],
  ['Building SqFt', p => p.building_sqft],
  ['Year Built', p => p.year_built],
  ['Lot Acres', p => p.lot_acres],
  ['Owner', p => p.owner],
  ['Assessed Value', p => p.assessed_value],
  ['Market Value', p => p.market_value],
  ['Last Sale Date', p => p.last_sale_date],
  ['Last Sale Amount', p => p.last_sale_amount],
  ['Distance (mi)', p => p.distance_miles],
  ['Status', p => statusOf(p)],
  ['Assignee', p => p.assignee],
  ['Notes', p => p.notes],
  ['Latitude', p => p.latitude],
  ['Longitude', p => p.longitude],
  ['ATTOM ID', p => p.attom_id],
]

const csvCell = (v: unknown): string => {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Render prospects as a CSV string (header + one row each). */
export function toCSV(list: Prospect[]): string {
  const header = CSV_COLUMNS.map(([h]) => h).join(',')
  const rows = list.map(p => CSV_COLUMNS.map(([, fn]) => csvCell(fn(p))).join(','))
  return [header, ...rows].join('\n')
}
