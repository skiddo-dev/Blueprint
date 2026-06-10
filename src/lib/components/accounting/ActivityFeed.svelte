<script lang="ts">
  // Compact audit-event list for document detail pages (invoice/bill) — the
  // full filterable log lives at /accounting/audit.
  export interface FeedEvent { _id: string; at: string; actor: string; action: string; summary: string }
  let { events }: { events: FeedEvent[] } = $props()
  const when = (iso: string) => iso.slice(0, 16).replace('T', ' ')
</script>

{#if events.length === 0}
  <p class="empty">No recorded activity yet.</p>
{:else}
  <ul class="feed">
    {#each events as e (e._id)}
      <li>
        <span class="when">{when(e.at)}</span>
        <span class="chip">{e.action}</span>
        <span class="what">{e.summary}</span>
        <span class="who">{e.actor}</span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .feed { list-style: none; margin: 0; padding: 0; }
  .feed li {
    display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap;
    padding: 7px 0; border-bottom: 1px solid var(--border-soft); font-size: 13px;
  }
  .feed li:last-child { border-bottom: none; }
  .when { font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: var(--text-muted); white-space: nowrap; }
  .chip {
    font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px;
    background: var(--surface-2, rgba(127,127,127,0.12)); color: var(--text-body); white-space: nowrap;
  }
  .what { color: var(--text-body); flex: 1; min-width: 200px; }
  .who { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
  .empty { color: var(--text-muted); font-size: 13px; }
</style>
