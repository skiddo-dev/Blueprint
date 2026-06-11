<script lang="ts">
  // Clickable column header for the accounting entity lists — a real button
  // (keyboard-reachable, announces direction via aria-sort), dressed to sit
  // flush in the existing table header. Styles live in accounting.css.
  import type { TableSort } from '$lib/accounting/tableSort.svelte'

  let {
    sort,
    key,
    label,
    num = false,
  }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sort: TableSort<any>
    key: string
    label: string
    /** Right-aligned numeric column. */
    num?: boolean
  } = $props()
</script>

<th class="sortable" class:num aria-sort={sort.ariaSort(key)}>
  <button type="button" onclick={() => sort.toggle(key)}>
    {label}
    <span class="dir" aria-hidden="true">{sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
  </button>
</th>
