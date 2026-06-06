import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({ pingDb: vi.fn() }))
import { GET } from './+server'
import { pingDb } from '$lib/server/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = () => GET({} as any)

beforeEach(() => vi.clearAllMocks())

describe('GET /readyz', () => {
  it('200 when the DB is reachable', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(pingDb as any).mockResolvedValue(true)
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok', db: true })
  })

  it('503 when the DB is unreachable', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(pingDb as any).mockResolvedValue(false)
    const res = await call()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ status: 'unavailable', db: false })
  })
})
