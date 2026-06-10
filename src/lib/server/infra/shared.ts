import type { InfraProvider, ProviderSpend, SpendLine } from './types'

// Small pure helpers shared by the provider clients: month bucketing,
// breakdown ranking, and the "empty" card used for both the not-configured and
// the fetch-failed states. Kept dependency-free so they're trivially unit-tested.

/** Dollars (a decimal) → integer cents, rounded half-away-from-zero. Kept local
 *  so this view has no dependency on the accounting ledger's money module; the
 *  billing APIs only ever return non-negative amounts, for which this matches
 *  money.ts's fromDollars exactly. Non-finite input → 0 (callers also guard). */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0
  const sign = dollars < 0 ? -1 : 1
  return sign * Math.round(Math.abs(dollars) * 100)
}

/** A date → its UTC month key "YYYY-MM". UTC (not local) so the current/prior
 *  month split is stable regardless of the server's timezone. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Start of the UTC month `n` months before `now` (n=0 → start of this month).
 *  Used as the lookback window start for the billing queries. */
export function monthsBackStart(now: Date, n: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1))
}

/** Rank a name→cents map into the largest `limit` line items, descending. Ties
 *  break by name for a stable order. */
export function topBreakdown(byName: Map<string, number>, limit = 8): SpendLine[] {
  return [...byName.entries()]
    .map(([name, amountCents]) => ({ name, amountCents }))
    .filter((l) => l.amountCents !== 0)
    .sort((a, b) => b.amountCents - a.amountCents || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** A zeroed card. With `hint` it's the not-configured state (configured:false);
 *  with `error` it's a configured provider whose fetch failed (configured:true) —
 *  so the UI can tell "needs setup" apart from "tried and broke". */
export function emptyProvider(
  provider: InfraProvider,
  label: string,
  opts: { error?: string; hint?: string } = {},
): ProviderSpend {
  return {
    provider,
    label,
    configured: opts.hint ? false : true,
    error: opts.hint ?? opts.error,
    currency: 'USD',
    monthToDateCents: 0,
    trend: [],
    breakdown: [],
    fetchedAt: new Date().toISOString(),
  }
}
