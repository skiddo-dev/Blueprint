<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import EmptyState from '$lib/components/EmptyState.svelte'
  import SortTh from '$lib/components/accounting/SortTh.svelte'
  import { createSort } from '$lib/accounting/tableSort.svelte'
  import { usd } from '$lib/accounting/format'
  import { invalidateAll, goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const sort = createSort<(typeof data.assets)[number]>({
    name: (a) => a.name,
    inService: (a) => a.in_service,
    cost: (a) => a.cost,
    accumulated: (a) => a.accumulated ?? 0,
    book: (a) => a.bookValue,
    postedThru: (a) => a.posted_through ?? '',
    status: (a) => a.status,
  })
  const sorted = $derived(sort.apply(data.assets))

  const thisMonth = new Date().toISOString().slice(0, 7)
  let through = $state(thisMonth)
  let saving = $state(false)
  let errorMsg = $state('')
  let note = $state('')

  // New-asset form
  let showNew = $state(false)
  let name = $state('')
  let acquired = $state(new Date().toISOString().slice(0, 10))
  let cost = $state('')
  let salvage = $state('')
  let lifeMonths = $state(60)

  async function addAsset() {
    saving = true
    errorMsg = ''
    try {
      const r = await fetch('/api/accounting/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, acquired_date: acquired, cost, salvage: salvage || undefined, life_months: Number(lifeMonths) }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`)
      name = ''; cost = ''; salvage = ''; showNew = false
      await invalidateAll()
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function depreciateAll() {
    saving = true
    errorMsg = ''
    note = ''
    let posted = 0
    try {
      for (const a of data.assets.filter((x) => x.status === 'active')) {
        const r = await fetch(`/api/accounting/assets/${a._id}/depreciate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ through }),
        })
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`)
        posted += (await r.json()).posted
      }
      note = posted ? `Posted ${posted} depreciation entr${posted === 1 ? 'y' : 'ies'} through ${through}.` : `Nothing to post — everything is current through ${through}.`
      await invalidateAll()
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>Fixed Assets · Blueprint</title></svelte:head>

<AccountingShell {user} title="Fixed Assets" maxWidth="940px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Fixed assets' }]}>
  {#snippet actions()}
    <button class="btn-primary" type="button" onclick={() => (showNew = !showNew)}>{showNew ? 'Close' : '+ Add asset'}</button>
  {/snippet}

  <p class="report-hint">Vehicles & equipment with straight-line depreciation. Each month posts Dr 6160 Depreciation Expense / Cr 1510 Accumulated Depreciation — once, no matter how often you run it. Buy the asset itself with a bill or expense against 1500.</p>

  {#if showNew}
    <section class="card">
      <div class="new-grid">
        <label class="grow">Name<input type="text" bind:value={name} placeholder="2024 Ford Transit" /></label>
        <label>Acquired<input type="date" bind:value={acquired} /></label>
        <label>Cost<input type="text" inputmode="decimal" bind:value={cost} placeholder="0.00" /></label>
        <label>Salvage<input type="text" inputmode="decimal" bind:value={salvage} placeholder="0.00" /></label>
        <label>Life (months)<input type="number" min="1" bind:value={lifeMonths} /></label>
        <button class="btn-primary" type="button" onclick={addAsset} disabled={saving || !name.trim() || !cost.trim()}>
          {saving ? 'Adding…' : 'Add asset'}
        </button>
      </div>
    </section>
  {/if}

  <section class="card flush">
    {#if data.assets.length === 0}
      <EmptyState icon="asset" title="No assets registered yet" framed={false}>
        Register equipment and vehicles to track cost and depreciation.
      </EmptyState>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh {sort} key="name" label="Asset" />
              <SortTh {sort} key="inService" label="In service" />
              <SortTh {sort} key="cost" label="Cost" num />
              <SortTh {sort} key="accumulated" label="Accumulated" num />
              <SortTh {sort} key="book" label="Book value" num />
              <SortTh {sort} key="postedThru" label="Posted thru" />
              <SortTh {sort} key="status" label="Status" />
            </tr>
          </thead>
          <tbody>
            {#each sorted as a (a._id)}
              <tr class="row-link" onclick={() => goto(`/accounting/assets/${a._id}`)}>
                <td>{a.name}</td>
                <td class="mono">{a.in_service}</td>
                <td class="num">{usd(a.cost)}</td>
                <td class="num">{a.accumulated ? usd(a.accumulated) : ''}</td>
                <td class="num">{usd(a.bookValue)}</td>
                <td class="mono">{a.posted_through ?? '—'}</td>
                <td><span class="chip">{a.status}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="depr-bar">
        <label>Post depreciation through<input type="month" bind:value={through} /></label>
        <button class="btn-primary" type="button" onclick={depreciateAll} disabled={saving}>
          {saving ? 'Posting…' : 'Post depreciation'}
        </button>
        {#if note}<span class="note">✓ {note}</span>{/if}
      </div>
      {#if errorMsg}<p class="error pad">{errorMsg}</p>{/if}
    {/if}
  </section>
</AccountingShell>

<style>
  .new-grid { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .new-grid label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-sm); font-weight: 600; color: var(--text-body); }
  .new-grid .grow { flex: 1; min-width: 200px; }
  .depr-bar { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; padding: 12px 16px; border-top: 1px solid var(--border-soft); }
  .depr-bar label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-sm); font-weight: 600; color: var(--text-body); }
  .note { color: var(--success); font-size: var(--font-base); align-self: center; }
  .pad { padding: 0 16px 12px; }
</style>
