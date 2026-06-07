import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({ pingDb: vi.fn(), migrationsApplied: vi.fn() }))
vi.mock('$lib/server/config', () => ({ missingProdEnv: vi.fn() }))
import { GET } from './+server'
import { pingDb, migrationsApplied } from '$lib/server/db'
import { missingProdEnv } from '$lib/server/config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = () => GET({} as any)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ok = (db: boolean, mig: boolean, missing: string[]) => {
  ;(pingDb as any).mockResolvedValue(db)
  ;(migrationsApplied as any).mockResolvedValue(mig)
  ;(missingProdEnv as any).mockReturnValue(missing)
}

beforeEach(() => vi.clearAllMocks())

describe('GET /readyz', () => {
  it('200 when DB, config and migrations are all ready', async () => {
    ok(true, true, [])
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok', db: true, config: true, migrations: true })
  })

  it('503 when the DB is unreachable', async () => {
    ok(false, true, [])
    const res = await call()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ db: false })
  })

  it('503 when required config is missing', async () => {
    ok(true, true, ['AUTH_SECRET'])
    const res = await call()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ config: false })
  })

  it('503 when migrations have not been applied', async () => {
    ok(true, false, [])
    const res = await call()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ migrations: false })
  })
})
