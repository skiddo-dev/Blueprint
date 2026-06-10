// Server-side fixed assets: the register, idempotent depreciation posting, and
// disposal. Crash-safety story: every depreciation month posts with source_ref
// `depr:<asset>:<YYYY-MM>` (at-most-once), the already-posted set is
// pre-queried and skipped, and posted_through is only advanced afterward — a
// crashed run re-drives cleanly. A LOCKED month in the remaining set aborts
// with a clear error instead of silently skipping (a skipped month would be a
// permanent hole the schedule never revisits).
import { env } from '$env/dynamic/private'
import { getDb } from './db'
import { withTxn } from './txn'
import { postEntry, postReversal, getCloseThrough, getAccounts } from './accounting'
import { writeAudit } from './audit'
import {
  depreciationSchedule, periodsToPost, depreciationLines, disposalLines, monthEndISO,
  ASSET_ACCT, type FixedAsset,
} from '$lib/accounting/assets'
import { isPeriodClosed } from '$lib/accounting/statements'
import { usd } from '$lib/accounting/format'
import { cents, type Cents } from '$lib/money'

const USE_MOCK = env.USE_MOCK_DATA === 'true'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function col(name: string, d: Awaited<ReturnType<typeof getDb>>) { return d.collection<any>(name) }

const deprRef = (assetId: string, period: string) => `depr:${assetId}:${period}`

export async function createAsset(input: {
  name: string
  asset_account_id?: string
  acquired_date: string
  in_service?: string // 'YYYY-MM', default the acquired month
  cost: Cents
  salvage?: Cents
  life_months: number
  created_by?: string
}): Promise<FixedAsset> {
  if (!input.name.trim()) throw new Error('An asset needs a name')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.acquired_date)) throw new Error('acquired_date must be ISO YYYY-MM-DD')
  const salvage = input.salvage ?? cents(0)
  if (input.cost <= 0) throw new Error('Cost must be positive')
  if (salvage >= input.cost) throw new Error('Salvage must be below cost — nothing would depreciate')
  if (!Number.isInteger(input.life_months) || input.life_months < 1) throw new Error('Life must be at least 1 month')
  const inService = input.in_service ?? input.acquired_date.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(inService)) throw new Error('in_service must be YYYY-MM')

  const asset: FixedAsset = {
    _id: crypto.randomUUID(),
    name: input.name.trim(),
    asset_account_id: input.asset_account_id ?? ASSET_ACCT.asset,
    acquired_date: input.acquired_date,
    in_service: inService,
    cost: input.cost,
    salvage,
    life_months: input.life_months,
    method: 'straight-line',
    status: 'active',
    ...(input.created_by ? { created_by: input.created_by } : {}),
    created_at: new Date().toISOString(),
  }
  const d = await getDb()
  await col('fixedAssets', d).insertOne(asset)
  await writeAudit({
    actor: input.created_by ?? 'system',
    action: 'asset.create',
    entity_type: 'fixed-asset',
    entity_id: asset._id,
    summary: `Asset "${asset.name}" — ${usd(asset.cost)} over ${asset.life_months} months`,
  })
  return asset
}

/** Accumulated depreciation ACTUALLY POSTED for one asset (net of reversals) —
 *  derived from its depr-ref entries, not the schedule, so disposal stays
 *  honest mid-catch-up. */
async function postedAccumulated(assetId: string): Promise<Cents> {
  const d = await getDb()
  const agg = await col('journalEntries', d).aggregate([
    { $match: { source: 'depreciation', source_ref: { $regex: `^depr:${assetId}:` }, status: 'posted' } },
    { $unwind: '$lines' },
    { $match: { 'lines.account_id': ASSET_ACCT.accumulated } },
    { $group: { _id: null, credit: { $sum: '$lines.credit' }, debit: { $sum: '$lines.debit' } } },
  ]).toArray()
  const g = agg[0]
  return cents(g ? (g.credit as number) - (g.debit as number) : 0)
}

