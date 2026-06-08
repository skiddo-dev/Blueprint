import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the DB layer so the handler/authz never touch Mongo. saveAttachment is
// the call we assert on; getTask backs the ownership check in assertCanAccessTask.
vi.mock('$lib/server/db', () => ({
  getTask: vi.fn(),
  saveAttachment: vi.fn(async () => ({ id: 'a1', filename: 'plan.pdf', size: 4, content_type: 'application/pdf' })),
  normName: (s: string | null | undefined) => (s ?? '').trim().toLowerCase(),
}))

import { POST } from './+server'
import { getTask, saveAttachment } from '$lib/server/db'

const sessionOf = (user: unknown) => ({ auth: async () => (user ? { user } : null) })
const fileForm = (file: unknown) => {
  const fd = new FormData()
  if (file) fd.append('file', file as File)
  return { formData: async () => fd }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (request: unknown, locals: any): any => ({ params: { id: 't1' }, locals, request })

beforeEach(() => {
  vi.clearAllMocks()
  // Default: a task owned by Bob, so the owner/admin paths are exercisable.
  vi.mocked(getTask).mockResolvedValue({ assigned_to: 'Bob', created_by: 'Bob' } as never)
})

describe('POST /api/tasks/[id]/attachments — upload', () => {
  it('401 when unauthenticated', async () => {
    const f = new File(['data'], 'plan.pdf', { type: 'application/pdf' })
    await expect(POST(ev(fileForm(f), sessionOf(null)))).rejects.toMatchObject({ status: 401 })
    expect(saveAttachment).not.toHaveBeenCalled()
  })

  it('403 when a non-owner tries to upload', async () => {
    const f = new File(['data'], 'plan.pdf', { type: 'application/pdf' })
    const locals = sessionOf({ role: 'pm', displayName: 'Mallory' })
    await expect(POST(ev(fileForm(f), locals))).rejects.toMatchObject({ status: 403 })
    expect(saveAttachment).not.toHaveBeenCalled()
  })

  it('400 when no file is provided', async () => {
    const locals = sessionOf({ role: 'admin', displayName: 'Admin' })
    await expect(POST(ev(fileForm(null), locals))).rejects.toMatchObject({ status: 400 })
    expect(saveAttachment).not.toHaveBeenCalled()
  })

  it('413 when the file exceeds the size cap', async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.bin')
    const locals = sessionOf({ role: 'admin', displayName: 'Admin' })
    await expect(POST(ev(fileForm(big), locals))).rejects.toMatchObject({ status: 413 })
    expect(saveAttachment).not.toHaveBeenCalled()
  })

  it('stores the file and returns its metadata for an owner', async () => {
    const f = new File(['data'], 'plan.pdf', { type: 'application/pdf' })
    const locals = sessionOf({ role: 'pm', displayName: 'Bob' })
    const res = await POST(ev(fileForm(f), locals))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, attachment: { id: 'a1', filename: 'plan.pdf' } })
    // The 6th arg tags the origin 'upload' so the retention sweep never purges it.
    expect(saveAttachment).toHaveBeenCalledWith('t1', 'plan.pdf', expect.any(Buffer), 4, 'application/pdf', 'upload')
  })

  it('strips a leaked path from the filename', async () => {
    const f = new File(['data'], 'C:\\Users\\bob\\plan.pdf', { type: 'application/pdf' })
    const locals = sessionOf({ role: 'admin', displayName: 'Admin' })
    await POST(ev(fileForm(f), locals))
    expect(saveAttachment).toHaveBeenCalledWith('t1', 'plan.pdf', expect.any(Buffer), expect.any(Number), 'application/pdf', 'upload')
  })
})
