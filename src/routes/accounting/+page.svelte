<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import StatTile from '$lib/components/accounting/StatTile.svelte'
  import AgingBars from '$lib/components/accounting/AgingBars.svelte'
  import TrendChart from '$lib/components/accounting/TrendChart.svelte'
  import { usd } from '$lib/accounting/format'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  // Session comes from the root layout load; this route is admin-only.
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const tb = $derived(data.trialBalance)
  const entries = $derived(data.entries)
  const kpis = $derived(data.kpis)

  // Net presentation: each account's net balance lands in one column. The column
  // totals (sum of nets on each side) always agree — that's the books balancing.
  const drTotal = $derived(tb.rows.reduce((a, r) => a + (r.net > 0 ? r.net : 0), 0))
  const crTotal = $derived(tb.rows.reduce((a, r) => a + (r.net < 0 ? -r.net : 0), 0))
  const inBalance = $derived(drTotal === crTotal)

  const entryTotal = (lines: { debit: number }[]) => lines.reduce((a, l) => a + l.debit, 0)

  // Period close: lock the books through a date so nothing can post on/before it.
  // svelte-ignore state_referenced_locally
  let lockDate = $state(data.closeThrough ?? '')
  $effect(() => { lockDate = data.closeThrough ?? '' })
  let savingLock = $state(false)
  let lockError = $state('')
  async function saveLock(through: string) {
    savingLock = true
    lockError = ''
    try {
      const r = await fetch('/api/accounting/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ through }),
      })
      if (!r.ok) throw new Error(await r.text())
      await invalidateAll()
    } catch (e) {
      lockError = e instanceof Error ? e.message : String(e)
    } finally {
      savingLock = false
    }
  }

  // Year-end close: post the closing entry (income/expense → Retained Earnings)
  // through the date, then lock there.
  async function closeBooks(through: string) {
    if (!confirm(`Close the books through ${through}? This posts a closing entry rolling net income into Retained Earnings and locks the period.`)) return
    savingLock = true
    lockError = ''
    try {
      const r = await fetch('/api/accounting/close-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ through }),
      })
      if (!r.ok) throw new Error(await r.text())
      await invalidateAll()
    } catch (e) {
      lockError = e instanceof Error ? e.message : String(e)
    } finally {
      savingLock = false
    }
  }
</script>

<svelte:head><title>Accounting · Blueprint</title></svelte:head>