export interface AssetView extends FixedAsset {
  accumulated: Cents
  bookValue: Cents
  schedule: { period: string; amount: Cents; accumulated: Cents; posted: boolean }[]
}

export async function listAssets(): Promise<AssetView[]> {
  if (USE_MOCK) return []
  const d = await getDb()
  const rows = (await col('fixedAssets', d).find({}).sort({ acquired_date: -1 }).toArray()) as FixedAsset[]
  return Promise.all(rows.map((a) => viewOf({ ...a, _id: String(a._id) })))
}

export async function getAsset(id: string): Promise<AssetView | null> {
  const d = await getDb()
  const a = await col('fixedAssets', d).findOne({ _id: id })
  return a ? viewOf({ ...a, _id: String(a._id) } as FixedAsset) : null
}

async function viewOf(a: FixedAsset): Promise<AssetView> {
  const accumulated = await postedAccumulated(a._id)
  const schedule = depreciationSchedule(a).map((r) => ({
    ...r,
    posted: !!a.posted_through && r.period <= a.posted_through,
  }))
  return { ...a, accumulated, bookValue: cents(a.cost - accumulated), schedule }
}

/** Post depreciation for every unposted month up to `through` ('YYYY-MM').
 *  Idempotent and crash-safe; aborts (with partial progress kept) on a locked
 *  month. */
export async function postDepreciation(
  assetId: string,
  through: string,
  created_by?: string,
): Promise<{ posted: number; skipped: number; through?: string }> {
  if (!/^\d{4}-\d{2}$/.test(through)) throw new Error('through must be YYYY-MM')
  const d = await getDb()
  const asset = (await col('fixedAssets', d).findOne({ _id: assetId })) as FixedAsset | null
  if (!asset) throw new Error(`No asset ${assetId}`)
  if (asset.status === 'disposed') throw new Error('Asset is disposed — nothing further depreciates')

  const due = periodsToPost(asset, through)
  if (!due.length) return { posted: 0, skipped: 0, through: asset.posted_through }

  // Months a crashed prior run already posted: skip without calling postEntry.
  const refs = due.map((p) => deprRef(assetId, p.period))
  const existing = new Set(
    (await col('journalEntries', d)
      .find({ source: 'depreciation', source_ref: { $in: refs } }, { projection: { source_ref: 1 } })
      .toArray()).map((e) => String(e.source_ref)),
  )

  const closedThrough = await getCloseThrough()
  let posted = 0
  let skipped = 0
  let last: string | undefined
  try {
    for (const { period, amount } of due) {
      if (existing.has(deprRef(assetId, period))) {
        skipped++
        last = period
        continue
      }
      const date = monthEndISO(period)
      if (isPeriodClosed(date, closedThrough)) {
        throw new Error(
          `${period} falls in the closed period (locked through ${closedThrough}) — unlock it before catching up depreciation`,
        )
      }
      await postEntry({
        date,
        memo: `Depreciation — ${asset.name} ${period}`,
        source: 'depreciation',
        source_ref: deprRef(assetId, period),
        lines: depreciationLines(amount),
        created_by,
      })
      posted++
      last = period
    }
  } finally {
    // Whatever landed stays acknowledged — the refs make replays at-most-once.
    if (last && (!asset.posted_through || last > asset.posted_through)) {
      await col('fixedAssets', d).updateOne({ _id: assetId }, { $set: { posted_through: last } })
    }
    if (posted > 0) {
      await writeAudit({
        actor: created_by ?? 'system',
        action: 'asset.depreciate',
        entity_type: 'fixed-asset',
        entity_id: assetId,
        summary: `Depreciated "${asset.name}" through ${last} (${posted} month${posted === 1 ? '' : 's'} posted)`,
      })
    }
  }
  return { posted, skipped, through: last }
}

/** Dispose an asset: clear cost + posted accumulated, book proceeds, plug the
 *  gain/loss to 4950, all in one entry (idempotent on `disposal:<asset>`). */
