<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  // Session comes from the root layout load; this route is admin-only.
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const tb = $derived(data.trialBalance)
  const entries = $derived(data.entries)
  const inBalance = $derived(tb.totalDebit === tb.totalCredit)

  // Cents → "$1,234.56". The values cross the load boundary as plain numbers.
  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const entryTotal = (lines: { debit: number }[]) => lines.reduce((a, l) => a + l.debit, 0)
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
            <td class="num">{usd(tb.totalDebit)}</td>
            <td class="num">{usd(tb.totalCredit)}</td>
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
</PageShell>

<style>
  .head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  h1 { margin: 0; }
  .sub { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; }

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
</style>
