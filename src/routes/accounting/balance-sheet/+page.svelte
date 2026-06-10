<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { usd } from '$lib/accounting/format'
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

  function apply() { goto(`/accounting/balance-sheet?asOf=${asOf}${data.basis === 'cash' ? '&basis=cash' : ''}`) }

  const iso = (d: Date) => d.toISOString().slice(0, 10)
  function pick(which: 'today' | 'last-month-end' | 'last-year-end') {
    const now = new Date()
    if (which === 'today') asOf = iso(now)
    else if (which === 'last-month-end') asOf = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)))
    else asOf = `${now.getUTCFullYear() - 1}-12-31`
    apply()
  }
</script>

<svelte:head><title>Balance Sheet · Blueprint</title></svelte:head>

<AccountingShell {user} title="Balance Sheet" maxWidth="760px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: `As of ${asOf}` }]}>
  {#snippet actions()}
    <span class="badge" class:ok={st.balanced} class:bad={!st.balanced}>
      {st.balanced ? '✓ Balanced' : '✕ Out of balance'}
    </span>
    <a class="btn-secondary" href={`/api/accounting/export/balance-sheet?asOf=${data.asOf}${data.basis === 'cash' ? '&basis=cash' : ''}`}>⬇ CSV</a>
    <button class="btn-secondary" type="button" onclick={() => window.print()}><Icon name="printer" size={12} /> Print</button>
  {/snippet}

  <p class="report-hint">A snapshot of what the business owns and owes on a single date — assets on one side, liabilities plus equity on the other. The two sides must match.</p>
  <div class="basis-toggle" role="group" aria-label="Accounting basis">
    <a class="pill" class:active={data.basis !== 'cash'} href={`/accounting/balance-sheet?asOf=${data.asOf}`}>Accrual</a>
    <a class="pill" class:active={data.basis === 'cash'} href={`/accounting/balance-sheet?asOf=${data.asOf}&basis=cash`}
       title="A/R and A/P drop out; cash net income rides equity">Cash</a>
  </div>
  <div class="toolbar">
    <div class="quick-picks" role="group" aria-label="Quick as-of picks">
      <button class="btn-secondary" type="button" onclick={() => pick('today')}>Today</button>
      <button class="btn-secondary" type="button" onclick={() => pick('last-month-end')}>End of last month</button>
      <button class="btn-secondary" type="button" onclick={() => pick('last-year-end')}>End of last year</button>
    </div>
    <span class="qp-sep" aria-hidden="true"></span>
    <label class="field">As of<input type="date" bind:value={asOf} /></label>
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
</AccountingShell>

<style>
  /* Statement rows; shared chrome from accounting.css. */
  .quick-picks { display: flex; gap: 6px; flex-wrap: wrap; }
  .quick-picks .btn-secondary { padding: 7px 11px; font-size: 12px; border-radius: 999px; }
  .qp-sep { width: 1px; height: 26px; background: var(--border); align-self: flex-end; margin: 0 2px 5px; }
  .card { font-size: 14px; padding: 18px 20px; }
  .sec-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 700; margin: 0 0 4px; }
  .row { display: flex; justify-content: space-between; gap: 24px; padding: 5px 0; color: var(--text-body); }
  .row.muted { color: var(--text-faint); }
  .num { font-variant-numeric: tabular-nums; }
  .subtotal { font-weight: 700; color: var(--text); border-top: 1px solid var(--border-soft); margin-top: 2px; }
  .spacer { height: 14px; }
  .grand { font-weight: 800; font-size: 16px; color: var(--text); border-top: 2px solid var(--border); margin-top: 10px; padding-top: 10px; }
  .grand.bad { color: var(--danger); }
</style>
