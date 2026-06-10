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
  const pnl = $derived(data.pnl)

  const MONTH = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
</script>

<svelte:head><title>P&L by month · Blueprint</title></svelte:head>

<AccountingShell {user} title="P&L by month" maxWidth="1100px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Reports', href: '/accounting/reports' }, { label: 'P&L by month' }]}>
  {#snippet actions()}
    <button class="btn-secondary" type="button" onclick={() => window.print()}><Icon name="printer" size={12} /> Print</button>
  {/snippet}

  <p class="report-hint">The income statement spread one column per month — how an accountant reads a year, and the fastest way to spot a drift in margin.</p>

  <div class="toolbar">
    <div class="quick-picks" role="group" aria-label="Window">
      {#each [3, 6, 12] as n (n)}
        <button class="btn-secondary" class:active={data.months === n} type="button"
          onclick={() => goto(`/accounting/reports/pnl-monthly?months=${n}`)}>Last {n} months</button>
      {/each}
    </div>
  </div>

  <section class="card flush">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Account</th>
            {#each pnl.months as m (m)}<th class="num">{MONTH(m)}</th>{/each}
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {#snippet section(title: string, rows: typeof pnl.revenue.rows, totals: number[], total: number)}
            <tr class="sec"><td colspan={pnl.months.length + 2}>{title}</td></tr>
            {#if rows.length === 0}
              <tr><td class="muted">—</td>{#each pnl.months as m (m)}<td class="num"></td>{/each}<td class="num"></td></tr>
            {/if}
            {#each rows as r (r.account_id)}
              <tr>
                <td><a class="acct-cell" href="/accounting/register/{r.account_id}">{r.name}</a></td>
                {#each r.cells as c, i (i)}<td class="num">{c !== 0 ? usd(c) : ''}</td>{/each}
                <td class="num strong">{usd(r.total)}</td>
              </tr>
            {/each}
            <tr class="subtotal">
              <td>Total {title.toLowerCase()}</td>
              {#each totals as t, i (i)}<td class="num">{usd(t)}</td>{/each}
              <td class="num">{usd(total)}</td>
            </tr>
          {/snippet}

          {@render section('Revenue', pnl.revenue.rows, pnl.revenue.totals, pnl.revenue.total)}
          {@render section('Expenses', pnl.expenses.rows, pnl.expenses.totals, pnl.expenses.total)}
          <tr class="net">
            <td>Net income</td>
            {#each pnl.net.cells as c, i (i)}<td class="num" class:loss={c < 0}>{usd(c)}</td>{/each}
            <td class="num" class:loss={pnl.net.total < 0}>{usd(pnl.net.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</AccountingShell>

<style>
  .quick-picks { display: flex; gap: 6px; flex-wrap: wrap; }
  .quick-picks .btn-secondary { padding: 7px 11px; font-size: 12px; border-radius: 999px; }
  .quick-picks .btn-secondary.active { background: var(--primary); color: #fff; border-color: var(--primary); }
  tr.sec td { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 700; padding-top: 14px; border-bottom: none; }
  tr.subtotal td { font-weight: 700; color: var(--text); border-top: 1px solid var(--border); }
  tr.net td { font-weight: 800; color: var(--success); border-top: 2px solid var(--border); font-size: 14px; }
  tr.net td.loss { color: var(--danger); }
  td.strong { font-weight: 600; }
  .acct-cell { color: var(--text-body); text-decoration: none; }
  .acct-cell:hover { color: var(--primary-text); text-decoration: underline; }
</style>
