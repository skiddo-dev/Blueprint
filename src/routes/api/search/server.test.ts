import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({
  getTasks: vi.fn(async () => [
    { _id: 't1', title: 'Cooler repair', assigned_to: 'Ben', store_numbers: ['412'], status: 'To Do', created_at: '2026-01-01' },
  ]),
  getTasksForUser: vi.fn(async () => [
    { _id: 't9', title: 'My cooler task', assigned_to: 'Carol', store_numbers: ['412'], status: 'To Do', created_at: '2026-01-01' },
  ]),
  getQuotes: vi.fn(async () => [
    { _id: 'q1', year: 2026, store_number: '412', point_of_contact: 'Alex', description: 'Remodel', amount: 1000, source: 'imported', created_at: '2026-01-01' },
  ]),
  getProspects: vi.fn(async () => [
    { _id: 'p1', attom_id: 'p1', address: '1 Cooler Way, Troy', owner: 'X', source: 'mock', created_at: '2026-01-01' },
  ]),
}))

import { GET } from './+server'
import { getTasks, getTasksForUser, getQuotes, getProspects } from '$lib/server/db'

const sessionOf = (user: unknown) => ({ auth: async () => (user ? { user } : null) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (q: string, locals: any): any => ({ url: new URL(`http://x/api/search?q=${encodeURIComponent(q)}`), locals })

beforeEach(() => vi.clearAllMocks())

describe('GET /api/search', () => {
  it('401 when unauthenticated', async () => {
    await expect(GET(ev('cooler', sessionOf(null)))).rejects.toMatchObject({ status: 401 })
  })

  it('returns empty (and hits no DB) for queries under 2 chars', async () => {
    const res = await GET(ev('c', sessionOf({ role: 'admin' })))
    expect(await res.json()).toEqual({ tasks: [], quotes: [], prospects: [] })
    expect(getTasks).not.toHaveBeenCalled()
  })

  it('admin searches tasks, quotes, and prospects', async () => {
    const res = await GET(ev('cooler', sessionOf({ role: 'admin', displayName: 'Admin' })))
    const out = await res.json()
    expect(out.tasks.map((h: { id: string }) => h.id)).toEqual(['t1'])
    expect(out.prospects.map((h: { id: string }) => h.id)).toEqual(['p1'])
    expect(getTasks).toHaveBeenCalled()
    expect(getQuotes).toHaveBeenCalled()
    expect(getProspects).toHaveBeenCalled()
  })

  it('non-admin searches only their own tasks', async () => {
    const res = await GET(ev('cooler', sessionOf({ role: 'pm', displayName: 'Carol', email: 'carol@x.com' })))
    const out = await res.json()
    expect(out.tasks.map((h: { id: string }) => h.id)).toEqual(['t9'])
    expect(out.quotes).toEqual([])
    expect(out.prospects).toEqual([])
    expect(getTasksForUser).toHaveBeenCalledWith('carol@x.com', 'Carol')
    expect(getTasks).not.toHaveBeenCalled()
  })
})
