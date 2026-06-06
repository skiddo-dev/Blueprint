import { describe, it, expect } from 'vitest'
import {
  classifyEmail,
  computeReview,
  buildNewTask,
  buildThreadPatch,
  buildAttachmentPatch,
  type SyncEmail,
} from './syncLogic'
import type { Task } from '$lib/types'
import type { ParsedEmail } from './llm'
import type { ParsedDoc } from './attachmentParse'

function task(p: Partial<Task>): Task {
  return {
    _id: 'id', id: 'id', title: 't', assigned_to: 'Unassigned', status: 'To Do',
    created_by: 'system', attachment_ids: [], created_at: '2026-01-01T00:00:00Z', ...p,
  } as Task
}

function parsed(p: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    date: null, assigned_to: null, quote: null, quote_type: null, po: null,
    quote_status: null, store_numbers: [], summary: '', event: '',
    confidence: 1, uncertain_fields: [], ...p,
  }
}

const email = (p: Partial<SyncEmail> = {}): SyncEmail => ({
  id: 'msg1', subject: 'D-412 cooler', date: '2026-02-01', body: 'body', ...p,
})

describe('classifyEmail', () => {
  it('flags an already-imported message as a duplicate (exchange_id)', () => {
    const existing = [task({ _id: 'a', exchange_id: 'msg1' })]
    expect(classifyEmail(email({ id: 'msg1' }), existing).action).toBe('duplicate')
  })

  it('routes a reply on a tracked thread to update (most recent card wins)', () => {
    const existing = [
      task({ _id: 'old', conversation_id: 'thread1', created_at: '2026-01-01T00:00:00Z' }),
      task({ _id: 'new', conversation_id: 'thread1', created_at: '2026-02-01T00:00:00Z' }),
    ]
    const r = classifyEmail(email({ id: 'msgX', conversation_id: 'thread1' }), existing)
    expect(r.action).toBe('update')
    expect(r.task?._id).toBe('new')
  })

  it('treats an unseen message with no known thread as new', () => {
    const existing = [task({ _id: 'a', exchange_id: 'other', conversation_id: 'threadZ' })]
    expect(classifyEmail(email({ id: 'msg9', conversation_id: 'threadQ' }), existing).action).toBe('new')
  })
})

describe('computeReview', () => {
  it('flags low confidence', () => {
    const r = computeReview(parsed({ confidence: 0.3, assigned_to: 'Bob' }))
    expect(r.needs_review).toBe(true)
    expect(r.review_reason).toMatch(/confidence/i)
  })
  it('flags a missing assignee', () => {
    expect(computeReview(parsed({ assigned_to: null })).needs_review).toBe(true)
  })
  it('flags a quote with no type', () => {
    const r = computeReview(parsed({ assigned_to: 'Bob', quote: '$5,000', quote_type: null }))
    expect(r.needs_review).toBe(true)
  })
  it('flags self-reported uncertain fields', () => {
    expect(computeReview(parsed({ assigned_to: 'Bob', uncertain_fields: ['date'] })).needs_review).toBe(true)
  })
  it('passes a clean, confident extraction', () => {
    const r = computeReview(parsed({ assigned_to: 'Bob', quote: '$5,000', quote_type: 'T&M' }))
    expect(r.needs_review).toBe(false)
  })
})

describe('buildNewTask', () => {
  it('defaults a quoted task to Draft and opens a timeline', () => {
    const doc = buildNewTask(email(), parsed({ quote: '$1,000', assigned_to: 'Bob', quote_type: 'T&M', event: 'Quote requested' }), ['412'], 'admin')
    expect(doc.quote_status).toBe('Draft')
    expect(doc.assigned_to).toBe('Bob')
    expect(doc.conversation_id).toBeNull()
    expect((doc.timeline as unknown[]).length).toBe(1)
    expect(doc.needs_review).toBe(false)
  })
  it('falls back to Unassigned and flags for review', () => {
    const doc = buildNewTask(email(), parsed({ confidence: 0.2 }), [], 'admin')
    expect(doc.assigned_to).toBe('Unassigned')
    expect(doc.needs_review).toBe(true)
  })
})

describe('buildThreadPatch', () => {
  it('applies only fields the reply newly provides, unions stores, flags review', () => {
    const t = task({ quote: '$12,300', quote_status: 'Sent', store_numbers: ['412'], assigned_to: 'Bob' })
    const p = parsed({ po: '4471', quote_status: 'Won', store_numbers: ['118'], quote: '$99,999', event: 'Approved' })
    const { set, timelineEntry } = buildThreadPatch(t, p, email({ id: 'msg2', sender_name: 'Jeff' }))

    expect(set.po).toBe('4471')
    expect(set.quote_status).toBe('Won')
    expect(set.store_numbers).toEqual(['118', '412'])
    expect(set.quote).toBeUndefined()           // never overwrite an existing amount
    expect(set.assigned_to).toBeUndefined()      // already assigned
    expect(set.exchange_id).toBe('msg2')
    expect(set.needs_review).toBe(true)
    expect(timelineEntry.kind).toBe('email')
    expect(timelineEntry.text).toBe('Approved')
    expect(timelineEntry.from).toBe('Jeff')
  })

  it('claims an unassigned card for the reply’s assignee', () => {
    const t = task({ assigned_to: 'Unassigned' })
    const { set } = buildThreadPatch(t, parsed({ assigned_to: 'Kris' }), email())
    expect(set.assigned_to).toBe('Kris')
  })
})

describe('buildAttachmentPatch', () => {
  it('fills empty po/quote and logs the find', () => {
    const doc: ParsedDoc = { doc_type: 'Purchase Order', po: '4471', amount: '$12,300', store_numbers: [], summary: '', confidence: 0.9 }
    const patch = buildAttachmentPatch({}, doc, 'PO_4471.pdf')
    expect(patch).not.toBeNull()
    expect(patch!.set.po).toBe('4471')
    expect(patch!.set.quote).toBe('$12,300')
    expect(patch!.set.quote_status).toBe('Draft')
    expect(patch!.timelineEntry.text).toContain('PO 4471')
  })

  it('does not overwrite a quote the task already has', () => {
    const doc: ParsedDoc = { doc_type: 'Invoice', po: null, amount: '$1', store_numbers: [], summary: '', confidence: 0.9 }
    const patch = buildAttachmentPatch({ quote: '$50,000' }, doc, 'inv.pdf')
    expect(patch!.set.quote).toBeUndefined()
  })

  it('returns null when the document yields nothing useful', () => {
    const doc: ParsedDoc = { doc_type: 'Other', po: null, amount: null, store_numbers: [], summary: 'misc', confidence: 0.2 }
    expect(buildAttachmentPatch({}, doc, 'misc.pdf')).toBeNull()
  })
})