export async function disposeAsset(
  assetId: string,
  input: { date: string; proceeds: Cents; cash_account_id?: string; created_by?: string },
): Promise<FixedAsset> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be ISO YYYY-MM-DD')
  if (input.proceeds < 0) throw new Error('Proceeds cannot be negative')
  const d = await getDb()
  const asset = (await col('fixedAssets', d).findOne({ _id: assetId })) as FixedAsset | null
  if (!asset) throw new Error(`No asset ${assetId}`)
  if (asset.status === 'disposed') return { ...asset, _id: String(asset._id) } as FixedAsset

  if (input.cash_account_id) {
    const acct = (await getAccounts()).find((x) => x._id === input.cash_account_id)
    if (!acct?.active || acct.subtype !== 'bank') throw new Error('cash_account_id must be an active bank account')
  }
  const accumulated = await postedAccumulated(assetId)
  // One ref per disposal ATTEMPT (minted before the txn so a re-driven replay
  // stays at-most-once), not per asset — a fresh disposal after an undo must
  // get a fresh idempotency slot; entries themselves are never edited.
  const disposalId = crypto.randomUUID()
  return withTxn(async (session) => {
    const entry = await postEntry(
      {
        date: input.date,
        memo: `Disposal — ${asset.name}${input.proceeds > 0 ? ` (proceeds ${usd(input.proceeds)})` : ''}`,
        source: 'disposal',
        source_ref: `disposal:${assetId}:${disposalId}`,
        lines: disposalLines({
          cost: asset.cost,
          accumulated,
          proceeds: input.proceeds,
          assetAccount: asset.asset_account_id,
          ...(input.cash_account_id ? { cashAccount: input.cash_account_id } : {}),
        }),
        created_by: input.created_by,
      },
      { session },
    )
    const disposal = { date: input.date, proceeds: input.proceeds, entry_id: entry._id }
    await col('fixedAssets', d).updateOne(
      { _id: assetId },
      { $set: { status: 'disposed', disposal } },
      { session },
    )
    await writeAudit({
      actor: input.created_by ?? 'system',
      action: 'asset.dispose',
      entity_type: 'fixed-asset',
      entity_id: assetId,
      summary: `Disposed "${asset.name}" — proceeds ${usd(input.proceeds)}, book value was ${usd(cents(asset.cost - accumulated))}`,
      meta: { entry_id: entry._id },
    }, { session })
    return { ...asset, _id: String(asset._id), status: 'disposed', disposal } as FixedAsset
  })
}

/** Undo the most recent disposal: reverse its entry (dated today) and
 *  reactivate the asset. */
export async function undisposeAsset(assetId: string, opts: { created_by?: string } = {}): Promise<FixedAsset> {
  const d = await getDb()
  const asset = (await col('fixedAssets', d).findOne({ _id: assetId })) as FixedAsset | null
  if (!asset) throw new Error(`No asset ${assetId}`)
  if (asset.status !== 'disposed' || !asset.disposal) return { ...asset, _id: String(asset._id) } as FixedAsset

  const reversal = await postReversal(asset.disposal.entry_id, {
    date: new Date().toISOString().slice(0, 10),
    memo: `Undo disposal — ${asset.name}`,
    ...(opts.created_by ? { created_by: opts.created_by } : {}),
  })
  await col('fixedAssets', d).updateOne({ _id: assetId }, { $set: { status: 'active' }, $unset: { disposal: '' } })
  await writeAudit({
    actor: opts.created_by ?? 'system',
    action: 'asset.undispose',
    entity_type: 'fixed-asset',
    entity_id: assetId,
    summary: `Reinstated "${asset.name}" (disposal reversed)`,
    meta: { reversal_entry_id: reversal._id },
  })
  return { ...asset, _id: String(asset._id), status: 'active', disposal: undefined } as FixedAsset
}
