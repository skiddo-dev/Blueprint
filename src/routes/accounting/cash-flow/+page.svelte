<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import { goto } from '$app/navigation'
  import type { CashFlowCategory } from '$lib/accounting/cashflow'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  // svelte-ignore state_referenced_locally
  let from = $state(data.from)
  // svelte-ignore state_referenced_locally
  let to = $state(data.to)
  $effect(() => { from = data.from; to = data.to })

  const order: CashFlowCategory[] = ['operating', 'investing', 'financing']
  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  function apply() { goto(`/accounting/cash-flow?from=${from}&to=${to}`) }
</script>

<svelte:head><title>Cash Flow · Blueprint</title></svelte:head>

<PageShell {user} title="💵 Cash Flow" maxWidth="760px">
  {#snippet head()}
    <h1>💵 Cash Flow</h1>
    <p class="sub"><a href="/accounting">Accounting</a> · where the cash moved</p>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

  <div class="range">
    <label>From<input type="date" bind:value={from} /></label>
    <label>To<input type="date" bind:value={to} /></label>
    <button class="btn-secondary" type="button" onclick={apply}>Apply</button>
  </div>

  <section class="card">
    <div class="row begin"><span>Cash at start of period</span><span class="num">{usd(data.beginningCash)}</span></div>

    {#each order as cat (cat)}
      {@const sec = data.sections[cat]}
      <div class="sec-title">{sec.title}</div>
      {#if sec.lines.length === 0}
        <div class="row muted"><span>—</span><span class="num">{usd(0)}</span></div>
      {:else}
        {#each sec.lines as l (l.account_id)}
          <div class="row"><span>{l.name}</span><span class="num" class:neg={l.amount < 0}>{usd(l.amount)}</span></div>
        {/each}
      {/if}
      <div class="row subtotal"><span>Net cash from {sec.title.toLowerCase()}</span><span class="num" class:neg={sec.total < 0}>{usd(sec.total)}</span></div>
    {/each}

    <div class="row net" class:neg={data.netChange < 0}><span>Net change in cash</span><span class="num">{usd(data.netChange)}</span></div>
    <div class="row end"><span>Cash at end of period</span><span class="num">{usd(data.endingCash)}</span></div>
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
  .row { display: flex; justify-content: space-between; gap: 24px; padding: 5px 0; color: var(--text-body); }
  .row.muted { color: var(--text-faint); }
  .num { font-variant-numeric: tabular-nums; }
  .num.neg { color: #b45309; }
  .subtotal { font-weight: 600; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 2px; }
  .begin { font-weight: 600; color: var(--text); border-bottom: 1px solid var(--border-soft); padding-bottom: 8px; }
  .net { font-weight: 800; font-size: 16px; color: var(--text); border-top: 2px solid var(--border); margin-top: 10px; padding-top: 10px; }
  .end { font-weight: 700; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 2px; padding-top: 8px; }
</style>
