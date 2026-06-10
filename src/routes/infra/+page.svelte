<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

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
        <h1>Infra Spend</h1>
        <p class="sub">Live billing from MongoDB Atlas, Azure, OpenAI &amp; GitHub</p>
      </div>
      <button class="btn-secondary" type="button" onclick={refresh} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : '↻ Refresh'}
      </button>
    </div>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

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
</PageShell>

<style>
  .head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  h1 { margin: 0; }
  .sub { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; }

  .card {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 12px; padding: 16px 18px; margin-bottom: 18px;
  }
  .total-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .total-num { font-size: 30px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .refreshed { font-size: 12px; color: var(--text-faint); white-space: nowrap; }

  .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .card-head h2 { font-size: 15px; margin: 0; color: var(--text); }

  .badge { font-size: 12px; font-weight: 600; border-radius: 10px; padding: 2px 9px; }
  .badge.ok { background: #d1fae5; color: #047857; }
  .badge.bad { background: #fee2e2; color: #dc2626; }
  .badge.muted { background: var(--chip-bg); color: var(--text-muted); }

  .mtd { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .mtd-num { font-size: 24px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .mtd-label { font-size: 12px; color: var(--text-muted); }

  .trend { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
  .trend-row { display: grid; grid-template-columns: 36px 1fr 90px; align-items: center; gap: 8px; }
  .trend-month { font-size: 12px; color: var(--text-muted); }
  .bar-track { background: var(--bg); border: 1px solid var(--border-soft); border-radius: 5px; height: 14px; overflow: hidden; }
  .bar { display: block; height: 100%; background: var(--primary); border-radius: 5px; min-width: 2px; }
  .trend-amt { font-size: 12px; text-align: right; color: var(--text-body); font-variant-numeric: tabular-nums; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border-soft); }
  th { color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }

  .btn-secondary {
    background: var(--bg); color: var(--text-body); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
  }
  .btn-secondary:hover:not(:disabled) { border-color: var(--primary); }
  .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

  .empty { color: var(--text-muted); font-size: 14px; padding: 4px 2px; margin: 0; }
  .error { color: #dc2626; font-size: 13px; background: #fee2e2; border-radius: 8px; padding: 8px 12px; margin: 0 0 14px; }
</style>
