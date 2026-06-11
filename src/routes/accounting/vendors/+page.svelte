<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import SortTh from '$lib/components/accounting/SortTh.svelte'
  import { createSort } from '$lib/accounting/tableSort.svelte'
  import { usd } from '$lib/accounting/format'
  import { maskTaxId } from '$lib/accounting/ten99'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const vendors = $derived(data.vendors)

  const sort = createSort<(typeof data.vendors)[number]>({
    name: (v) => v.name,
    email: (v) => v.email ?? '',
    ten99: (v) => Number(v.is_1099 ?? false),
    bills: (v) => v.billCount,
    billed: (v) => v.totalBilled,
    outstanding: (v) => v.outstanding,
  })
  const sorted = $derived(sort.apply(vendors))

  const totalOutstanding = $derived(vendors.reduce((a, v) => a + v.outstanding, 0))

  // Inline edit of a vendor's name/email.
  let editingId = $state<string | null>(null)
  let draftName = $state('')
  let draftEmail = $state('')
  let draft1099 = $state(false)
  let draftTaxId = $state('')
  let saving = $state(false)
  let error = $state('')

  function startEdit(v: { _id: string; name: string; email?: string; is_1099?: boolean; tax_id?: string }) {
    editingId = v._id
    draftName = v.name
    draftEmail = v.email ?? ''
    draft1099 = v.is_1099 ?? false
    draftTaxId = v.tax_id ?? ''
    error = ''
  }
  function cancel() { editingId = null; error = '' }

  async function save(id: string) {
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/vendors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName, email: draftEmail, is_1099: draft1099, tax_id: draftTaxId }),
      })
      if (!r.ok) throw new Error(await r.text())
      editingId = null
      await invalidateAll()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>Vendors · Blueprint</title></svelte:head>

<AccountingShell {user} title="Vendors" maxWidth="940px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Vendors' }]}>
  <section class="card flush">
    <div class="card-head">
      <h2>{vendors.length} vendor{vendors.length === 1 ? '' : 's'}</h2>
      <span class="muted">{usd(totalOutstanding)} owed</span>
    </div>
    {#if vendors.length === 0}
      <EmptyState icon="vendors" title="No vendors yet" framed={false}>
        They're created automatically when you enter a bill.
        {#snippet actions()}
          <a class="btn-primary" href="/accounting/bills/new">+ Enter your first bill</a>
        {/snippet}
      </EmptyState>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh {sort} key="name" label="Vendor" />
              <SortTh {sort} key="email" label="Email" />
              <SortTh {sort} key="ten99" label="1099" />
              <SortTh {sort} key="bills" label="Bills" num />
              <SortTh {sort} key="billed" label="Total billed" num />
              <SortTh {sort} key="outstanding" label="Outstanding" num />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each sorted as v (v._id)}
              {#if editingId === v._id}
                <tr class="editing">
                  <td><input type="text" bind:value={draftName} aria-label="Name" /></td>
                  <td><input type="email" bind:value={draftEmail} placeholder="(none)" aria-label="Email" /></td>
                  <td class="ten99-edit">
                    <label class="check"><input type="checkbox" bind:checked={draft1099} /> 1099</label>
                    {#if draft1099}<input type="text" bind:value={draftTaxId} placeholder="tax ID (EIN/SSN)" aria-label="Tax ID" />{/if}
                  </td>
                  <td class="num">{v.billCount}</td>
                  <td class="num">{usd(v.totalBilled)}</td>
                  <td class="num">{usd(v.outstanding)}</td>
                  <td class="row-actions">
                    <button class="link" type="button" onclick={() => save(v._id)} disabled={saving || !draftName.trim()}>{saving ? '…' : 'Save'}</button>
                    <button class="link muted" type="button" onclick={cancel} disabled={saving}>Cancel</button>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td><span class="party"><span class="avatar">{v.name.trim().slice(0, 1).toUpperCase()}</span>{v.name}</span></td>
                  <td class="muted">{v.email ?? '—'}</td>
                  <td>{#if v.is_1099}<span class="tag">1099{v.tax_id ? ` · ${maskTaxId(v.tax_id)}` : ''}</span>{:else}<span class="muted">—</span>{/if}</td>
                  <td class="num">{v.billCount}</td>
                  <td class="num">{usd(v.totalBilled)}</td>
                  <td class="num" class:owed={v.outstanding > 0}>{usd(v.outstanding)}</td>
                  <td class="row-actions"><button class="link" type="button" onclick={() => startEdit(v)}>Edit</button></td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
      {#if error}<p class="error">{error}</p>{/if}
    {/if}
  </section>
</AccountingShell>

<style>
  /* Inline-edit specifics not covered by the shared sheet. */
  tr.editing td { background: var(--primary-bg); }
  td input { padding: 5px 7px; border-radius: var(--radius-md); width: 100%; }
  .row-actions { text-align: right; white-space: nowrap; }
  .ten99-edit { min-width: 150px; }
  .ten99-edit .check { display: flex; align-items: center; gap: 6px; font-size: var(--font-sm); font-weight: 600; margin-bottom: 4px; }
  .ten99-edit .check input { width: auto; }
</style>
