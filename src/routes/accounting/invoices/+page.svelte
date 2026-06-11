<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import StatusBadge from '$lib/components/accounting/StatusBadge.svelte'
  import SortTh from '$lib/components/accounting/SortTh.svelte'
  import { createSort } from '$lib/accounting/tableSort.svelte'
  import { usd, relativeDue } from '$lib/accounting/format'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const invoices = $derived(data.invoices)

  const today = new Date().toISOString().slice(0, 10)
  const isOpen = (s: string) => s === 'open' || s === 'partial'
  const isOverdue = (inv: { status: string; due_date: string }) => isOpen(inv.status) && inv.due_date < today

  // Client-side filtering — the list is already fully loaded.
  type Filter = 'all' | 'open' | 'overdue' | 'paid'
  let filter = $state<Filter>('all')
  let q = $state('')

  const counts = $derived({
    all: invoices.length,
    open: invoices.filter((i) => isOpen(i.status)).length,
    overdue: invoices.filter(isOverdue).length,
    paid: invoices.filter((i) => i.status === 'paid').length,
  })
  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'open', label: 'Open' },
    { key: 'overdue', label: 'Overdue' }, { key: 'paid', label: 'Paid' },
  ]

  const visible = $derived(invoices.filter((inv) => {
    if (filter === 'open' && !isOpen(inv.status)) return false
    if (filter === 'overdue' && !isOverdue(inv)) return false
    if (filter === 'paid' && inv.status !== 'paid') return false
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    const num = `${inv.year}-${String(inv.number).padStart(4, '0')}`
    return inv.customer_name.toLowerCase().includes(needle) || num.includes(needle)
  }))

  const totals = $derived({
    total: visible.reduce((s, i) => s + i.total, 0),
    balance: visible.reduce((s, i) => s + i.balance, 0),
  })

  const sort = createSort<(typeof invoices)[number]>({
    num: (i) => i.year * 10000 + i.number,
    customer: (i) => i.customer_name,
    due: (i) => i.due_date,
    total: (i) => i.total,
    paid: (i) => (i.total > 0 ? (i.total - i.balance) / i.total : 0),
    balance: (i) => i.balance,
    status: (i) => i.status,
  })
  const sorted = $derived(sort.apply(visible))
  const paidPct = (inv: { total: number; balance: number }) =>
    inv.total > 0 ? Math.round(((inv.total - inv.balance) / inv.total) * 100) : 0
</script>

<svelte:head><title>Invoices · Blueprint</title></svelte:head>

<AccountingShell {user} title="Invoices" maxWidth="1000px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Invoices' }]}>
  {#snippet actions()}
    <a class="btn-primary" href="/accounting/invoices/new">+ New invoice</a>
  {/snippet}

  <section class="card flush">
    {#if invoices.length === 0}
      <EmptyState icon="invoice" title="No invoices yet" framed={false}>
        Create one — optionally from a won quote.
        {#snippet actions()}
          <a class="btn-primary" href="/accounting/invoices/new">+ Create your first invoice</a>
        {/snippet}
      </EmptyState>
    {:else}
      <div class="list-toolbar">
        <div class="filter-pills" role="group" aria-label="Filter invoices by status">
          {#each FILTERS as f (f.key)}
            <button type="button" class:active={filter === f.key} onclick={() => (filter = f.key)}>
              {f.label}<span class="count">{counts[f.key]}</span>
            </button>
          {/each}
        </div>
        <input class="search-box" type="search" placeholder="Search customer or #…" bind:value={q} aria-label="Search invoices" />
      </div>

      {#if visible.length === 0}
        <p class="empty">Nothing matches{q.trim() ? ` “${q.trim()}”` : ''} — try a different filter.</p>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh {sort} key="num" label="#" />
                <SortTh {sort} key="customer" label="Customer" />
                <SortTh {sort} key="due" label="Due" />
                <SortTh {sort} key="total" label="Total" num />
                <SortTh {sort} key="paid" label="Paid" />
                <SortTh {sort} key="balance" label="Balance" num />
                <SortTh {sort} key="status" label="Status" />
              </tr>
            </thead>
            <tbody>
              {#each sorted as inv (inv._id)}
                {@const due = relativeDue(inv.due_date, today)}
                <tr class="row-link" class:row-overdue={isOverdue(inv)}
                  onclick={() => goto(`/accounting/invoices/${inv._id}`)}>
                  <td class="mono"><a class="row-anchor" href={`/accounting/invoices/${inv._id}`} onclick={(e) => e.stopPropagation()}>{inv.year}-{String(inv.number).padStart(4, '0')}</a></td>
                  <td>{inv.customer_name}</td>
                  <td><span class="due-chip" class:overdue={isOverdue(inv)} title={inv.due_date}>
                    {isOpen(inv.status) ? due.label : inv.due_date}
                  </span></td>
                  <td class="num">{usd(inv.total)}</td>
                  <td><span class="pay-progress" title="{paidPct(inv)}% paid"><span style:width="{paidPct(inv)}%"></span></span></td>
                  <td class="num">{usd(inv.balance)}</td>
                  <td><StatusBadge status={inv.status} /></td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <td></td><td>{visible.length} invoice{visible.length === 1 ? '' : 's'}</td><td></td>
                <td class="num">{usd(totals.total)}</td><td></td>
                <td class="num">{usd(totals.balance)}</td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      {/if}
    {/if}
  </section>
</AccountingShell>
