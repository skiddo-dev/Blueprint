<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import StatusBadge from '$lib/components/accounting/StatusBadge.svelte'
  import { usd } from '$lib/accounting/format'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const bills = $derived(data.bills)
</script>

<svelte:head><title>Bills · Blueprint</title></svelte:head>

<AccountingShell {user} title="🧾 Bills" maxWidth="1000px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Bills' }]}>
  {#snippet actions()}
    <a class="btn-primary" href="/accounting/bills/new">+ New bill</a>
  {/snippet}

  <section class="card flush">
    {#if bills.length === 0}
      <p class="empty">No bills yet. Record what you owe vendors and subcontractors.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Vendor</th><th>Billed</th><th>Due</th>
              <th class="num">Total</th><th class="num">Balance</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each bills as b (b._id)}
              <tr class="row-link" onclick={() => (window.location.href = `/accounting/bills/${b._id}`)}>
                <td class="mono">{b.year}-{String(b.number).padStart(4, '0')}</td>
                <td>{b.vendor_name}</td>
                <td class="mono">{b.bill_date}</td>
                <td class="mono">{b.due_date}</td>
                <td class="num">{usd(b.total)}</td>
                <td class="num">{usd(b.balance)}</td>
                <td><StatusBadge status={b.status} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</AccountingShell>
