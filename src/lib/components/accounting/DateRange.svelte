<script lang="ts">
  import { goto } from '$app/navigation'
  // From/To + Apply control shared by the report pages (income statement, balance
  // sheet, cash flow). Navigates to `${base}?from=&to=` so the server load re-runs.
  // Relies on the shared `.acct .toolbar/.field/.btn-secondary` styles.
  let {
    from,
    to,
    base,
    applyLabel = 'Apply',
  }: {
    from: string
    to: string
    base: string
    applyLabel?: string
  } = $props()

  // svelte-ignore state_referenced_locally
  let f = $state(from)
  // svelte-ignore state_referenced_locally
  let t = $state(to)
  $effect(() => { f = from; t = to })

  function apply() { goto(`${base}?from=${f}&to=${t}`) }
</script>

<div class="toolbar">
  <label class="field">From<input type="date" bind:value={f} /></label>
  <label class="field">To<input type="date" bind:value={t} /></label>
  <button class="btn-secondary" type="button" onclick={apply}>{applyLabel}</button>
</div>
