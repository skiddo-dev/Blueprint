import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/server/db', () => ({
  listPendingAccessRequests: vi.fn(async () => [{ email: 'a@x.com', name: 'A', note: '', requested_at: '' }]),
  resolveAccessRequest: vi.fn(async () => true),
  upsertUser: vi.fn(async () => {}),
}))

import { GET, POST } from './+server'
import { upsertUser, resolveAccessRequest } from '$lib/server/db'

const sessionOf = (user: unknown) => ({ auth: async () => (user ? { user } : null) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (body: unknown, user: unknown): any => ({ locals: sessionOf(user), request: { json: async () => body } })
const admin = { role: 'admin' }

describe('POST /api/users/requests', () => {
  beforeEach(() => vi.clearAllMocks())

  it('approve provisions the user (pm) and marks the request approved', async () => {
    await POST(ev({ email: 'a@x.com', action: 'approve', name: 'A' }, admin))
    expect(upsertUser).toHaveBeenCalledWith('a@x.com', 'pm', 'A')
    expect(resolveAccessRequest).toHaveBeenCalledWith('a@x.com', 'approved')
  })

  it('deny only resolves — no provisioning', async () => {
    await POST(ev({ email: 'a@x.com', action: 'deny' }, admin))
    expect(upsertUser).not.toHaveBeenCalled()
    expect(resolveAccessRequest).toHaveBeenCalledWith('a@x.com', 'denied')
  })

  it('400 on an unknown action', async () => {
    await expect(POST(ev({ email: 'a@x.com', action: 'nope' }, admin))).rejects.toMatchObject({ status: 400 })
  })

  it('400 when email is missing', async () => {
    await expect(POST(ev({ action: 'deny' }, admin))).rejects.toMatchObject({ status: 400 })
  })
})
