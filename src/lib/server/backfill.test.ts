import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Task } from '$lib/types'

// Mock the db + llm layers so the backfill logic is tested in isolation (no
// Mongo, no OpenAI). tryAcquireLease always grants the lease here.
const getTasksMock = vi.hoisted(() => vi.fn())
const updateTaskFieldMock = vi.hoisted(() => vi.fn())
const parseMock = vi.hoisted(() => vi.fn())

vi.mock('./db', () => ({
  getTasks: getTasksMock,
  updateTaskField: updateTaskFieldMock,
  tryAcquireLease: vi.fn().mockResolvedValue(true),
  releaseLease: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./llm', () => ({ parseEmailWithLLM: parseMock }))

import { looksLikeRawSubject, backfillTitles } from './backfill'

function task(p: Partial<Task>): Task {
  return {
    _id: 'x', id: 'x', title: 't', assigned_to: 'a', status: 'To Do',
    created_by: 's', attachment_ids: [], created_at: '2026-01-01', ...p,
  } as Task
}

beforeEach(() => {
  getTasksMock.mockReset()
  updateTaskFieldMock.mockReset().mockResolvedValue(true)
  parseMock.mockReset()
})

describe('looksLikeRawSubject', () => {
  it('flags reply/forward prefixes', () => {
    expect(looksLikeRawSubject('RE: cooler quote')).toBe(true)
    expect(looksLikeRawSubject('FW: drawings')).toBe(true)
    expect(looksLikeRawSubject('Fwd: PO')).toBe(true)
  })
  it('flags embedded CRM ticket ids and over-long subjects', () => {
    expect(looksLikeRawSubject('New Sliding Door — Kroger 577 CRM:02960001')).toBe(true)
    expect(looksLikeRawSubject('x'.repeat(81))).toBe(true)
  })
  it('treats clean, short titles as already-good', () => {
    expect(looksLikeRawSubject('Cooler repair — Store 412')).toBe(false)
    expect(looksLikeRawSubject('')).toBe(false)
    expect(looksLikeRawSubject(undefined)).toBe(false)
  })
})

describe('backfillTitles', () => {
  it('dry run counts stale email-sourced tasks without calling the LLM or writing', async () => {
    getTasksMock.mockResolvedValue([
      task({ _id: 'a', title: 'RE: cooler 412', full_body: 'body a' }), // stale + email → candidate
      task({ _id: 'b', title: 'Cooler repair — 412', full_body: 'body b' }), // clean → skipped by default
      task({ _id: 'c', title: 'Manual task', full_body: undefined }), // manual → skipped
    ])

    const r = await backfillTitles({ dryRun: true })

    expect(r).toMatchObject({ scanned: 3, candidates: 1, updated: 0, dryRun: true })
    expect(parseMock).not.toHaveBeenCalled()
    expect(updateTaskFieldMock).not.toHaveBeenCalled()
  })

  it('re-titles only stale email tasks and skips unchanged/manual ones', async () => {
    getTasksMock.mockResolvedValue([
      task({ _id: 'a', title: 'RE: cooler 412', full_body: 'body a' }),
      task({ _id: 'b', title: 'Cooler repair — 412', full_body: 'body b' }), // not a candidate (clean)
      task({ _id: 'c', title: 'Manual task' }),                              // not a candidate (no body)
    ])
    parseMock.mockResolvedValue({ title: 'Walk-in cooler repair — Store 412' })

    const r = await backfillTitles()

    expect(r).toMatchObject({ candidates: 1, updated: 1 })
    expect(parseMock).toHaveBeenCalledTimes(1)
    expect(updateTaskFieldMock).toHaveBeenCalledWith('a', 'title', 'Walk-in cooler repair — Store 412')
  })

  it('skips a task when the LLM returns the same (or empty) title', async () => {
    getTasksMock.mockResolvedValue([task({ _id: 'a', title: 'RE: cooler 412', full_body: 'body a' })])
    parseMock.mockResolvedValue({ title: 'RE: cooler 412' })

    const r = await backfillTitles()

    expect(r).toMatchObject({ candidates: 1, updated: 0, skipped: 1 })
    expect(updateTaskFieldMock).not.toHaveBeenCalled()
  })

  it('with all=1, re-titles every email-sourced task (even clean-looking ones)', async () => {
    getTasksMock.mockResolvedValue([
      task({ _id: 'a', title: 'RE: cooler 412', full_body: 'body a' }),
      task({ _id: 'b', title: 'Cooler repair — 412', full_body: 'body b' }),
      task({ _id: 'c', title: 'Manual task' }), // still skipped — no email body
    ])
    parseMock.mockResolvedValue({ title: 'Fresh title' })

    const r = await backfillTitles({ all: true })

    expect(r).toMatchObject({ candidates: 2, updated: 2 })
    expect(updateTaskFieldMock).toHaveBeenCalledTimes(2)
  })
})
