<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  // Session comes from the root layout load; this route is admin-only.
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const tb = $derived(data.trialBalance)
  const entries = $derived(data.entries)
  // Net presentation: each account's net balance lands in one column. The column
  // totals (sum of nets on each side) always agree — that's the books balancing.
  // (Don't show the gross totalDebit/totalCredit here; they wouldn't match the
  // net columns once an account has both debits and credits, e.g. A/R.)
  const drTotal = $derived(tb.rows.reduce((a, r) => a + (r.net > 0 ? r.net : 0), 0))
  const crTotal = $derived(tb.rows.reduce((a, r) => a + (r.net < 0 ? -r.net : 0), 0))
  const inBalance = $derived(drTotal === crTotal)

  // Cents → "$1,234.56". The values cross the load boundary as plain numbers.
  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
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

<PageShell {user} title="📒 Accounting" maxWidth="980px">
  {#snippet head()}
    <div class="head-row">
      <div>
        <h1>📒 Accounting</h1>
        <p class="sub">Double-entry ledger — trial balance and journal</p>
      </div>
      <a class="btn-primary" href="/accounting/journal/new">+ New journal entry</a>
    </div>
    <nav class="subnav">
      <a href="/accounting/invoices">📄 Invoices</a>
      <a href="/accounting/customers">🤝 Customers</a>
      <a href="/accounting/aging">📈 A/R Aging</a>
      <a href="/accounting/bills">🧾 Bills</a>
      <a href="/accounting/vendors">🏗️ Vendors</a>
      <a href="/accounting/ap-aging">📉 A/P Aging</a>
      <a href="/accounting/income-statement">📊 Income Statement</a>
      <a href="/accounting/balance-sheet">🏦 Balance Sheet</a>
      <a href="/accounting/cash-flow">💵 Cash Flow</a>
      <a href="/accounting/reconcile">✅ Reconcile</a>
    </nav>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

  <section class="card">
    <div class="card-head">
      <h2>Trial Balance</h2>
      <span class="badge" class:ok={inBalance} class:bad={!inBalance}>
        {inBalance ? '✓ In balance' : '✕ Out of balance'}
      </span>
    </div>

    {#if tb.rows.length === 0}
      <p class="empty">No postings yet. Create a journal entry to get started.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Code</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr>
        </thead>
        <tbody>
          {#each tb.rows as r (r.account_id)}
            <tr>
              <td class="mono">{r.account_id}</td>
              <td>{r.name ?? '—'}</td>
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
  </section>

  <section class="card">
    <div class="card-head"><h2>Recent journal entries</h2></div>
    {#if entries.length === 0}
      <p class="empty">No entries yet.</p>
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

  <section class="card">
    <div class="card-head"><h2>Period close</h2></div>
    <p class="lock-status">
      {#if data.closeThrough}
        🔒 Books locked through <strong>{data.closeThrough}</strong> — no entry can post on or before this date.
      {:else}
        🔓 Open — entries can post on any date.
      {/if}
    </p>
    <div class="lock-form">
      <label>Through<input type="date" bind:value={lockDate} /></label>
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
</PageShell>

<style>
  .head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  h1 { margin: 0; }
  .sub { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; }
  .subnav { display: flex; gap: 8px; margin-top: 12px; }
  .subnav a {
    font-size: 13px; font-weight: 600; text-decoration: none; color: var(--text-body);
    background: var(--bg); border: 1px solid var(--border); border-radius: 7px; padding: 6px 12px;
  }
  .subnav a:hover { border-color: var(--primary); color: var(--primary-text); }

  .btn-primary {
    background: var(--primary); color: #fff; border: 1px solid var(--primary);
    border-radius: 8px; padding: 9px 14px; font-size: 13px; font-weight: 600;
    text-decoration: none; white-space: nowrap; flex-shrink: 0;
  }
  .btn-primary:hover { filter: brightness(1.05); }

  .card {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 12px; padding: 16px 18px; margin-bottom: 18px;
  }
  .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .card-head h2 { font-size: 15px; margin: 0; color: var(--text); }

  .badge { font-size: 12px; font-weight: 600; border-radius: 10px; padding: 2px 9px; }
  .badge.ok { background: #d1fae5; color: #047857; }
  .badge.bad { background: #fee2e2; color: #dc2626; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border-soft); }
  th { color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text-body); }
  tfoot td { font-weight: 700; color: var(--text); border-top: 2px solid var(--border); border-bottom: none; }

  .empty { color: var(--text-muted); font-size: 14px; padding: 8px 2px; }
  .chip {
    background: var(--chip-bg); color: var(--primary-text);
    border-radius: 8px; padding: 1px 8px; font-size: 11px; font-weight: 600;
  }
  .tag {
    margin-left: 8px; background: #fef3c7; color: #b45309;
    border-radius: 8px; padding: 1px 7px; font-size: 11px; font-weight: 600;
  }

  .lock-status { font-size: 14px; color: var(--text-body); margin: 0 0 12px; }
  .lock-hint { font-size: 12px; color: var(--text-muted); margin: 10px 0 0; }
  .lock-form { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .lock-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-body); }
  .lock-form input { font: inherit; font-weight: 400; padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); }
  .btn-secondary { background: var(--bg); color: var(--text-body); border: 1px solid var(--border); border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-secondary:hover:not(:disabled) { border-color: var(--primary); }
  .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { background: none; border: none; color: var(--text-muted); font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: underline; }
  .error { color: #dc2626; font-size: 13px; background: #fee2e2; border-radius: 8px; padding: 8px 12px; margin-top: 10px; }
</style>
