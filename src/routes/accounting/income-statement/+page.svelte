<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const st = $derived(data.statement)

  // Mutable inputs seeded from the loaded range, re-synced on navigation.
  // svelte-ignore state_referenced_locally
  let from = $state(data.from)
  // svelte-ignore state_referenced_locally
  let to = $state(data.to)
  $effect(() => { from = data.from; to = data.to })

  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  function apply() { goto(`/accounting/income-statement?from=${from}&to=${to}`) }
</script>

<svelte:head><title>Income Statement · Blueprint</title></svelte:head>

<PageShell {user} title="📊 Income Statement" maxWidth="760px">
  {#snippet head()}
    <h1>📊 Income Statement</h1>
    <p class="sub"><a href="/accounting">Accounting</a> · Profit &amp; Loss</p>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

  <div class="range">
    <label>From<input type="date" bind:value={from} /></label>
    <label>To<input type="date" bind:value={to} /></label>
    <button class="btn-secondary" type="button" onclick={apply}>Apply</button>
  </div>

  <section class="card">
    {#snippet sectionBlock(title: string, lines: { account_id: string; name: string; amount: number }[], total: number)}
      <div class="sec-title">{title}</div>
      {#if lines.length === 0}
        <div class="row muted"><span>—</span><span class="num">{usd(0)}</span></div>
      {:else}
        {#each lines as l (l.account_id)}
          <div class="row"><span>{l.name}</span><span class="num">{usd(l.amount)}</span></div>
        {/each}
      {/if}
      <div class="row subtotal"><span>Total {title}</span><span class="num">{usd(total)}</span></div>
    {/snippet}

    {@render sectionBlock('Revenue', st.revenue.lines, st.revenue.total)}
    {@render sectionBlock('Cost of Goods Sold', st.cogs.lines, st.cogs.total)}
    <div class="row gross"><span>Gross Profit</span><span class="num">{usd(st.grossProfit)}</span></div>
    {@render sectionBlock('Operating Expenses', st.expenses.lines, st.expenses.total)}
    <div class="row net" class:loss={st.netIncome < 0}>
      <span>Net Income</span><span class="num">{usd(st.netIncome)}</span>
    </div>
  </section>
</PageShell>

<style>
  h1 { margin: 0; }
  .sub { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; }
  .sub a { color: var(--primary-text); text-decoration: none; }

  .range { display: flex; gap: 12px; align-items: flex-end; margin-bottom: 16px; }
  .range label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-body); }
  .range input { font: inherit; font-weight: 400; padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); }
  .btn-secondary { background: var(--bg); color: var(--text-body); border: 1px solid var(--border); border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-secondary:hover { border-color: var(--primary); }

  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; font-size: 14px; }
  .sec-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 700; margin: 14px 0 4px; }
  .sec-title:first-child { margin-top: 0; }
  .row { display: flex; justify-content: space-between; gap: 24px; padding: 5px 0; color: var(--text-body); }
  .row.muted { color: var(--text-faint); }
  .num { font-variant-numeric: tabular-nums; }
  .subtotal { font-weight: 600; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 2px; }
  .gross { font-weight: 700; color: var(--text); border-top: 2px solid var(--border); border-bottom: 1px solid var(--border-soft); margin: 8px 0; padding: 8px 0; }
  .net { font-weight: 800; font-size: 16px; color: #047857; border-top: 2px solid var(--border); margin-top: 10px; padding-top: 10px; }
  .net.loss { color: #dc2626; }
</style>
