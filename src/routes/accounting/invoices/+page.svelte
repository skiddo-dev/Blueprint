<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import StatusBadge from '$lib/components/accounting/StatusBadge.svelte'
  import { usd } from '$lib/accounting/format'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const invoices = $derived(data.invoices)
</script>

<svelte:head><title>Invoices · Blueprint</title></svelte:head>

<AccountingShell {user} title="📄 Invoices" maxWidth="1000px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Invoices' }]}>
  {#snippet actions()}
    <a class="btn-primary" href="/accounting/invoices/new">+ New invoice</a>
  {/snippet}

  <section class="card flush">
    {#if invoices.length === 0}
      <p class="empty">No invoices yet. Create one — optionally from a won quote.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Customer</th><th>Issued</th><th>Due</th>
              <th class="num">Total</th><th class="num">Balance</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each invoices as inv (inv._id)}
              <tr class="row-link" onclick={() => (window.location.href = `/accounting/invoices/${inv._id}`)}>
                <td class="mono">{inv.year}-{String(inv.number).padStart(4, '0')}</td>
                <td>{inv.customer_name}</td>
                <td class="mono">{inv.issue_date}</td>
                <td class="mono">{inv.due_date}</td>
                <td class="num">{usd(inv.total)}</td>
                <td class="num">{usd(inv.balance)}</td>
                <td><StatusBadge status={inv.status} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</AccountingShell>
