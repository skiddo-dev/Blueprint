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
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const years = $derived.by(() => {
    const now = new Date().getFullYear()
    return [now + 1, now, now - 1]
  })
  function nav(year: number, through: number) {
    goto(`/accounting/reports/budget-vs-actual?year=${year}&through=${through}`)
  }
</script>

<svelte:head><title>Budget vs Actual · Blueprint</title></svelte:head>

<AccountingShell {user} title="Budget vs Actual" maxWidth="1000px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Reports', href: '/accounting/reports' }, { label: 'Budget vs actual' }]}>
  {#snippet actions()}
    <a class="btn-secondary" href={`/api/accounting/export/budget-vs-actual?year=${data.year}&through=${data.through}`}>⬇ CSV</a>
    <button class="btn-secondary" type="button" onclick={() => window.print()}><Icon name="printer" size={12} /> Print</button>
  {/snippet}

  <p class="report-hint">How the year is tracking against the plan, through {MONTHS[data.through - 1]}. Favorable variance is positive: more income than planned, or less spend.</p>

  <div class="toolbar">
    <label class="field">Year
      <select value={data.year} onchange={(e) => nav(Number(e.currentTarget.value), 12)}>
        {#each years as y (y)}<option value={y}>{y}</option>{/each}
      </select>
    </label>
    <label class="field">Through
      <select value={data.through} onchange={(e) => nav(data.year, Number(e.currentTarget.value))}>
        {#each MONTHS as m, i (m)}<option value={i + 1}>{m}</option>{/each}
      </select>
    </label>
    <a class="btn-secondary" href={`/accounting/budgets?year=${data.year}`}>Edit budget →</a>
  </div>

  <section class="card flush">
    {#if !data.hasBudget && data.rows.length === 0}
      <p class="empty">No budget for {data.year} yet — <a href={`/accounting/budgets?year=${data.year}`}>set one up</a>.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Account</th><th class="num">Actual YTD</th><th class="num">Budget YTD</th><th class="num">Variance</th></tr>
          </thead>
          <tbody>
            {#each ['income', 'expense'] as section (section)}
              {@const sectionRows = data.rows.filter((r) => r.type === section)}
              {#if sectionRows.length}
                <tr class="sec"><td colspan="4">{section === 'income' ? 'Income' : 'Expenses'}</td></tr>
                {#each sectionRows as r (r.account_id)}
                  <tr>
                    <td><span class="mono">{r.account_id}</span> {r.name}</td>
                    <td class="num">{usd(r.actualYtd)}</td>
                    <td class="num">{usd(r.budgetYtd)}</td>
                    <td class="num" class:fav={r.varianceYtd > 0} class:unfav={r.varianceYtd < 0}>{usd(r.varianceYtd)}</td>
                  </tr>
                {/each}
                {@const t = section === 'income' ? data.totals.income : data.totals.expense}
                <tr class="subtotal">
                  <td>Total {section}</td>
                  <td class="num">{usd(t.actualYtd)}</td>
                  <td class="num">{usd(t.budgetYtd)}</td>
                  <td class="num" class:fav={t.varianceYtd > 0} class:unfav={t.varianceYtd < 0}>{usd(t.varianceYtd)}</td>
                </tr>
              {/if}
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td>Net income</td>
              <td class="num">{usd(data.totals.netActualYtd)}</td>
              <td class="num">{usd(data.totals.netBudgetYtd)}</td>
              <td class="num" class:fav={data.totals.netActualYtd - data.totals.netBudgetYtd > 0} class:unfav={data.totals.netActualYtd - data.totals.netBudgetYtd < 0}>
                {usd(data.totals.netActualYtd - data.totals.netBudgetYtd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    {/if}
  </section>
</AccountingShell>

<style>
  tr.sec td { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 700; background: var(--bg); }
  tr.subtotal td { font-weight: 700; border-top: 1px solid var(--border); }
  .fav { color: var(--success); }
  .unfav { color: var(--danger); }
</style>
