import { describe, it, expect } from 'vitest'
import { newTaskSchema, userUpsertSchema, validateTaskFieldValue, readValidated } from './validation'

describe('newTaskSchema', () => {
  it('accepts a minimal task and strips unknown keys (blocks create-time mass-assignment)', () => {
    const r = newTaskSchema.safeParse({ title: 'Fix cooler', status: 'To Do', created_at: 'HACK', _id: 'x' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.title).toBe('Fix cooler')
      expect('created_at' in r.data).toBe(false)
      expect('_id' in r.data).toBe(false)
    }
  })

  it('requires a non-empty title', () => {
    expect(newTaskSchema.safeParse({}).success).toBe(false)
    expect(newTaskSchema.safeParse({ title: '   ' }).success).toBe(false)
  })

  it('rejects an invalid status but allows the nulls the modal sends', () => {
    expect(newTaskSchema.safeParse({ title: 'x', status: 'Nope' }).success).toBe(false)
    expect(newTaskSchema.safeParse({ title: 'x', quote: null, date: null, quote_status: null }).success).toBe(true)
  })
})

describe('userUpsertSchema', () => {
  it('accepts a valid user', () => {
    expect(userUpsertSchema.safeParse({ email: 'a@b.com', role: 'pm', name: 'A' }).success).toBe(true)
  })
  it('rejects a bad email and an unknown role', () => {
    expect(userUpsertSchema.safeParse({ email: 'nope' }).success).toBe(false)
    expect(userUpsertSchema.safeParse({ email: 'a@b.com', role: 'superadmin' }).success).toBe(false)
  })
})

describe('validateTaskFieldValue', () => {
  it('passes a valid status, rejects an invalid one', () => {
    expect(validateTaskFieldValue('status', 'Done')).toBe('Done')
    expect(() => validateTaskFieldValue('status', 'Nope')).toThrow()
  })
  it('allows null for nullable fields and passes through unruled fields', () => {
    expect(validateTaskFieldValue('date', null)).toBe(null)
    expect(validateTaskFieldValue('whatever', 42)).toBe(42)
  })
})

describe('readValidated', () => {
  it('400s on invalid JSON', async () => {
    const req = { json: async () => { throw new Error('bad') } } as unknown as Request
    await expect(readValidated(req, newTaskSchema)).rejects.toMatchObject({ status: 400 })
  })
  it('400s on a schema violation', async () => {
    const req = { json: async () => ({}) } as unknown as Request
    await expect(readValidated(req, newTaskSchema)).rejects.toMatchObject({ status: 400 })
  })
  it('returns parsed data on success', async () => {
    const req = { json: async () => ({ title: 'ok' }) } as unknown as Request
    expect((await readValidated(req, newTaskSchema)).title).toBe('ok')
  })
})
