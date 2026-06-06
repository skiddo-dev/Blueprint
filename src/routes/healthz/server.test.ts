import { describe, it, expect } from 'vitest'
import { GET } from './+server'

describe('GET /healthz', () => {
  it('returns 200 ok with no dependencies', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET({} as any)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})
