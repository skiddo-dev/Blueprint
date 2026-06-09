import { getMeta, setMeta, tryAcquireLease, releaseLease } from '$lib/server/db'
import { log } from '$lib/server/log'
import { fetchAtlasSpend } from './atlas-billing'
import { fetchAzureSpend } from './azure-costs'
import { fetchOpenAiSpend } from './openai-costs'
import { emptyProvider } from './shared'
import type { InfraProvider, InfraSnapshot, ProviderSpend } from './types'

export type { InfraSnapshot, ProviderSpend, SpendLine, SpendPoint } from './types'

// Orchestrates the three provider clients into one cached snapshot. Billing APIs
// are slow and rate-limited, so the combined result is cached in the `meta`
// collection and only re-fetched past a TTL or on an explicit refresh. A
// distributed lease keeps the (≤2) replicas from stampeding the APIs at once.

const CACHE_KEY = 'infra_spend_cache'
const TTL_MS = 6 * 60 * 60_000 // 6h
const LEASE_MS = 60_000

// Provider order shown in the UI (matches how the feature was described).
const FETCHERS: { provider: InfraProvider; label: string; fetch: (now: Date) => Promise<ProviderSpend> }[] = [
  { provider: 'atlas', label: 'MongoDB Atlas', fetch: fetchAtlasSpend },
  { provider: 'azure', label: 'Azure', fetch: fetchAzureSpend },
  { provider: 'openai', label: 'OpenAI', fetch: fetchOpenAiSpend },
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
  const results = await Promise.allSettled(FETCHERS.map((f) => f.fetch(now)))
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

/** Cached read for the page load: serve a fresh cache immediately, otherwise
 *  refresh inline. Never throws — falls back to stale cache or an empty snapshot
 *  so the page always renders. */
export async function getInfraSnapshot(): Promise<InfraSnapshot> {
  const cached = await readCache()
  if (cached && isFresh(cached)) return cached
  try {
    return await refreshInfraSnapshot()
  } catch (e) {
    log.warn('infra spend refresh failed', { error: e instanceof Error ? e.message : String(e) })
    return cached ?? { providers: FETCHERS.map((f) => emptyProvider(f.provider, f.label, { error: 'unavailable' })), refreshedAt: new Date().toISOString() }
  }
}
