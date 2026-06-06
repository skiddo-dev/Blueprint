import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchRecentEmails } from './email'

afterEach(() => vi.unstubAllGlobals())

describe('fetchRecentEmails — pagination', () => {
  it('follows @odata.nextLink across pages and returns every flagged message', async () => {
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        seen.push(u)
        if (u.includes('/oauth2/v2.0/token')) {
          return new Response(JSON.stringify({ access_token: 't' }), { status: 200 })
        }
        if (u.includes('/attachments')) {
          return new Response(JSON.stringify({ value: [] }), { status: 200 })
        }
        if (u.includes('skiptoken=PAGE2')) {
          return new Response(JSON.stringify({ value: [{ id: 'm3' }] }), { status: 200 }) // last page: no nextLink
        }
        // first messages page
        return new Response(
          JSON.stringify({
            value: [{ id: 'm1' }, { id: 'm2' }],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/x/messages?skiptoken=PAGE2',
          }),
          { status: 200 },
        )
      }),
    )

    const emails = await fetchRecentEmails('pm@x.com', 2)

    expect(emails.map(e => e.id)).toEqual(['m1', 'm2', 'm3'])
    expect(seen.some(u => u.includes('skiptoken=PAGE2'))).toBe(true) // second page was actually fetched
  })
})
