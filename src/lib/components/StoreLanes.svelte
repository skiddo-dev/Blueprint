<script lang="ts">
  // The "group by store" lens: one collapsible lane per store number, each
  // crossing the status columns (only the non-empty ones — a 6-wide grid per
  // lane would be mostly air). A review surface, not an editing layout: drag is
  // off here by design (svelte-dnd-action zones per lane×status would multiply
  // fast); cards still open the detail sheet, and multi-select still works.
  // A card tagged with two stores appears in both lanes — it IS both stores'
  // work. Cards with no store gather in a trailing "No store" lane.
  import Icon from './Icon.svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import TaskCard from './TaskCard.svelte'
  import type { Task } from '$lib/types'
  import { KANBAN_STATUSES, STATUS_META } from '$lib/constants'
  import { taskStores } from '$lib/boardFilters'

  let {
    tasks,
    isAdmin = false,
    selectedIds,
    onOpen,
    onToggleSelect,
    onStoreFilter,
  }: {
    /** The board's visible tasks (post view + filters). */
    tasks: Task[]
    isAdmin?: boolean
    selectedIds?: ReadonlySet<string>
    onOpen: (id: string) => void
    onToggleSelect?: (id: string) => void
    onStoreFilter?: (n: string) => void
  } = $props()

  const NO_STORE = '__none__'

  let lanes = $derived.by(() => {
    const by = new Map<string, Task[]>()
    for (const t of tasks) {
      const stores = taskStores(t)
      for (const s of stores.length ? stores : [NO_STORE]) {
        const list = by.get(s) ?? []
        list.push(t)
        by.set(s, list)
      }
    }
    // Stores sorted numerically-ish; the no-store lane always trails.
    return [...by.entries()].sort(([a], [b]) =>
      a === NO_STORE ? 1 : b === NO_STORE ? -1 : a.localeCompare(b, 'en', { numeric: true }))
  })

  // Collapsed lanes — session-local; a lens is a way of looking, not a layout
  // worth persisting.
  let collapsed = new SvelteSet<string>()
  const toggleLane = (s: string) => {
    if (collapsed.has(s)) collapsed.delete(s)
    else collapsed.add(s)
  }
</script>

<div class="lanes">
  {#each lanes as [store, laneTasks] (store)}
    <section class="lane">
      <button
        type="button"
        class="lane-head"
        aria-expanded={!collapsed.has(store)}
        onclick={() => toggleLane(store)}
      >
        <span class="lane-caret">{collapsed.has(store) ? '▸' : '▾'}</span>
        <span class="lane-title">
          {#if store === NO_STORE}<Icon name="tag" size={11} /> No store{:else}<Icon name="pin" size={11} /> Store #{store}{/if}
        </span>
        <span class="lane-count">{laneTasks.length} task{laneTasks.length === 1 ? '' : 's'}</span>
      </button>

      {#if !collapsed.has(store)}
        <div class="lane-cols">
          {#each KANBAN_STATUSES as status}
            {@const cards = laneTasks.filter(t => t.status === status)}
            {#if cards.length}
              {@const meta = STATUS_META[status]}
              <div class="lane-col">
                <div class="lane-col-head" style:background={meta.bg} style:border-left-color={meta.color}>
                  <span style:color={meta.text}>{meta.icon}&nbsp;{status}</span>
                  <span class="lc-count" style:background={meta.color}>{cards.length}</span>
                </div>
                {#each cards as task (store + ':' + task.id)}
                  <TaskCard
                    {task}
                    {isAdmin}
                    {onOpen}
                    {onStoreFilter}
                    {onToggleSelect}
                    selected={selectedIds?.has(task._id) ?? false}
                  />
                {/each}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </section>
  {/each}

  {#if !lanes.length}
    <div class="lanes-empty">Nothing to group — no tasks match the current view.</div>
  {/if}
</div>

<style>
  .lanes { display: flex; flex-direction: column; gap: 10px; }

  .lane {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 10px 12px;
  }
  .lane-head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: transparent;
    border: none;
    padding: 2px 2px 6px;
    min-height: 0;
    cursor: pointer;
    text-align: left;
  }
  .lane-caret { color: var(--text-faint); font-size: var(--font-sm); }
  .lane-title { font-size: var(--font-md); font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
  .lane-count {
    margin-left: auto;
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .lane-cols {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    align-items: flex-start;
    padding-bottom: 4px;
  }
  .lane-col {
    min-width: 240px;
    width: 240px;
    flex-shrink: 0;
  }
  .lane-col-head {
    border-radius: var(--radius-md);
    border-left: 4px solid transparent;
    padding: 6px 10px;
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--font-sm);
    font-weight: 700;
  }
  .lc-count {
    color: #fff;
    border-radius: var(--radius-pill);
    padding: 1px 8px;
    font-size: var(--font-xs);
    font-weight: 700;
  }

  .lanes-empty {
    text-align: center;
    color: var(--text-faint);
    border: 2px dashed var(--border);
    border-radius: var(--radius-lg);
    padding: 28px 16px;
    font-size: var(--font-base);
  }

  @media (max-width: 768px) {
    /* Lanes stack; inside a lane the status mini-columns stack too — a
       horizontal scroll inside a vertical scroll is misery on a phone. */
    .lane-cols { flex-direction: column; overflow-x: unset; }
    .lane-col { min-width: 100%; width: 100%; }
  }
</style>
