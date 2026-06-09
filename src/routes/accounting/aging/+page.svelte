<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import AgingBars from '$lib/components/accounting/AgingBars.svelte'
  import { usd } from '$lib/accounting/format'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const aging = $derived(data.aging)

  const labels: Record<string, string> = { current: 'Current', '1-30': '1–30 days', '31-60': '31–60 days', '61-90': '61–90 days', '90+': '90+ days' }
</script>

<svelte:head><title>A/R Aging · Blueprint</title></svelte:head>

<AccountingShell {user} title="📈 A/R Aging" maxWidth="1000px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Receivables by age' }]}>
  <div class="aging-top">
    <AgingBars title="Receivables by age" buckets={aging.buckets} total={aging.total} />
  </div>

  <section class="card flush">
    <div class="card-head"><h2>Open invoices</h2></div>
    {#if aging.rows.length === 0}
      <p class="empty">Nothing outstanding — all invoices are paid. 🎉</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Customer</th><th>Due</th><th>Age</th><th class="num">Balance</th></tr></thead>
          <tbody>
            {#each aging.rows as r (r._id)}
              <tr class="row-link" onclick={() => (window.location.href = `/accounting/invoices/${r._id}`)}>
                <td class="mono">#{r.number}</td>
                <td>{r.name}</td>
                <td class="mono">{r.due_date}</td>
                <td><span class="chip" class:overdue={r.bucket !== 'current'}>{labels[r.bucket]}</span></td>
                <td class="num">{usd(r.balance)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</AccountingShell>

<style>
  .aging-top { margin-bottom: 18px; }
  /* Overdue variant of the shared .chip. */
  .chip.overdue { background: #fef3c7; color: #b45309; }
  :global(:root[data-theme='dark']) .chip.overdue { background: #422006; color: #fcd34d; }
</style>
