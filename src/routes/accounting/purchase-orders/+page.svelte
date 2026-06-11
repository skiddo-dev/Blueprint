<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import SortTh from '$lib/components/accounting/SortTh.svelte'
  import { createSort } from '$lib/accounting/tableSort.svelte'
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

  const sort = createSort<(typeof data.pos)[number]>({
    num: (p) => p.year * 10000 + p.number,
    vendor: (p) => p.vendor_name,
    date: (p) => p.date,
    total: (p) => p.total,
    billed: (p) => p.billed,
    remaining: (p) => Math.max(0, p.total - p.billed),
    status: (p) => p.status,
  })
  const sorted = $derived(sort.apply(visible))
</script>

<svelte:head><title>Purchase Orders · Blueprint</title></svelte:head>

<AccountingShell {user} title="Purchase Orders" maxWidth="940px"
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
      {#if data.pos.length === 0}
        <EmptyState icon="po" title="No purchase orders yet" framed={false}>
          Raise one to track committed spend before the bill arrives.
          {#snippet actions()}
            <a class="btn-primary" href="/accounting/purchase-orders/new">+ Create your first PO</a>
          {/snippet}
        </EmptyState>
      {:else}
        <p class="empty">Nothing matches this filter.</p>
      {/if}
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh {sort} key="num" label="PO" />
              <SortTh {sort} key="vendor" label="Vendor" />
              <SortTh {sort} key="date" label="Date" />
              <SortTh {sort} key="total" label="Total" num />
              <SortTh {sort} key="billed" label="Billed" num />
              <SortTh {sort} key="remaining" label="Remaining" num />
              <SortTh {sort} key="status" label="Status" />
            </tr>
          </thead>
          <tbody>
            {#each sorted as p (p._id)}
              <tr class="row-link" onclick={() => goto(`/accounting/purchase-orders/${p._id}`)}>
                <td class="mono"><a class="row-anchor" href={`/accounting/purchase-orders/${p._id}`} onclick={(e) => e.stopPropagation()}>{poNumber(p)}</a></td>
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
