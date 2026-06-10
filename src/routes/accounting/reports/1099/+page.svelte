<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { usd } from '$lib/accounting/format'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const years = $derived.by(() => {
    const now = new Date().getFullYear()
    return [now, now - 1, now - 2]
  })
</script>

<svelte:head><title>1099 Payments · Blueprint</title></svelte:head>

<AccountingShell {user} title="1099 Payments" maxWidth="900px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Reports', href: '/accounting/reports' }, { label: '1099' }]}>
  {#snippet actions()}
    <a class="btn-secondary" href={`/api/accounting/export/1099?year=${data.year}`}>⬇ CSV</a>
    <button class="btn-secondary" type="button" onclick={() => window.print()}>🖨 Print</button>
  {/snippet}

  <p class="report-hint">Cash paid per 1099-flagged vendor in {data.year}; $600+ means a 1099-NEC is due in January. Counts bill payments only — pay 1099 vendors through bills, not quick expenses. Flag vendors on the <a href="/accounting/vendors">Vendors</a> page. The CSV export carries full tax IDs for filing; this page masks them.</p>

  <div class="toolbar">
    <label class="field">Year
      <select value={data.year} onchange={(e) => goto(`/accounting/reports/1099?year=${e.currentTarget.value}`)}>
        {#each years as y (y)}<option value={y}>{y}</option>{/each}
      </select>
    </label>
  </div>

  <section class="card flush">
    {#if data.flaggedCount === 0}
      <p class="empty">No vendors are flagged as 1099 yet — flip the flag on the <a href="/accounting/vendors">Vendors</a> page first.</p>
    {:else if data.rows.length === 0}
      <p class="empty">No payments to 1099 vendors in {data.year}.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Vendor</th><th>Tax ID</th><th class="num">Payments</th><th class="num">Total paid</th><th>1099 due</th></tr>
          </thead>
          <tbody>
            {#each data.rows as r (r.vendor_id)}
              <tr>
                <td>{r.name}</td>
                <td class="mono">{r.tax_id ?? '— missing —'}</td>
                <td class="num">{r.paymentCount}</td>
                <td class="num">{usd(r.total)}</td>
                <td>{r.overThreshold ? '⚠️ YES' : 'no'}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td></td><td></td><td class="num">{usd(data.total)}</td><td></td></tr>
          </tfoot>
        </table>
      </div>
    {/if}
  </section>
</AccountingShell>
