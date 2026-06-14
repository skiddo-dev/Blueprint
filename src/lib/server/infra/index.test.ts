import { describe, it, expect } from 'vitest'
import { buildProvidersFromSettled, isFresh, withTimeout } from './index'
import { emptyProvider } from './shared'
import type { ProviderSpend, InfraSnapshot } from './types'

// FETCHERS order in index.ts is [atlas, azure, openai, github]; results map positionally.
const ok = (provider: ProviderSpend['provider'], label: string): ProviderSpend => ({
  ...emptyProvider(provider, label, {}),
  monthToDateCents: 999,
})

describe('buildProvidersFromSettled', () => {
  it('keeps healthy providers when one rejects', () => {
    const results: PromiseSettledResult<ProviderSpend>[] = [
      { status: 'fulfilled', value: ok('atlas', 'MongoDB Atlas') },
      { status: 'rejected', reason: new Error('boom') },
      { status: 'fulfilled', value: ok('openai', 'OpenAI') },
      { status: 'fulfilled', value: ok('github', 'GitHub') },
    ]
    const providers = buildProvidersFromSettled(results)
    expect(providers.map((p) => p.provider)).toEqual(['atlas', 'azure', 'openai', 'github'])
    expect(providers[0].monthToDateCents).toBe(999)
    expect(providers[1].provider).toBe('azure')
    expect(providers[1].error).toBe('boom')
    expect(providers[2].monthToDateCents).toBe(999)
    expect(providers[3].monthToDateCents).toBe(999)
  })
})

describe('isFresh', () => {
  const now = new Date('2026-06-15T12:00:00Z')
  const at = (iso: string): InfraSnapshot => ({ providers: [], refreshedAt: iso })

  it('is fresh within the TTL and stale past it', () => {
    expect(isFresh(at('2026-06-15T10:00:00Z'), now)).toBe(true) // 2h ago
    expect(isFresh(at('2026-06-15T04:00:00Z'), now)).toBe(false) // 8h ago > 6h TTL
  })
  it('treats an unparseable timestamp as stale', () => {
    expect(isFresh(at('not-a-date'), now)).toBe(false)
  })
})

describe('withTimeout', () => {
  it('passes through a value that settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 50, 'Azure')).resolves.toBe(42)
  })

  it('rejects with a labeled message when the promise is too slow', async () => {
    const slow = new Promise<number>((res) => setTimeout(() => res(1), 100))
    await expect(withTimeout(slow, 10, 'Azure')).rejects.toThrow(/Azure billing fetch timed out/)
  })
})
