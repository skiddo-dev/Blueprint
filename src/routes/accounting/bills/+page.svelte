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
  const bills = $derived(data.bills)

  const today = new Date().toISOString().slice(0, 10)
  const isOpen = (s: string) => s === 'open' || s === 'partial'
  const isOverdue = (b: { status: string; due_date: string }) => isOpen(b.status) && b.due_date < today

  // Client-side filtering — the list is already fully loaded.
  type Filter = 'all' | 'open' | 'overdue' | 'paid'
  let filter = $state<Filter>('all')
  let q = $state('')

  const counts = $derived({
    all: bills.length,
    open: bills.filter((b) => isOpen(b.status)).length,
    overdue: bills.filter(isOverdue).length,
    paid: bills.filter((b) => b.status === 'paid').length,
  })
  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'open', label: 'Open' },
    { key: 'overdue', label: 'Overdue' }, { key: 'paid', label: 'Paid' },
  ]

  const visible = $derived(bills.filter((b) => {
    if (filter === 'open' && !isOpen(b.status)) return false
    if (filter === 'overdue' && !isOverdue(b)) return false
    if (filter === 'paid' && b.status !== 'paid') return false
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    const num = `${b.year}-${String(b.number).padStart(4, '0')}`
    return b.vendor_name.toLowerCase().includes(needle) || num.includes(needle)
  }))

  const totals = $derived({
    total: visible.reduce((s, b) => s + b.total, 0),
    balance: visible.reduce((s, b) => s + b.balance, 0),
  })
  const paidPct = (b: { total: number; balance: number }) =>
    b.total > 0 ? Math.round(((b.total - b.balance) / b.total) * 100) : 0

  const sort = createSort<(typeof bills)[number]>({
    num: (b) => b.year * 10000 + b.number,
    vendor: (b) => b.vendor_name,
    due: (b) => b.due_date,
    total: (b) => b.total,
    paid: (b) => (b.total > 0 ? (b.total - b.balance) / b.total : 0),
    balance: (b) => b.balance,
    status: (b) => b.status,
  })
  const sorted = $derived(sort.apply(visible))
</script>

<svelte:head><title>Bills · Blueprint</title></svelte:head>

<AccountingShell {user} title="Bills" maxWidth="1000px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Bills' }]}>
  {#snippet actions()}
    <a class="btn-primary" href="/accounting/bills/new">+ New bill</a>
  {/snippet}

  <section class="card flush">
    {#if bills.length === 0}
      <EmptyState icon="bill" title="No bills yet" framed={false}>
        Record what you owe vendors and subcontractors.
        {#snippet actions()}
          <a class="btn-primary" href="/accounting/bills/new">+ Enter your first bill</a>
        {/snippet}
      </EmptyState>
    {:else}
      <div class="list-toolbar">
        <div class="filter-pills" role="group" aria-label="Filter bills by status">
          {#each FILTERS as f (f.key)}
            <button type="button" class:active={filter === f.key} onclick={() => (filter = f.key)}>
              {f.label}<span class="count">{counts[f.key]}</span>
            </button>
          {/each}
        </div>
        <input class="search-box" type="search" placeholder="Search vendor or #…" bind:value={q} aria-label="Search bills" />
      </div>

      {#if visible.length === 0}
        <p class="empty">Nothing matches{q.trim() ? ` “${q.trim()}”` : ''} — try a different filter.</p>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh {sort} key="num" label="#" />
                <SortTh {sort} key="vendor" label="Vendor" />
                <SortTh {sort} key="due" label="Due" />
                <SortTh {sort} key="total" label="Total" num />
                <SortTh {sort} key="paid" label="Paid" />
                <SortTh {sort} key="balance" label="Balance" num />
                <SortTh {sort} key="status" label="Status" />
              </tr>
            </thead>
            <tbody>
              {#each sorted as b (b._id)}
                {@const due = relativeDue(b.due_date, today)}
                <tr class="row-link" class:row-overdue={isOverdue(b)}
                  onclick={() => goto(`/accounting/bills/${b._id}`)}>
                  <td class="mono"><a class="row-anchor" href={`/accounting/bills/${b._id}`} onclick={(e) => e.stopPropagation()}>{b.year}-{String(b.number).padStart(4, '0')}</a></td>
                  <td>{b.vendor_name}</td>
                  <td><span class="due-chip" class:overdue={isOverdue(b)} title={b.due_date}>
                    {isOpen(b.status) ? due.label : b.due_date}
                  </span></td>
                  <td class="num">{usd(b.total)}</td>
                  <td><span class="pay-progress" title="{paidPct(b)}% paid"><span style:width="{paidPct(b)}%"></span></span></td>
                  <td class="num">{usd(b.balance)}</td>
                  <td><StatusBadge status={b.status} /></td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <td></td><td>{visible.length} bill{visible.length === 1 ? '' : 's'}</td><td></td>
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
