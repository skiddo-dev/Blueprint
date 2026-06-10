<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { usd, pct } from '$lib/accounting/format'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const report = $derived(data.report)
</script>

<svelte:head><title>Job profitability · Blueprint</title></svelte:head>

<AccountingShell {user} title="🏗️ Job profitability" maxWidth="900px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Reports', href: '/accounting/reports' }, { label: 'Jobs' }]}>
  {#snippet actions()}
    <button class="btn-secondary" type="button" onclick={() => window.print()}>🖨 Print</button>
  {/snippet}

  <p class="report-hint">Profit per job: invoiced revenue against vendor bills and job-tagged expenses, by document totals. Tag invoices, bills, and expenses with a job name as you enter them and this report builds itself.</p>

  <section class="card flush">
    {#if report.rows.length === 0}
      <p class="empty">No jobs tagged yet — add a job name on an invoice, bill, or expense and it shows up here.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Job</th><th class="num">Revenue</th><th class="num">Costs</th><th class="num">Profit</th><th class="num">Margin</th></tr>
          </thead>
          <tbody>
            {#each report.rows as r (r.job)}
              <tr class:unassigned={r.job === 'Unassigned'}>
                <td>{r.job}</td>
                <td class="num">{usd(r.revenue)}</td>
                <td class="num">{usd(r.costs)}</td>
                <td class="num" class:loss={r.profit < 0}>{usd(r.profit)}</td>
                <td class="num">{r.margin === null ? '—' : pct(r.margin, 1)}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="num">{usd(report.totals.revenue)}</td>
              <td class="num">{usd(report.totals.costs)}</td>
              <td class="num" class:loss={report.totals.profit < 0}>{usd(report.totals.profit)}</td>
              <td class="num">{report.totals.margin === null ? '—' : pct(report.totals.margin, 1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    {/if}
  </section>
</AccountingShell>

<style>
  tr.unassigned td { color: var(--text-muted); font-style: italic; }
  td.loss { color: #dc2626; font-weight: 600; }
</style>
