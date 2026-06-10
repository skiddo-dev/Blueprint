<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { goto, invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const years = $derived.by(() => {
    const now = new Date().getFullYear()
    return [now + 1, now, now - 1]
  })

  // Cells edit as dollar strings; blank = 0. Seeded synchronously (SSR renders
  // the grid too) and re-seeded when the year changes.
  function buildGrid(): Record<string, string[]> {
    const g: Record<string, string[]> = {}
    for (const a of data.accounts) {
      const row = data.budget?.amounts[a._id]
      g[a._id] = row ? row.map((c) => (c ? (c / 100).toFixed(2) : '')) : new Array(12).fill('')
    }
    return g
  }
  // svelte-ignore state_referenced_locally
  let grid = $state(buildGrid())
  $effect(() => { grid = buildGrid() })

  let saving = $state(false)
  let savedAt = $state('')
  let errorMsg = $state('')

  const rowTotal = (id: string) =>
    (grid[id] ?? []).reduce((s, v) => {
      const n = Number(String(v).replace(/[$,]/g, ''))
      return s + (Number.isFinite(n) ? n : 0)
    }, 0)

  /** Fill the rest of a row with the January value — the common "same every month". */
  function fillAcross(id: string) {
    const first = grid[id]?.[0] ?? ''
    grid[id] = new Array(12).fill(first)
  }

  async function save() {
    saving = true
    errorMsg = ''
    savedAt = ''
    try {
      const r = await fetch(`/api/accounting/budgets/${data.year}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amounts: grid }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`)
      savedAt = new Date().toLocaleTimeString()
      await invalidateAll()
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>Budgets · Blueprint</title></svelte:head>

<AccountingShell {user} title="Budget {data.year}" maxWidth="1320px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Budgets' }]}>
  {#snippet actions()}
    <a class="btn-secondary" href={`/accounting/reports/budget-vs-actual?year=${data.year}`}>Budget vs actual →</a>
    <button class="btn-primary" type="button" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save budget'}</button>
  {/snippet}

  <p class="report-hint">Plan income and spending per account per month; the Budget-vs-Actual report scores the year against it. Dollar amounts; blank = zero. ⇥ fills a row with its January value.</p>

  <div class="toolbar">
    <label class="field">Year
      <select value={data.year} onchange={(e) => goto(`/accounting/budgets?year=${e.currentTarget.value}`)}>
        {#each years as y (y)}<option value={y}>{y}</option>{/each}
      </select>
    </label>
    {#if savedAt}<span class="saved">✓ Saved {savedAt}</span>{/if}
  </div>

  <section class="card flush">
    <div class="table-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th class="acc">Account</th>
            {#each MONTHS as m (m)}<th class="num">{m}</th>{/each}
            <th class="num">Year</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.accounts as a (a._id)}
            <tr class:inactive={!a.active}>
              <td class="acc"><span class="mono">{a.code}</span> {a.name}{#if !a.active}<span class="tag">inactive</span>{/if}</td>
              {#each MONTHS as _, mi (mi)}
                <td class="num"><input type="text" inputmode="decimal" bind:value={grid[a._id][mi]} placeholder="" aria-label={`${a.name} ${MONTHS[mi]}`} /></td>
              {/each}
              <td class="num total">${rowTotal(a._id).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td><button class="link muted" type="button" title="Fill the year with January's value" onclick={() => fillAcross(a._id)}>⇥</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if errorMsg}<p class="error pad">{errorMsg}</p>{/if}
  </section>
</AccountingShell>

<style>
  .grid input { width: 76px; padding: 4px 6px; text-align: right; font-size: 12.5px; }
  .grid .acc { min-width: 200px; white-space: nowrap; }
  .grid td, .grid th { padding: 4px 5px; }
  .grid .total { font-weight: 600; white-space: nowrap; }
  tr.inactive { opacity: 0.6; }
  .saved { color: #047857; font-size: 13px; font-weight: 600; align-self: center; }
  .pad { padding: 10px 16px; }
</style>
