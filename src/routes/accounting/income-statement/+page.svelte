<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import DateRange from '$lib/components/accounting/DateRange.svelte'
  import { usd } from '$lib/accounting/format'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const st = $derived(data.statement)
</script>

<svelte:head><title>Income Statement · Blueprint</title></svelte:head>

<AccountingShell {user} title="Income Statement" maxWidth="760px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Profit & Loss' }]}>
  {#snippet actions()}
    <a class="btn-secondary" href={`/api/accounting/export/income-statement?from=${data.from}&to=${data.to}${data.basis === 'cash' ? '&basis=cash' : ''}`}>⬇ CSV</a>
    <button class="btn-secondary" type="button" onclick={() => window.print()}><Icon name="printer" size={12} /> Print</button>
  {/snippet}

  <p class="report-hint">What the business earned over the period: revenue, minus the cost of doing the jobs, minus overhead — ending at net income.</p>
  <div class="basis-toggle" role="group" aria-label="Accounting basis">
    <a class="pill" class:active={data.basis !== 'cash'} href={`/accounting/income-statement?from=${data.from}&to=${data.to}`}>Accrual</a>
    <a class="pill" class:active={data.basis === 'cash'} href={`/accounting/income-statement?from=${data.from}&to=${data.to}&basis=cash`}
       title="Revenue when payments arrive, expenses when bills are paid">Cash</a>
  </div>
  <DateRange from={data.from} to={data.to} base="/accounting/income-statement" extraParams={data.basis === 'cash' ? { basis: 'cash' } : {}} />

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
</AccountingShell>

<style>
  /* Statement rows; shared chrome (card, toolbar) from accounting.css. */
  .card { font-size: 14px; padding: 18px 20px; }
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
