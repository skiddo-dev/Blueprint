<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import Icon from '$lib/components/Icon.svelte'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'
  // Shared `.acct`-scoped primitives (cards, tables, badges, errors) — the same
  // layer the accounting module uses, so this page carries no private copies.
  import '$lib/styles/accounting.css'

  let { data }: { data: PageData } = $props()
  // Session comes from the root layout load; this route is admin-only.
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  // Types are inferred from the load boundary — no import from $lib/server.
  type Snapshot = PageData['snapshot']
  type Provider = Snapshot['providers'][number]

  // svelte-ignore state_referenced_locally
  let snapshot = $state<Snapshot>(data.snapshot)
  $effect(() => { snapshot = data.snapshot })

  // Cents → "$1,234.56" (values cross the load boundary as plain numbers).
  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  const totalMtd = $derived(snapshot.providers.reduce((a, p) => a + p.monthToDateCents, 0))
  const totalPrev = $derived(snapshot.providers.reduce((a, p) => a + (p.lastFullMonthCents ?? 0), 0))

  let refreshing = $state(false)
  let refreshError = $state('')
  async function refresh() {
    refreshing = true
    refreshError = ''
    try {
      const r = await fetch('/api/infra/refresh', { method: 'POST' })
      if (!r.ok) throw new Error(await r.text())
      snapshot = await r.json()
    } catch (e) {
      refreshError = e instanceof Error ? e.message : String(e)
    } finally {
      refreshing = false
    }
  }

  // Largest month in a provider's trend, for proportional bar widths (min 1 so
  // we never divide by zero).
  const trendMax = (p: Provider) => Math.max(1, ...p.trend.map((t) => t.amountCents))

  const fmtMonth = (period: string) => {
    const [y, m] = period.split('-').map(Number)
    if (!y || !m) return period
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  }
  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(+d) ? '' : d.toLocaleString()
  }
</script>

<svelte:head><title>Infra Spend · Blueprint</title></svelte:head>

<PageShell {user} title="Infra Spend" maxWidth="980px">
  {#snippet head()}
    <div class="head-row">
      <div>
        <h1 class="page-title">Infra Spend</h1>
        <p class="page-sub">Live billing from MongoDB Atlas, Azure, OpenAI &amp; GitHub</p>
      </div>
      <button class="btn-secondary" type="button" onclick={refresh} disabled={refreshing}>
        <Icon name="refresh" size={14} /> {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

  <div class="acct">
  <section class="card total-card">
    <div>
      <div class="mtd-label">Total month-to-date</div>
      <div class="total-num">{usd(totalMtd)}</div>
      {#if totalPrev}<div class="mtd-label">Last full month · {usd(totalPrev)}</div>{/if}
    </div>
    {#if snapshot.refreshedAt}
      <div class="refreshed">Updated {fmtTime(snapshot.refreshedAt)}</div>
    {/if}
  </section>
  {#if refreshError}<p class="error">{refreshError}</p>{/if}

  {#each snapshot.providers as p (p.provider)}
    <section class="card">
      <div class="card-head">
        <h2>{p.label}</h2>
        {#if !p.configured}
          <span class="badge muted">Not configured</span>
        {:else if p.error}
          <span class="badge bad">Error</span>
        {:else}
          <span class="badge ok">● Live</span>
        {/if}
      </div>

      {#if !p.configured}
        <p class="empty">{p.error ?? 'Credentials not set for this provider.'}</p>
      {:else if p.error}
        <p class="error">{p.error}</p>
      {:else}
        <div class="mtd">
          <span class="mtd-num">{usd(p.monthToDateCents)}</span>
          <span class="mtd-label">
            month to date{#if p.lastFullMonthCents != null} · last month {usd(p.lastFullMonthCents)}{/if}
          </span>
        </div>

        {#if p.trend.length}
          <div class="trend" aria-label="Monthly trend">
            {#each p.trend as t (t.period)}
              <div class="trend-row">
                <span class="trend-month">{fmtMonth(t.period)}</span>
                <span class="bar-track"><span class="bar" style:width="{(t.amountCents / trendMax(p)) * 100}%"></span></span>
                <span class="trend-amt">{usd(t.amountCents)}</span>
              </div>
            {/each}
          </div>
        {/if}

        {#if p.breakdown.length}
          <table>
            <thead><tr><th>Line item</th><th class="num">Cost (MTD)</th></tr></thead>
            <tbody>
              {#each p.breakdown as b (b.name)}
                <tr><td>{b.name}</td><td class="num">{usd(b.amountCents)}</td></tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="empty">No charges this month yet.</p>
        {/if}
      {/if}
    </section>
  {/each}
  </div>
</PageShell>

<style>
  .head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .page-title { font-size: var(--font-2xl); font-weight: 800; color: var(--text); margin: 0; }
  .page-sub { color: var(--text-muted); margin: 4px 0 0; font-size: var(--font-sm); }

  /* Page-specific layout on top of the shared .acct primitives. */
  .total-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .total-num { font-size: var(--font-3xl); font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .refreshed { font-size: var(--font-sm); color: var(--text-faint); white-space: nowrap; }

  .badge.muted { background: var(--chip-bg); color: var(--text-muted); }

  .mtd { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .mtd-num { font-size: var(--font-2xl); font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .mtd-label { font-size: var(--font-sm); color: var(--text-muted); }

  .trend { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
  .trend-row { display: grid; grid-template-columns: 36px 1fr 90px; align-items: center; gap: 8px; }
  .trend-month { font-size: var(--font-sm); color: var(--text-muted); }
  .bar-track { background: var(--bg); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); height: 14px; overflow: hidden; }
  .bar { display: block; height: 100%; background: var(--primary); border-radius: var(--radius-sm); min-width: 2px; }
  .trend-amt { font-size: var(--font-sm); text-align: right; color: var(--text-body); font-variant-numeric: tabular-nums; }
</style>
