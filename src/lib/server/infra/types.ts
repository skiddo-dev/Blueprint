// Shared shapes for the admin "Infra Spend" view. Every provider client
// normalizes its vendor-specific billing payload into one `ProviderSpend`, and
// the orchestrator (index.ts) bundles the three into an `InfraSnapshot` that is
// cached in the `meta` collection and rendered by /infra.
//
// Money is integer CENTS throughout (USD minor units) — never a float. Each
// client converts its vendor amount to cents at the boundary (Atlas already
// reports cents; OpenAI and Azure report decimal-dollar floats → dollarsToCents()
// in ./shared). Kept self-contained so this view has no cross-feature coupling.

export type InfraProvider = 'openai' | 'atlas' | 'azure'

export interface SpendPoint {
  /** Month label, e.g. "2026-06". */
  period: string
  amountCents: number
}

export interface SpendLine {
  /** Line-item / service name, e.g. "gpt-4o-mini" or "Azure Container Apps". */
  name: string
  amountCents: number
}

export interface ProviderSpend {
  provider: InfraProvider
  label: string
  /** False when the provider's credentials aren't set — the UI shows a
   *  "not configured" card instead of a zero. */
  configured: boolean
  /** Set when a configured provider's fetch failed; the others still render. */
  error?: string
  currency: string
  /** Spend so far in the current calendar month. */
  monthToDateCents: number
  /** The most recent completed month's total, if known. */
  lastFullMonthCents?: number
  /** Monthly totals, oldest → newest (roughly the last 6 months). */
  trend: SpendPoint[]
  /** Current-month spend broken out by line item / service, largest first. */
  breakdown: SpendLine[]
  /** ISO timestamp this provider was last fetched. */
  fetchedAt: string
}

export interface InfraSnapshot {
  providers: ProviderSpend[]
  refreshedAt: string
}
