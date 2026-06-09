<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const st = $derived(data.statement)

  // svelte-ignore state_referenced_locally
  let asOf = $state(data.asOf)
  $effect(() => { asOf = data.asOf })

  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  function apply() { goto(`/accounting/balance-sheet?asOf=${asOf}`) }
</script>

<svelte:head><title>Balance Sheet · Blueprint</title></svelte:head>

<PageShell {user} title="🏦 Balance Sheet" maxWidth="760px">
  {#snippet head()}
    <div class="head-row">
      <div>
        <h1>🏦 Balance Sheet</h1>
        <p class="sub"><a href="/accounting">Accounting</a> · As of {asOf}</p>
      </div>
      <span class="badge" class:ok={st.balanced} class:bad={!st.balanced}>
        {st.balanced ? '✓ Balanced' : '✕ Out of balance'}
      </span>
    </div>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

  <div class="range">
    <label>As of<input type="date" bind:value={asOf} /></label>
    <button class="btn-secondary" type="button" onclick={apply}>Apply</button>
  </div>

  <section class="card">
    {#snippet block(sec: { title: string; lines: { account_id: string; name: string; amount: number }[]; total: number }, totalLabel: string)}
      <div class="sec-title">{sec.title}</div>
      {#if sec.lines.length === 0}
        <div class="row muted"><span>—</span><span class="num">{usd(0)}</span></div>
      {:else}
        {#each sec.lines as l (l.account_id)}
          <div class="row"><span>{l.name}</span><span class="num">{usd(l.amount)}</span></div>
        {/each}
      {/if}
      <div class="row subtotal"><span>{totalLabel}</span><span class="num">{usd(sec.total)}</span></div>
    {/snippet}

    {@render block(st.assets, 'Total Assets')}
    <div class="spacer"></div>
    {@render block(st.liabilities, 'Total Liabilities')}
    {@render block(st.equity, 'Total Equity')}
    <div class="row grand" class:bad={!st.balanced}>
      <span>Total Liabilities &amp; Equity</span><span class="num">{usd(st.totalLiabilitiesAndEquity)}</span>
    </div>
  </section>
</PageShell>

<style>
  .head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  h1 { margin: 0; }
  .sub { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; }
  .sub a { color: var(--primary-text); text-decoration: none; }
  .badge { font-size: 12px; font-weight: 600; border-radius: 10px; padding: 2px 9px; flex-shrink: 0; }
  .badge.ok { background: #d1fae5; color: #047857; }
  .badge.bad { background: #fee2e2; color: #dc2626; }

  .range { display: flex; gap: 12px; align-items: flex-end; margin-bottom: 16px; }
  .range label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-body); }
  .range input { font: inherit; font-weight: 400; padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); }
  .btn-secondary { background: var(--bg); color: var(--text-body); border: 1px solid var(--border); border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-secondary:hover { border-color: var(--primary); }

  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; font-size: 14px; }
  .sec-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 700; margin: 0 0 4px; }
  .row { display: flex; justify-content: space-between; gap: 24px; padding: 5px 0; color: var(--text-body); }
  .row.muted { color: var(--text-faint); }
  .num { font-variant-numeric: tabular-nums; }
  .subtotal { font-weight: 700; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 2px; }
  .spacer { height: 14px; }
  .grand { font-weight: 800; font-size: 16px; color: var(--text); border-top: 2px solid var(--border); margin-top: 10px; padding-top: 10px; }
  .grand.bad { color: #dc2626; }
</style>
