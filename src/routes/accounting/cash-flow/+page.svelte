<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import DateRange from '$lib/components/accounting/DateRange.svelte'
  import { usd } from '$lib/accounting/format'
  import type { CashFlowCategory } from '$lib/accounting/cashflow'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const order: CashFlowCategory[] = ['operating', 'investing', 'financing']
</script>

<svelte:head><title>Cash Flow · Blueprint</title></svelte:head>

<AccountingShell {user} title="Cash Flow" maxWidth="760px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Statement of Cash Flows' }]}>
  {#snippet actions()}
    <button class="btn-secondary" type="button" onclick={() => window.print()}><Icon name="printer" size={12} /> Print</button>
  {/snippet}

  <p class="report-hint">Where the cash actually moved over the period — money in and out of the bank, grouped by day-to-day operations, equipment, and financing.</p>
  <DateRange from={data.from} to={data.to} base="/accounting/cash-flow" />

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
</AccountingShell>

<style>
  /* Statement rows; shared chrome from accounting.css. */
  .card { font-size: 14px; padding: 18px 20px; }
  .sec-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 700; margin: 14px 0 4px; }
  .row { display: flex; justify-content: space-between; gap: 24px; padding: 5px 0; color: var(--text-body); }
  .row.muted { color: var(--text-faint); }
  .num { font-variant-numeric: tabular-nums; }
  .num.neg { color: var(--warning); }
  .subtotal { font-weight: 600; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 2px; }
  .begin { font-weight: 600; color: var(--text); border-bottom: 1px solid var(--border-soft); padding-bottom: 8px; }
  .net { font-weight: 800; font-size: 16px; color: var(--text); border-top: 2px solid var(--border); margin-top: 10px; padding-top: 10px; }
  .end { font-weight: 700; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 2px; padding-top: 8px; }
</style>
