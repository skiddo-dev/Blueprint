// Pure fixed-asset math — no database. Straight-line depreciation over a life
// in months, penny-safe: the whole depreciable base is split with allocate()
// so the schedule sums EXACTLY to cost − salvage. Posting is the server's job
// (one idempotent entry per month, source_ref `depr:<asset>:<YYYY-MM>`).
import { allocate, cents, type Cents } from '$lib/money'
import type { JournalLine } from './types'

export const ASSET_ACCT = {
  asset: '1500',        // Vehicles & Equipment
  accumulated: '1510',  // Accumulated Depreciation (contra asset)
  expense: '6160',      // Depreciation Expense
  gainLoss: '4950',     // Gain/Loss on Asset Disposal
  cash: '1000',
} as const

export interface FixedAsset {
  _id: string
  name: string
  asset_account_id: string // default 1500
  acquired_date: string    // ISO YYYY-MM-DD
  in_service: string       // 'YYYY-MM' — depreciation starts this month
  cost: Cents
  salvage: Cents
  life_months: number
  method: 'straight-line'
  posted_through?: string  // 'YYYY-MM' of the last posted depreciation month
  status: 'active' | 'disposed'
  disposal?: { date: string; proceeds: Cents; entry_id: string }
  created_by?: string
  created_at: string
}

/** Next 'YYYY-MM' after a period. */
export function nextPeriod(period: string): string {
  const y = Number(period.slice(0, 4))
  const m = Number(period.slice(5, 7))
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** Last day of a 'YYYY-MM' as ISO — depreciation entries post at month-end. */
export function monthEndISO(period: string): string {
  const y = Number(period.slice(0, 4))
  const m = Number(period.slice(5, 7))
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** The full schedule: one row per month from in_service, penny-exact. */
export function depreciationSchedule(
  a: Pick<FixedAsset, 'in_service' | 'cost' | 'salvage' | 'life_months'>,
): { period: string; amount: Cents; accumulated: Cents }[] {
  const base = a.cost - a.salvage
  if (base <= 0 || a.life_months <= 0) return []
  const shares = allocate(cents(base), new Array(a.life_months).fill(1))
  const rows: { period: string; amount: Cents; accumulated: Cents }[] = []
  let period = a.in_service
  let acc = 0
  for (const amount of shares) {
    acc += amount
    rows.push({ period, amount, accumulated: cents(acc) })
    period = nextPeriod(period)
  }
  return rows
}

/** Months still unposted, from posted_through (exclusive) up to `through`
 *  (inclusive), capped at the schedule's end. */
export function periodsToPost(
  a: Pick<FixedAsset, 'in_service' | 'cost' | 'salvage' | 'life_months' | 'posted_through'>,
  through: string,
): { period: string; amount: Cents }[] {
  return depreciationSchedule(a).filter(
    (r) => r.period <= through && (!a.posted_through || r.period > a.posted_through),
  )
}

export function depreciationLines(amount: Cents): JournalLine[] {
  return [
    { account_id: ASSET_ACCT.expense, debit: amount, credit: cents(0) },
    { account_id: ASSET_ACCT.accumulated, debit: cents(0), credit: amount },
  ]
}

/** Disposal: clear the asset's cost and its accumulated depreciation, book any
 *  proceeds as cash, and plug the difference to 4950 — a credit there is a
 *  gain, a debit a loss. Balances by construction. */
export function disposalLines(o: {
  cost: Cents
  accumulated: Cents
  proceeds: Cents
  assetAccount: string
  cashAccount?: string
}): JournalLine[] {
  const lines: JournalLine[] = []
  if (o.accumulated > 0) lines.push({ account_id: ASSET_ACCT.accumulated, debit: o.accumulated, credit: cents(0) })
  if (o.proceeds > 0) lines.push({ account_id: o.cashAccount ?? ASSET_ACCT.cash, debit: o.proceeds, credit: cents(0) })
  lines.push({ account_id: o.assetAccount, debit: cents(0), credit: o.cost })
  const plug = o.accumulated + o.proceeds - o.cost // >0 gain (credit 4950), <0 loss (debit)
  if (plug > 0) lines.push({ account_id: ASSET_ACCT.gainLoss, debit: cents(0), credit: cents(plug) })
  else if (plug < 0) lines.push({ account_id: ASSET_ACCT.gainLoss, debit: cents(-plug), credit: cents(0) })
  return lines
}
