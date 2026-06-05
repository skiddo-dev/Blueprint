<script lang="ts">
  import { dragHandleZone, TRIGGERS } from 'svelte-dnd-action'
  import TaskCard from './TaskCard.svelte'
  import type { Task, TaskStatus } from '$lib/types'
  import { STATUS_META } from '$lib/constants'
  import { extractStoreNumbers } from '$lib/storeNumbers'

  // `items` is $bindable — bound to the parent's `columns[status]`. The zone
  // OWNS and updates it synchronously in consider/finalize (svelte-dnd-action's
  // requirement); the binding propagates changes to the parent for stats +
  // persistence, and external refreshes (poll/sync) flow back down. No local
  // copy + $effect (that caused snap-back); no callback round-trip (that lost
  // the card mid-drag).
  let {
    status,
    items = $bindable(),
    assignees,
    storeFilter = null,
    onMoved,
    onDragStateChange,
    onFieldUpdate,
    onDelete,
    onStoreFilter,
  }: {
    status: TaskStatus
    items: Task[]
    assignees: string[]
    storeFilter?: string | null
    onMoved: (status: TaskStatus, taskId: string) => void
    onDragStateChange: (dragging: boolean) => void
    onFieldUpdate: (id: string, field: string, value: unknown) => void
    onDelete: (id: string) => void
    onStoreFilter?: (n: string) => void
  } = $props()

  const meta = $derived(STATUS_META[status])
  const flipDurationMs = 200

  // Store-filter visibility. Non-matching cards are hidden via CSS (kept in the
  // dnd `items` list so the bound array — and drag/drop — stays intact).
  const taskStores = (t: Task) => t.store_numbers ?? extractStoreNumbers(t.title)
  const matches = (t: Task) => !storeFilter || taskStores(t).includes(storeFilter)
  const visibleCount = $derived(storeFilter ? items.filter(matches).length : items.length)

  function handleConsider(e: CustomEvent) {
    onDragStateChange(true)
    items = e.detail.items as Task[]
  }

  function handleFinalize(e: CustomEvent) {
    items = e.detail.items as Task[]
    onDragStateChange(false)
    if (e.detail.info.trigger === TRIGGERS.DROPPED_INTO_ZONE) {
      onMoved(status, e.detail.info.id as string)
    }
  }
</script>

<div class="column">
  <div class="col-header" style:background={meta.bg} style:border-left-color={meta.color}>
    <span class="col-title" style:color={meta.text}>
      {meta.icon}&nbsp;{status}
    </span>
    <span class="count" style:background={meta.color}>{items.length}</span>
  </div>

  <!-- Empty hint is an overlay OUTSIDE the dndzone: svelte-dnd-action treats
       every direct child of a zone as a draggable item. -->
  <div class="dropzone-wrap">
    <!-- A drag is initiated ONLY from the ⠿⠿ handle in each card (use:dragHandle
         in TaskCard). This keeps the whole card body — quote dropdown, selects,
         notes, links — tappable and the board scrollable on touch, instead of a
         tap/scroll accidentally grabbing the card. -->
    <div
      class="dropzone"
      use:dragHandleZone={{ items, type: 'task', flipDurationMs }}
      onconsider={handleConsider}
      onfinalize={handleFinalize}
    >
      <!-- Key by `id`, NOT `_id`: svelte-dnd-action identifies items by `id`
           and gives the drag shadow a unique placeholder `id` while keeping the
           original `_id`. Keying by `_id` makes the shadow collide with the real
           card and the card disappears mid-drag. (id === String(_id).) -->
      {#each items as task (task.id)}
        <TaskCard
          {task}
          {assignees}
          {onFieldUpdate}
          {onDelete}
          {onStoreFilter}
          activeStore={storeFilter}
          hidden={!matches(task)}
        />
      {/each}
    </div>

    {#if visibleCount === 0}
      <div class="empty-zone">{storeFilter ? `No #${storeFilter} here` : 'No tasks'}</div>
    {/if}
  </div>
</div>

<style>
  .column {
    min-width: 240px;
    width: 240px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }

  .col-header {
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-left: 4px solid transparent;
  }
  .col-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .count {
    color: #fff;
    border-radius: 20px;
    padding: 2px 10px;
    font-size: 12px;
    font-weight: 700;
    min-width: 26px;
    text-align: center;
  }

  .dropzone-wrap {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .dropzone {
    flex: 1;
    /* Tall minimum so EMPTY columns are still a real drop target.
       svelte-dnd-action picks the target zone by the dragged card's CENTER;
       an 80px-tall empty zone can't contain a ~270px card's center, so drops
       into empty columns were snapping back. */
    min-height: 60vh;
    border-radius: 8px;
    padding: 4px 2px;
    outline: none;
  }
  .dropzone:focus-visible {
    outline: 2px dashed #6366f1;
  }

  .empty-zone {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #cbd5e1;
    border: 2px dashed #e2e8f0;
    border-radius: 8px;
    font-size: 12px;
    pointer-events: none;
  }

  @media (max-width: 768px) {
    .column { min-width: 100%; width: 100%; }
  }
</style>
