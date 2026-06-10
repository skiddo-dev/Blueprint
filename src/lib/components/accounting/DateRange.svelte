<script lang="ts">
  import { goto } from '$app/navigation'
  // From/To + Apply control shared by the report pages (income statement, balance
  // sheet, cash flow), plus one-click period quick-picks — nobody wants to type
  // dates. Navigates to `${base}?from=&to=` so the server load re-runs.
  // Relies on the shared `.acct .toolbar/.field/.btn-secondary` styles.
  let {
    from,
    to,
    base,
    applyLabel = 'Apply',
    extraParams = {},
  }: {
    from: string
    to: string
    base: string
    applyLabel?: string
    extraParams?: Record<string, string> // carried on every navigation (e.g. basis=cash)
  } = $props()

  function withExtras(q: string): string {
    const extras = new URLSearchParams(extraParams).toString()
    return extras ? `${q}&${extras}` : q
  }

  // svelte-ignore state_referenced_locally
  let f = $state(from)
  // svelte-ignore state_referenced_locally
  let t = $state(to)
  $effect(() => { f = from; t = to })

  function apply() { goto(withExtras(`${base}?from=${f}&to=${t}`)) }

  const iso = (d: Date) => d.toISOString().slice(0, 10)
  function pick(range: 'month' | 'last-month' | 'quarter' | 'ytd') {
    const now = new Date()
    const y = now.getUTCFullYear()
    const m = now.getUTCMonth()
    let fromD: Date
    let toD: Date
    if (range === 'month') { fromD = new Date(Date.UTC(y, m, 1)); toD = new Date(Date.UTC(y, m + 1, 0)) }
    else if (range === 'last-month') { fromD = new Date(Date.UTC(y, m - 1, 1)); toD = new Date(Date.UTC(y, m, 0)) }
    else if (range === 'quarter') { const qs = Math.floor(m / 3) * 3; fromD = new Date(Date.UTC(y, qs, 1)); toD = new Date(Date.UTC(y, qs + 3, 0)) }
    else { fromD = new Date(Date.UTC(y, 0, 1)); toD = now }
    f = iso(fromD)
    t = iso(toD)
    apply()
  }
</script>

<div class="toolbar">
  <div class="quick-picks" role="group" aria-label="Quick period picks">
    <button class="btn-secondary" type="button" onclick={() => pick('month')}>This month</button>
    <button class="btn-secondary" type="button" onclick={() => pick('last-month')}>Last month</button>
    <button class="btn-secondary" type="button" onclick={() => pick('quarter')}>This quarter</button>
    <button class="btn-secondary" type="button" onclick={() => pick('ytd')}>YTD</button>
  </div>
  <span class="sep" aria-hidden="true"></span>
  <label class="field">From<input type="date" bind:value={f} /></label>
  <label class="field">To<input type="date" bind:value={t} /></label>
  <button class="btn-secondary" type="button" onclick={apply}>{applyLabel}</button>
</div>

<style>
  .quick-picks { display: flex; gap: 6px; flex-wrap: wrap; }
  .quick-picks .btn-secondary { padding: 7px 11px; font-size: 12px; border-radius: 999px; }
  .sep { width: 1px; height: 26px; background: var(--border); align-self: flex-end; margin: 0 2px 5px; }
</style>
