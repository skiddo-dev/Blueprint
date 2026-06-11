// Global search — pure, DOM-free matchers shared by the /api/search endpoint and
// (types) the palette UI. Data is small, so we match in-memory: an item is a hit
// when EVERY whitespace-separated query token appears somewhere in its haystack.
import type { Task, Quote, Prospect } from './types'

export interface SearchHit {
  type: 'task' | 'quote' | 'prospect'
  id: string
  title: string
  subtitle?: string
  href: string
}

export interface SearchResults {
  tasks: SearchHit[]
  quotes: SearchHit[]
  prospects: SearchHit[]
}

const CAP = 8

export function tokens(q: string): string[] {
  return q.toLowerCase().split(/\s+/).map(t => t.trim()).filter(Boolean)
}

function matchesAll(haystack: string, toks: string[]): boolean {
  const h = haystack.toLowerCase()
  return toks.every(t => h.includes(t))
}

// Most-recently-touched first (updated_at, falling back to created_at).
function byRecency(a: { created_at?: string; updated_at?: string }, b: { created_at?: string; updated_at?: string }): number {
  return (b.updated_at ?? b.created_at ?? '').localeCompare(a.updated_at ?? a.created_at ?? '')
}

const join = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' ')

export function searchTasks(tasks: Task[], q: string): SearchHit[] {
  const toks = tokens(q)
  if (!toks.length) return []
  return tasks
    .filter(t => matchesAll(join([
      t.title, t.description, t.full_body, t.notes, t.po,
      (t.store_numbers ?? []).join(' '), t.assigned_to, (t.co_assignees ?? []).join(' '),
      t.sender_name, t.sender_email, t.quote,
    ]), toks))
    .sort(byRecency)
    .slice(0, CAP)
    .map(t => ({
      type: 'task' as const,
      id: t._id,
      title: t.title,
      subtitle: [
        t.assigned_to && t.assigned_to !== 'Unassigned' ? `👤 ${t.assigned_to}` : null,
        (t.store_numbers ?? []).length ? `#${(t.store_numbers ?? []).join(' #')}` : null,
        t.po ? `PO ${t.po}` : null,
        t.status,
      ].filter(Boolean).join(' · ') || undefined,
      href: `/?task=${encodeURIComponent(t._id)}`,
    }))
}

export function searchQuotes(quotes: Quote[], q: string): SearchHit[] {
  const toks = tokens(q)
  if (!toks.length) return []
  return quotes
    .filter(qt => matchesAll(join([
      qt.description, qt.point_of_contact, qt.store_number, qt.po, qt.notes,
      String(qt.year ?? ''), String(qt.amount ?? ''),
    ]), toks))
    .sort(byRecency)
    .slice(0, CAP)
    .map(qt => ({
      type: 'quote' as const,
      id: qt._id,
      title: [qt.description, qt.point_of_contact].filter(Boolean).join(' — ') || `Quote #${qt.quote_number ?? ''}`,
      subtitle: [
        qt.store_number ? `Store ${qt.store_number}` : null,
        Number.isFinite(qt.amount) ? `$${Number(qt.amount).toLocaleString('en-US')}` : null,
        qt.status,
      ].filter(Boolean).join(' · ') || undefined,
      href: `/dashboard?quote=${encodeURIComponent(qt._id)}`,
    }))
}

export function searchProspects(prospects: Prospect[], q: string): SearchHit[] {
  const toks = tokens(q)
  if (!toks.length) return []
  return prospects
    .filter(p => matchesAll(join([p.address, p.owner, p.city, p.zip]), toks))
    .sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0))
    .slice(0, CAP)
    .map(p => ({
      type: 'prospect' as const,
      id: p._id,
      title: p.address,
      subtitle: [
        p.owner,
        p.building_sqft ? `${Math.round(p.building_sqft).toLocaleString('en-US')} sf` : null,
      ].filter(Boolean).join(' · ') || undefined,
      href: `/prospects?prospect=${encodeURIComponent(p._id)}`,
    }))
}
