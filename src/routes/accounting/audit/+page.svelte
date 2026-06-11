<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const TYPES = ['invoice', 'bill', 'customer', 'vendor', 'journal-entry', 'reconciliation', 'recurring-template', 'close']

  // svelte-ignore state_referenced_locally
  let type = $state(data.filters.type)
  // svelte-ignore state_referenced_locally
  let actor = $state(data.filters.actor)
  // svelte-ignore state_referenced_locally
  let from = $state(data.filters.from)
  // svelte-ignore state_referenced_locally
  let to = $state(data.filters.to)
  $effect(() => { type = data.filters.type; actor = data.filters.actor; from = data.filters.from; to = data.filters.to })

  function apply() {
    const q = new URLSearchParams()
    if (type) q.set('type', type)
    if (actor) q.set('actor', actor)
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    goto(`/accounting/audit${q.size ? `?${q}` : ''}`)
  }
  function clearFilters() { type = ''; actor = ''; from = ''; to = ''; apply() }

  /** Same filters, bigger limit: 200 → 500, then doubling. */
  function showMoreHref(): string {
    const q = new URLSearchParams()
    if (data.filters.type) q.set('type', data.filters.type)
    if (data.filters.actor) q.set('actor', data.filters.actor)
    if (data.filters.from) q.set('from', data.filters.from)
    if (data.filters.to) q.set('to', data.filters.to)
    q.set('limit', String(data.limit < 500 ? 500 : data.limit * 2))
    return `/accounting/audit?${q}`
  }

  /** Detail link for entity types that have a page. */
  function hrefFor(e: { entity_type: string; entity_id: string }): string | null {
    if (e.entity_type === 'invoice') return `/accounting/invoices/${e.entity_id}`
    if (e.entity_type === 'bill') return `/accounting/bills/${e.entity_id}`
    return null
  }
  const when = (iso: string) => iso.slice(0, 16).replace('T', ' ')
</script>

<svelte:head><title>Audit Log · Blueprint</title></svelte:head>

<AccountingShell {user} title="Audit Log" maxWidth="1000px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Audit log' }]}>

  <p class="report-hint">Every accounting action with who did it and when. The ledger itself is immutable (corrections post as reversals); this is the who-and-why layer on top.</p>

  <div class="toolbar">
    <label class="field">Type
      <select bind:value={type}>
        <option value="">All</option>
        {#each TYPES as t (t)}<option value={t}>{t}</option>{/each}
      </select>
    </label>
    <label class="field">Actor
      <select bind:value={actor}>
        <option value="">All</option>
        {#each data.actors as a (a)}<option value={a}>{a}</option>{/each}
      </select>
    </label>
    <label class="field">From<input type="date" bind:value={from} /></label>
    <label class="field">To<input type="date" bind:value={to} /></label>
    <button class="btn-secondary" type="button" onclick={apply}>Apply</button>
    {#if data.filters.type || data.filters.actor || data.filters.from || data.filters.to}
      <button class="btn-secondary" type="button" onclick={clearFilters}>Clear</button>
    {/if}
  </div>

  <section class="card flush">
    {#if data.events.length === 0}
      <p class="empty">No audit events{data.filters.type || data.filters.actor ? ' match these filters' : ' yet — they record as you work'}.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>When</th><th>Actor</th><th>Action</th><th>What</th></tr>
          </thead>
          <tbody>
            {#each data.events as e (e._id)}
              <tr>
                <td class="mono nowrap">{when(e.at)}</td>
                <td class="nowrap">{e.actor}</td>
                <td><span class="chip">{e.action}</span></td>
                <td>
                  {#if hrefFor(e)}
                    <a class="ev-link" href={hrefFor(e)}>{e.summary}</a>
                  {:else}
                    {e.summary}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if data.events.length >= data.limit}
        <p class="cap-note">
          Showing the most recent {data.limit} events.
          <a class="more-link" href={showMoreHref()}>Show more</a> — or narrow the filters.
        </p>
      {/if}
    {/if}
  </section>
</AccountingShell>

<style>
  .nowrap { white-space: nowrap; }
  .ev-link { color: inherit; text-decoration: none; }
  .ev-link:hover { text-decoration: underline; }
  .cap-note { font-size: var(--font-sm); color: var(--text-muted); padding: 10px 16px; margin: 0; }
  .more-link { color: var(--primary-text); font-weight: 600; text-decoration: none; }
  .more-link:hover { text-decoration: underline; }
</style>
