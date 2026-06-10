// The recurring-transaction engine. Templates live in `recurringTemplates`;
// each tick materializes whatever is due through the app's own create paths so
// every generated document is canonical. A due occurrence is CLAIMED first
// (atomic findOneAndUpdate on {_id, next_date}) and created after — under
// concurrent runners the loser's claim misses and it skips, so an occurrence
// can never post twice. Journal occurrences additionally carry an idempotent
// source_ref (`recurring:<template>:<date>`), which postEntry dedupes.
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { postEntry } from './accounting'
import { createInvoice, type CreateInvoiceInput } from './invoicing'
import { createBill, type CreateBillInput } from './payables'
import { advanceDate } from '$lib/accounting/recurring'
import { validateEntry } from '$lib/accounting/ledger'
import type { JournalLine, RecurringTemplate } from '$lib/accounting/types'
import { log } from './log'
import { writeAudit } from './audit'

const USE_MOCK = env.USE_MOCK_DATA === 'true'
const MAX_CATCHUP = 24 // missed occurrences materialized per template per tick

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

export type JournalPayload = { memo?: string; job?: string; lines: JournalLine[] }

export async function listTemplates(): Promise<RecurringTemplate[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = await col('recurringTemplates', d).find({}).sort({ next_date: 1, name: 1 }).toArray()
  return rows.map((t) => ({ ...t, _id: String(t._id) })) as RecurringTemplate[]
}

export async function createTemplate(input: {
  type: RecurringTemplate['type']
  name: string
  cadence: RecurringTemplate['cadence']
  next_date: string
  end_date?: string
  payload: unknown
  created_by?: string
}): Promise<RecurringTemplate> {
  if (!input.name.trim()) throw new Error('A recurring template needs a name')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.next_date)) throw new Error('next_date must be ISO YYYY-MM-DD')
  if (!['week', 'month'].includes(input.cadence?.unit)) throw new Error('cadence.unit must be week or month')
  // Journal payloads must balance NOW — a template that can never post is a bug
  // at creation time, not at 2am when the engine runs.
  if (input.type === 'journal') {
    const p = input.payload as JournalPayload
    const problems = validateEntry({ date: input.next_date, source: 'manual', lines: p?.lines ?? [] })
    if (problems.length) throw new Error(`Journal template doesn't balance: ${problems.join('; ')}`)
  }
  const t: RecurringTemplate = {
    _id: crypto.randomUUID(),
    type: input.type,
    name: input.name.trim(),
    cadence: { unit: input.cadence.unit, interval: Math.max(1, Math.floor(input.cadence.interval || 1)) },
    next_date: input.next_date,
    ...(input.end_date ? { end_date: input.end_date } : {}),
    payload: input.payload,
    active: true,
    ...(input.created_by ? { created_by: input.created_by } : {}),
    created_at: new Date().toISOString(),
  }
  const d = await getDb()
  await col('recurringTemplates', d).insertOne(t)
  await writeAudit({
    actor: input.created_by ?? 'system',
    action: 'recurring-template.create',
    entity_type: 'recurring-template',
    entity_id: t._id,
    summary: `Recurring ${t.type} "${t.name}" — first run ${t.next_date}`,
  })
  return t
}

export async function setTemplateActive(id: string, active: boolean, actor?: string): Promise<boolean> {
  const d = await getDb()
  const r = await col('recurringTemplates', d).findOneAndUpdate({ _id: id }, { $set: { active } })
  if (r) {
    await writeAudit({
      actor: actor ?? 'system',
      action: active ? 'recurring-template.resume' : 'recurring-template.pause',
      entity_type: 'recurring-template',
      entity_id: id,
      summary: `${active ? 'Resumed' : 'Paused'} recurring "${r.name}"`,
    })
  }
  return !!r
}

export async function deleteTemplate(id: string, actor?: string): Promise<boolean> {
  const d = await getDb()
  const r = await col('recurringTemplates', d).findOneAndDelete({ _id: id })
  if (r) {
    await writeAudit({
      actor: actor ?? 'system',
      action: 'recurring-template.delete',
      entity_type: 'recurring-template',
      entity_id: id,
      summary: `Deleted recurring "${r.name}" (posted documents stay in the books)`,
    })
  }
  return !!r
}

async function materialize(t: RecurringTemplate, date: string): Promise<string> {
  if (t.type === 'invoice') {
    const p = t.payload as CreateInvoiceInput
    const inv = await createInvoice({ ...p, issue_date: date, created_by: `recurring:${t.name}` })
    return `invoice ${inv.year}-${String(inv.number).padStart(4, '0')}`
  }
  if (t.type === 'bill') {
    const p = t.payload as CreateBillInput
    const bill = await createBill({ ...p, bill_date: date, created_by: `recurring:${t.name}` })
    return `bill ${bill.year}-${String(bill.number).padStart(4, '0')}`
  }
  const p = t.payload as JournalPayload
  const entry = await postEntry({
    date,
    memo: p.memo ?? t.name,
    source: 'manual',
    source_ref: `recurring:${t._id}:${date}`, // idempotent under any race
    ...(p.job ? { job: p.job } : {}),
    lines: p.lines,
    created_by: `recurring:${t.name}`,
  })
  // Invoice/bill templates audit through createInvoice/createBill; the journal
  // path posts directly, so it logs its own event here.
  await writeAudit({
    actor: `recurring:${t.name}`,
    action: 'journal-entry.create',
    entity_type: 'journal-entry',
    entity_id: entry._id,
    summary: `Recurring journal "${t.name}" posted for ${date}`,
  })
  return `journal entry ${date}`
}

/** Materialize everything due through `todayISO`. Safe to call from multiple
 *  places — each occurrence is claimed atomically before it posts. */
export async function runRecurring(todayISO: string): Promise<{ posted: number; errors: number }> {
  if (USE_MOCK) return { posted: 0, errors: 0 }
  const d = await getDb()
  const templates = col('recurringTemplates', d)
  let posted = 0
  let errors = 0

  const due = await templates.find({ active: true, next_date: { $lte: todayISO } }).toArray()
  for (const raw of due) {
    const t = { ...raw, _id: String(raw._id) } as RecurringTemplate
    let cursor = t.next_date
    for (let i = 0; i < MAX_CATCHUP && cursor <= todayISO; i++) {
      if (t.end_date && cursor > t.end_date) {
        await templates.updateOne({ _id: t._id }, { $set: { active: false, last_result: 'ended' } })
        break
      }
      const next = advanceDate(cursor, t.cadence)
      // Atomic claim: only the runner that moves next_date gets to post this one.
      const claim = await templates.findOneAndUpdate(
        { _id: t._id, next_date: cursor, active: true },
        { $set: { next_date: next, last_run: new Date().toISOString() } },
      )
      if (!claim) break // someone else claimed it (or it was paused)
      try {
        const ref = await materialize(t, cursor)
        posted++
        await templates.updateOne({ _id: t._id }, { $set: { last_result: `ok: ${ref}` } })
      } catch (e) {
        errors++
        const msg = e instanceof Error ? e.message : String(e)
        await templates.updateOne({ _id: t._id }, { $set: { last_result: `error: ${msg}` } })
        log.error('recurring template failed', { template: t.name, date: cursor, error: msg })
      }
      cursor = next
    }
  }
  return { posted, errors }
}
