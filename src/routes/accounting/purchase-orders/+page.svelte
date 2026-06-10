<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { usd } from '$lib/accounting/format'
  import { poNumber } from '$lib/accounting/purchaseOrders'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  let filter = $state<'all' | 'open' | 'partially-billed' | 'closed' | 'cancelled'>('all')
  const visible = $derived(filter === 'all' ? data.pos : data.pos.filter((p) => p.status === filter))
  const counts = $derived.by(() => {
    const c: Record<string, number> = { all: data.pos.length }
    for (const p of data.pos) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  })
  const FILTERS = ['all', 'open', 'partially-billed', 'closed', 'cancelled'] as const
</script>

<svelte:head><title>Purchase Orders · Blueprint</title></svelte:head>

<AccountingShell {user} title="📑 Purchase Orders" maxWidth="940px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Purchase orders' }]}>
  {#snippet actions()}
    <a class="btn-primary" href="/accounting/purchase-orders/new">+ New PO</a>
  {/snippet}

  <p class="report-hint">A commitment to spend — nothing posts to the books until a PO is converted to a bill. “Billed” tracks the non-void bills linked to each PO.</p>

  <div class="list-toolbar">
    <div class="filter-pills">
      {#each FILTERS as f (f)}
        <button type="button" class:active={filter === f} onclick={() => (filter = f)}>
          {f === 'all' ? 'All' : f.replace('-', ' ')} {counts[f] ? `(${counts[f]})` : ''}
        </button>
      {/each}
    </div>
  </div>

  <section class="card flush">
    {#if visible.length === 0}
      <p class="empty">{data.pos.length === 0 ? 'No purchase orders yet.' : 'Nothing matches this filter.'}</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>PO</th><th>Vendor</th><th>Date</th><th class="num">Total</th><th class="num">Billed</th><th class="num">Remaining</th><th>Status</th></tr>
          </thead>
          <tbody>
            {#each visible as p (p._id)}
              <tr class="row-link" onclick={() => goto(`/accounting/purchase-orders/${p._id}`)}>
                <td class="mono">{poNumber(p)}</td>
                <td>{p.vendor_name}</td>
                <td class="mono">{p.date}</td>
                <td class="num">{usd(p.total)}</td>
                <td class="num">{p.billed ? usd(p.billed) : ''}</td>
                <td class="num">{p.status === 'cancelled' ? '' : usd(Math.max(0, p.total - p.billed))}</td>
                <td><span class="chip">{p.status.replace('-', ' ')}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</AccountingShell>
