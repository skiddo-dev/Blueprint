<script lang="ts">
  import { dragHandleZone, TRIGGERS } from 'svelte-dnd-action'
  import TaskCard from './TaskCard.svelte'
  import TaskCardDetailed from './TaskCardDetailed.svelte'
  import type { Task, TaskStatus } from '$lib/types'
  import type { BoardFilters } from '$lib/boardFilters'
  import { defaultFilters, taskMatchesFilters, anyFilterActive } from '$lib/boardFilters'
  import { STATUS_META } from '$lib/constants'
  import { isOwnedBy } from '$lib/ownership'
  import { rankBetween } from '$lib/rank'

  // `items` is $bindable — bound to the parent's `columns[status]`. The zone
  // OWNS and updates it synchronously in consider/finalize (svelte-dnd-action's
  // requirement); the binding propagates changes to the parent for stats +
  // persistence, and external refreshes (poll/sync) flow back down. No local
  // copy + $effect (that caused snap-back); no callback round-trip (that lost
  // the card mid-drag).
  let {
    status,
    items = $bindable(),
    currentUserEmail = '',
    filters = defaultFilters(),
    view = 'mine',
    myName = '',
    isAdmin = false,
    cardView = 'compact',
    assignees = [],
    mentionCandidates = [],
    currentUserName = '',
    onMoved,
    onDragStateChange,
    onStoreFilter,
    onOpen,
    onFieldUpdate,
    onDelete,
    onComment,
    onEditComment,
    onDeleteComment,
    onReact,
    onUploadAttachment,
    onDeleteAttachment,
  }: {
    status: TaskStatus
    items: Task[]
    currentUserEmail?: string
    filters?: BoardFilters
    view?: 'mine' | 'all'
    myName?: string
    isAdmin?: boolean
    /** Card density: compact summary faces (default) or the classic
     *  everything-on-the-card detailed faces. */
    cardView?: 'compact' | 'detailed'
    assignees?: string[]
    mentionCandidates?: string[]
    currentUserName?: string
    onMoved: (status: TaskStatus, taskId: string, rank: string) => void
    onDragStateChange: (dragging: boolean) => void
    onStoreFilter?: (n: string) => void
    onOpen: (id: string) => void
    onFieldUpdate: (id: string, field: string, value: unknown) => void
    onDelete: (id: string) => void
    onComment?: (id: string, text: string, parentId?: string) => void
    onEditComment?: (id: string, commentId: string, text: string) => void
    onDeleteComment?: (id: string, commentId: string) => void
    onReact?: (id: string, commentId: string, emoji: string) => void
    onUploadAttachment?: (id: string, file: File) => Promise<void> | void
    onDeleteAttachment?: (id: string, attId: string) => void
  } = $props()

  const meta = $derived(STATUS_META[status])
  const flipDurationMs = 200

  // View (My Work / All) + filter visibility. Non-matching cards are hidden
  // via CSS (kept in the dnd `items` list so the bound array — and drag/drop —
  // stays intact).
  const today = new Date().toISOString().slice(0, 10)
  // 'mine' = owned by me, keyed on identity (email) with a display-name fallback
  // — same rule as the server and the board (see $lib/ownership). Matching on
  // assigned_to === myName alone hid every card from its own owner.
  const inView = (t: Task) =>
    view === 'all' ? true : isOwnedBy(t, { email: currentUserEmail, name: myName })
  const matches = (t: Task) =>
    inView(t) && taskMatchesFilters(t, filters, today)
  const visibleCount = $derived(items.filter(matches).length)

  function handleConsider(e: CustomEvent) {
    onDragStateChange(true)
    items = e.detail.items as Task[]
  }

  function handleFinalize(e: CustomEvent) {
    items = e.detail.items as Task[]
    onDragStateChange(false)
    if (e.detail.info.trigger === TRIGGERS.DROPPED_INTO_ZONE) {
      const id = e.detail.info.id as string
      const idx = items.findIndex(t => t.id === id)
      if (idx === -1) return
      // The card's new fractional rank sits between its drop neighbours. If
      // their ranks are inconsistent (stale/unranked docs), fall back to
      // "right after the card above" — always valid, and the next poll
      // reconciles against the server's order anyway.
      let rank: string
      try {
        rank = rankBetween(items[idx - 1]?.rank ?? null, items[idx + 1]?.rank ?? null)
      } catch {
        rank = rankBetween(items[idx - 1]?.rank ?? null, null)
      }
      // Optimistic: stamp the new rank + column on the moved card so a
      // follow-up drag computes from fresh ranks.
      items[idx] = { ...items[idx], rank, status }
      onMoved(status, id, rank)
    }
  }
</script>

<div class="column">
  <div class="col-header" style:background={meta.bg} style:border-left-color={meta.color}>
    <span class="col-title" style:color={meta.text}>
      {meta.icon}&nbsp;{status}
    </span>
    <span class="count" style:background={meta.color}>{visibleCount}</span>
  </div>

  <!-- Empty hint is an overlay OUTSIDE the dndzone: svelte-dnd-action treats
       every direct child of a zone as a draggable item. -->
  <div class="dropzone-wrap">
    <!-- A drag is initiated ONLY from the ⠿⠿ handle in each card (use:dragHandle
         in TaskCard). This keeps the whole card body tappable (it opens the
         detail sheet) and the board scrollable on touch, instead of a
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
        {#if cardView === 'detailed'}
          <TaskCardDetailed
            {task}
            {assignees}
            {mentionCandidates}
            {currentUserName}
            {currentUserEmail}
            {isAdmin}
            {onFieldUpdate}
            {onDelete}
            {onOpen}
            {onStoreFilter}
            {onComment}
            {onEditComment}
            {onDeleteComment}
            {onReact}
            {onUploadAttachment}
            {onDeleteAttachment}
            activeStores={filters.stores}
            hidden={!matches(task)}
          />
        {:else}
          <TaskCard
            {task}
            {isAdmin}
            {onOpen}
            {onStoreFilter}
            activeStores={filters.stores}
            hidden={!matches(task)}
          />
        {/if}
      {/each}
    </div>

    {#if visibleCount === 0}
      <div class="empty-zone">
        {anyFilterActive(filters)
          ? 'No matching tasks'
          : view === 'mine'
            ? 'None assigned to you'
            : 'No tasks'}
      </div>
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
    outline: 2px dashed var(--primary);
  }

  .empty-zone {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--text-faint);
    border: 2px dashed var(--border);
    border-radius: 8px;
    font-size: 12px;
    pointer-events: none;
  }

  @media (max-width: 768px) {
    .column { min-width: 100%; width: 100%; }
    /* The 60vh drop target exists so EMPTY desktop columns can catch a dragged
       card's centre. On phones only one column shows at a time and moves happen
       via the detail sheet's Status select, so that tall minimum just leaves a
       big dead gap under a short column — shrink it to hug the cards. */
    .dropzone { min-height: 96px; }
    .col-header { margin-bottom: 8px; padding: 8px 12px; }
  }
</style>