<AccountingShell {user} title="Accounting" crumbs={[{ label: 'Blueprint Books' }]}>
  {#snippet actions()}
    <a class="btn-primary" href="/accounting/journal/new">+ New journal entry</a>
  {/snippet}

  <!-- KPI tiles: the at-a-glance financial health of the business, with
       direction (deltas/sparkline) and urgency (overdue / due-soon) chips. -->
  <div class="kpi-grid">
    <StatTile
      value={usd(kpis.cashOnHand)} label="Cash on hand" accent="#6366f1"
      sub={kpis.cashDeltaMtd === 0 ? 'Flat this month' : `${kpis.cashDeltaMtd > 0 ? '+' : '−'}${usd(Math.abs(kpis.cashDeltaMtd))} this month`}
      tone={kpis.cashDeltaMtd > 0 ? 'good' : kpis.cashDeltaMtd < 0 ? 'bad' : 'muted'}
      spark={data.cashSpark}
    />
    <StatTile
      value={usd(kpis.ar.total)} label="A/R outstanding" accent="#3b82f6"
      sub={kpis.ar.overdue > 0 ? `${usd(kpis.ar.overdue)} overdue` : 'None overdue'}
      tone={kpis.ar.overdue > 0 ? 'bad' : 'good'}
      href="/accounting/aging"
    />
    <StatTile
      value={usd(kpis.ap.total)} label="A/P outstanding" accent="#f59e0b"
      sub={kpis.ap.dueSoon > 0 ? `${usd(kpis.ap.dueSoon)} due within 7d` : 'Nothing due this week'}
      tone={kpis.ap.dueSoon > 0 ? 'warn' : 'good'}
      href="/accounting/ap-aging"
    />
    <StatTile
      value={usd(kpis.netIncomeYtd)} label="Net income · YTD"
      accent={kpis.netIncomeYtd >= 0 ? '#10b981' : '#ef4444'}
      sub={`${kpis.netIncomeMtd >= 0 ? '+' : '−'}${usd(Math.abs(kpis.netIncomeMtd))} this month`}
      tone={kpis.netIncomeMtd >= 0 ? 'good' : 'bad'}
      href="/accounting/income-statement"
    />
  </div>

  <!-- Quick actions for the common create flows. -->
  <div class="quick-actions">
    <a class="btn-secondary" href="/accounting/invoices/new"><Icon name="invoice" size={13} /> New invoice</a>
    <a class="btn-secondary" href="/accounting/bills/new"><Icon name="bill" size={13} /> New bill</a>
    <a class="btn-secondary" href="/accounting/expenses/new"><Icon name="spend" size={13} /> Record expense</a>
    <a class="btn-secondary" href="/accounting/reconcile"><Icon name="reconcile" size={13} /> Reconcile</a>
  </div>

  <!-- The "how's the business doing" trend — monthly revenue vs expenses. -->
  <TrendChart months={data.trend} title="Revenue vs expenses · last 6 months" />

  <!-- A/R & A/P aging distribution. -->
  <div class="charts-2">
    <AgingBars title="A/R aging" buckets={data.arAging.buckets} total={data.arAging.total} href="/accounting/aging" />
    <AgingBars title="A/P aging" buckets={data.apAging.buckets} total={data.apAging.total} href="/accounting/ap-aging" />
  </div>

  <section class="card">
    <div class="card-head"><h2>Recent journal entries</h2><a class="link" href="/accounting/journal/new">+ Add</a></div>
    {#if entries.length === 0}
      <p class="empty">No entries yet. Create a journal entry to get started.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Date</th><th>Memo</th><th>Source</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>
          {#each entries as e (e._id)}
            <tr>
              <td class="mono">{e.date}</td>
              <td>{e.memo ?? '—'}{#if e.reverses}<span class="tag">reversal</span>{/if}</td>
              <td><span class="chip">{e.source}</span></td>
              <td class="num">{usd(entryTotal(e.lines))}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <!-- Trial balance is accountant detail — collapsed by default so the hub leads
       with the financial picture, not the ledger. -->
  <details class="card trial">
    <summary title="Every posting carries equal debits and credits, so the two column totals must match — if they do, the books balance.">
      <span class="sum-title">Trial Balance <span class="hint-q" aria-hidden="true">?</span></span>
      <span class="badge" class:ok={inBalance} class:bad={!inBalance}>
        {inBalance ? '✓ In balance' : '✕ Out of balance'}
      </span>
    </summary>
    {#if tb.rows.length === 0}
      <p class="empty">No postings yet. Create a journal entry to get started.</p>
    {:else}
      <div class="trial-actions"><a class="btn-secondary" href="/api/accounting/export/trial-balance">⬇ CSV</a></div>
      <table>
        <thead>
          <tr><th>Code</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr>
        </thead>
        <tbody>
          {#each tb.rows as r (r.account_id)}
            <tr>
              <td class="mono"><a class="reg-link" href="/accounting/register/{r.account_id}">{r.account_id}</a></td>
              <td><a class="reg-link" href="/accounting/register/{r.account_id}">{r.name ?? '—'}</a></td>
              <td class="num">{r.net > 0 ? usd(r.net) : ''}</td>
              <td class="num">{r.net < 0 ? usd(-r.net) : ''}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <td></td><td>Total</td>
            <td class="num">{usd(drTotal)}</td>
            <td class="num">{usd(crTotal)}</td>
          </tr>
        </tfoot>
      </table>
    {/if}
  </details>

  <section class="card">
    <div class="card-head"><h2>Period close</h2></div>
    <p class="lock-status">
      {#if data.closeThrough}
        <Icon name="lock" size={13} /> Books locked through <strong>{data.closeThrough}</strong> — no entry can post on or before this date.
      {:else}
        <Icon name="unlock" size={13} /> Open — entries can post on any date.
      {/if}
    </p>
    <div class="lock-form">
      <label class="field">Through<input type="date" bind:value={lockDate} /></label>
      <button class="btn-secondary" type="button" onclick={() => saveLock(lockDate)} disabled={savingLock || !lockDate}>
        {savingLock ? 'Saving…' : 'Lock period'}
      </button>
      <button class="btn-secondary" type="button" onclick={() => closeBooks(lockDate)} disabled={savingLock || !lockDate}>
        {savingLock ? 'Working…' : 'Close year-end'}
      </button>
      {#if data.closeThrough}
        <button class="btn-ghost" type="button" onclick={() => saveLock('')} disabled={savingLock}>Clear lock</button>
      {/if}
    </div>
    <p class="lock-hint"><strong>Lock period</strong> just blocks back-dated posting. <strong>Close year-end</strong> also posts a closing entry rolling net income into Retained Earnings.</p>
    {#if lockError}<p class="error">{lockError}</p>{/if}
  </section>
</AccountingShell>

<style>
  /* Trial-balance collapsible: the shared .card supplies the chrome; these style
     just the <summary> affordance, which is page-specific. */
  .trial { padding-top: 0; padding-bottom: 0; }
  .trial-actions { display: flex; justify-content: flex-end; padding: 10px 0 2px; }
  .trial summary {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    cursor: pointer; list-style: none; padding: 16px 0; font-weight: 600;
  }
  .trial summary::-webkit-details-marker { display: none; }
  .trial[open] summary { border-bottom: 1px solid var(--border-soft); margin-bottom: 8px; }
  .trial .sum-title { font-size: var(--font-lg); color: var(--text); }
  .trial table { margin-bottom: 14px; }

  .lock-status { font-size: var(--font-md); color: var(--text-body); margin: 0 0 12px; }
  .lock-hint { font-size: var(--font-sm); color: var(--text-muted); margin: 10px 0 0; }
  .lock-form { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .reg-link { color: inherit; text-decoration: none; }
  .reg-link:hover { color: var(--primary-text); text-decoration: underline; }
</style>
