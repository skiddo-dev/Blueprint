import { getMeta, setMeta, tryAcquireLease, releaseLease } from '$lib/server/db'
import { log } from '$lib/server/log'
import { fetchAtlasSpend } from './atlas-billing'
import { fetchAzureSpend } from './azure-costs'
import { fetchGitHubSpend } from './github-billing'
import { fetchOpenAiSpend } from './openai-costs'
import { emptyProvider } from './shared'
import type { InfraProvider, InfraSnapshot, ProviderSpend } from './types'

export type { InfraSnapshot, ProviderSpend, SpendLine, SpendPoint } from './types'

// Orchestrates the provider clients into one cached snapshot. Billing APIs
// are slow and rate-limited, so the combined result is cached in the `meta`
// collection and only re-fetched past a TTL or on an explicit refresh. A
// distributed lease keeps the (≤2) replicas from stampeding the APIs at once.

const CACHE_KEY = 'infra_spend_cache'
const TTL_MS = 6 * 60 * 60_000 // 6h
const LEASE_MS = 60_000
// Upper bound on a single provider's fetch. Bounds the cold-start and explicit
// Refresh paths so one slow/throttled billing API (Azure Cost Management is the
// usual culprit) degrades to an Error card instead of hanging the whole page.
const FETCH_TIMEOUT_MS = 20_000

// Provider order shown in the UI (matches how the feature was described).
const FETCHERS: { provider: InfraProvider; label: string; fetch: (now: Date) => Promise<ProviderSpend> }[] = [
  { provider: 'atlas', label: 'MongoDB Atlas', fetch: fetchAtlasSpend },
  { provider: 'azure', label: 'Azure', fetch: fetchAzureSpend },
  { provider: 'openai', label: 'OpenAI', fetch: fetchOpenAiSpend },
  { provider: 'github', label: 'GitHub', fetch: fetchGitHubSpend },
]

/** Pure: turn settled fetch results into provider cards. The fetchers already
 *  catch their own errors, so a rejection here is unexpected — it still yields a
 *  visible error card instead of sinking the whole snapshot. */
export function buildProvidersFromSettled(
  results: PromiseSettledResult<ProviderSpend>[],
): ProviderSpend[] {
  return results.map((r, i) => {
    const { provider, label } = FETCHERS[i]
    if (r.status === 'fulfilled') return r.value
    return emptyProvider(provider, label, { error: r.reason instanceof Error ? r.reason.message : String(r.reason) })
  })
}

/** Pure: is this snapshot still within the cache TTL? */
export function isFresh(snapshot: InfraSnapshot, now: Date = new Date(), ttlMs: number = TTL_MS): boolean {
  const at = Date.parse(snapshot.refreshedAt)
  return Number.isFinite(at) && now.getTime() - at < ttlMs
}

/** Reject if `p` doesn't settle within `ms`. Clears its timer when `p` wins so a
 *  resolved fetch can't keep the process alive. The losing fetch is left to
 *  settle and be GC'd on its own (its result is simply discarded). */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} billing fetch timed out after ${Math.round(ms / 1000)}s`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

async function readCache(): Promise<InfraSnapshot | null> {
  try {
    const meta = await getMeta(CACHE_KEY)
    return (meta?.snapshot as InfraSnapshot) ?? null
  } catch {
    return null
  }
}

async function buildSnapshot(): Promise<InfraSnapshot> {
  const now = new Date()
  const results = await Promise.allSettled(
    FETCHERS.map((f) => withTimeout(f.fetch(now), FETCH_TIMEOUT_MS, f.label)),
  )
  return { providers: buildProvidersFromSettled(results), refreshedAt: now.toISOString() }
}

/** Re-fetch every provider and persist the snapshot. Lease-guarded so concurrent
 *  replicas don't all hit the rate-limited APIs; if another holds the lease we
 *  return the cache (or a one-off, non-persisted fetch when there's nothing
 *  cached yet). */
export async function refreshInfraSnapshot(): Promise<InfraSnapshot> {
  let acquired = false
  // A lease failure usually means another replica is refreshing — but it also
  // covers "DB unreachable" (e.g. local dev with no Mongo). Either way, fall
  // through to an unguarded, non-persisted fetch so the page still renders.
  try {
    acquired = await tryAcquireLease('infra_spend', LEASE_MS)
  } catch {
    /* DB down — proceed without the lease */
  }
  if (!acquired) {
    return (await readCache()) ?? (await buildSnapshot())
  }
  try {
    const snapshot = await buildSnapshot()
    try {
      await setMeta(CACHE_KEY, { snapshot })
    } catch (e) {
      log.warn('infra spend cache write failed', { error: e instanceof Error ? e.message : String(e) })
    }
    return snapshot
  } finally {
    await releaseLease('infra_spend')
  }
}

// In-process guard so concurrent stale page loads kick off at most one
// background refresh (the DB lease additionally dedupes across replicas).
let bgRefreshing = false

/** Fire-and-forget refresh for the stale-while-revalidate path. Deduped per
 *  process and never throws, so it can't crash the request that triggered it. */
function refreshInBackground(): void {
  if (bgRefreshing) return
  bgRefreshing = true
  void refreshInfraSnapshot()
    .catch((e) => log.warn('infra spend background refresh failed', { error: e instanceof Error ? e.message : String(e) }))
    .finally(() => {
      bgRefreshing = false
    })
}

/** Cached read for the page load. Stale-while-revalidate: serve any cached
 *  snapshot immediately — even a stale one — and refresh in the background, so
 *  the page never blocks on the slow, rate-limited billing APIs. Only a true
 *  cold start (nothing cached yet) fetches inline. Never throws — falls back to
 *  an empty snapshot so the page always renders. */
export async function getInfraSnapshot(): Promise<InfraSnapshot> {
  const cached = await readCache()
  if (cached) {
    if (!isFresh(cached)) refreshInBackground()
    return cached
  }
  try {
    return await refreshInfraSnapshot()
  } catch (e) {
    log.warn('infra spend refresh failed', { error: e instanceof Error ? e.message : String(e) })
    return { providers: FETCHERS.map((f) => emptyProvider(f.provider, f.label, { error: 'unavailable' })), refreshedAt: new Date().toISOString() }
  }
}
