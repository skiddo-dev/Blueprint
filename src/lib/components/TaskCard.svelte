<script lang="ts">
  // The compact card face. A card is a scannable summary — title, store tags,
  // a clamped description, and chips for assignees / due date / quote / counts.
  // All editing moved to CardDetailSheet (opened by clicking the card); the only
  // interactive bits left on the face are the drag handle and the store tags.
  import Icon from './Icon.svelte'
  import { dragHandle } from 'svelte-dnd-action'
  import type { Task } from '$lib/types'
  import { QUOTE_STATUS_META, STATUS_META } from '$lib/constants'
  import { extractStoreNumbers } from '$lib/storeNumbers'
  import { agingLevel, daysInColumn } from '$lib/aging'

  let {
    task,
    onOpen,
    onStoreFilter,
    onNavigate,
    onToggleSelect,
    selected = false,
    activeStores = [],
    hidden = false,
    isAdmin = false,
  }: {
    task: Task
    onOpen: (id: string) => void
    onStoreFilter?: (n: string) => void
    onNavigate?: (id: string, dir: 'up' | 'down' | 'left' | 'right') => void
    onToggleSelect?: (id: string) => void
    selected?: boolean
    activeStores?: string[]
    hidden?: boolean
    isAdmin?: boolean
  } = $props()

  let meta = $derived(STATUS_META[task.status] ?? STATUS_META['To Do'])
  let storeNums = $derived(task.store_numbers ?? extractStoreNumbers(task.title))
  let qStatus = $derived(task.quote_status ?? 'Draft')
  let qMeta = $derived(QUOTE_STATUS_META[qStatus] ?? QUOTE_STATUS_META['Draft'])

  let overdue = $derived(
    !!task.date &&
    task.date < new Date().toISOString().slice(0, 10) &&
    task.status !== 'Done' &&
    task.status !== 'Cancelled',
  )
  let sourceIcon = $derived(task.exchange_id ? ('mail' as const) : ('pencil' as const))
  let source = $derived(
    task.exchange_id
      ? task.sender_name || task.sender_email || 'Email'
      : task.created_by || 'Manual'
  )

  const shortDate = (iso: string | undefined | null): string => {
    if (!iso) return ''
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
    if (Number.isNaN(d.getTime())) return ''
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
  }
  let createdShort = $derived(shortDate(task.created_at))
  let createdFull = $derived.by(() => {
    const d = new Date(task.created_at)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  })
  let dueShort = $derived(shortDate(task.date))

  // Aging: how long the card has sat in this column (active columns only).
  let aging = $derived(agingLevel(task, new Date()))
  let agedDays = $derived(daysInColumn(task, new Date()))

  let coCount = $derived((task.co_assignees ?? []).length)
  let clTotal = $derived((task.checklist ?? []).length)
  let clDone = $derived((task.checklist ?? []).filter(i => i.done).length)
  let attCount = $derived(task.attachments?.length || (task.attachment_ids ?? []).length || 0)
  let commentCount = $derived((task.timeline ?? []).filter(e => e.kind === 'comment').length)
  let hasNote = $derived(!!(task.notes ?? '').trim())
  let inbox = $derived(task.source_mailbox ? task.source_mailbox.split('@')[0] : '')

  // Open the sheet from a click or keyboard activation anywhere on the face —
  // except the drag handle and the store-tag buttons (they stopPropagation).
  // Arrow keys walk the board (handled by KanbanBoard, which knows the visible
  // order); only when the card itself is focused, so inner controls keep theirs.
  const ARROWS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  }
  function activate(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(task._id)
      return
    }
    if (onNavigate && ARROWS[e.key] && e.target === e.currentTarget) {
      e.preventDefault()
      onNavigate(task._id, ARROWS[e.key])
    }
  }
</script>

<div
  class="card"
  id="task-{task._id}"
  class:card-hidden={hidden}
  class:selected
  style:border-top="3px solid {meta.color}"
  role="button"
  tabindex="0"
  aria-label="Open task — {task.title}"
  onclick={() => onOpen(task._id)}
  onkeydown={activate}
>
  {#if onToggleSelect}
    <!-- Multi-select toggle — shown on hover/focus (always when selected). -->
    <button
      type="button"
      class="select-box"
      class:on={selected}
      role="checkbox"
      aria-checked={selected}
      aria-label="Select task — {task.title}"
      title={selected ? 'Deselect' : 'Select for bulk actions'}
      onclick={(e) => { e.stopPropagation(); onToggleSelect?.(task._id) }}
    >{#if selected}<Icon name="check" size={11} />{/if}</button>
  {/if}
  <!-- Drag handle — the ONLY element that initiates a drag, so clicking the
       rest of the card opens the sheet and the board stays scrollable on touch. -->
  <!-- The click handler only stops a handle-tap from bubbling up and opening
       the sheet; keyboard users never land here (the handle manages its own
       focus/keyboard semantics via svelte-dnd-action). -->
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="drag-hint" use:dragHandle aria-label="Drag to move this task" onclick={(e) => e.stopPropagation()}>⠿⠿</div>

  <div class="title">{task.title}</div>

  {#if storeNums.length}
    <div class="store-tags">
      {#each storeNums as n}
        <button
          type="button"
          class="store-tag"
          class:active={activeStores.includes(n)}
          onclick={(e) => { e.stopPropagation(); onStoreFilter?.(n) }}
          title="Filter the board by store #{n}"
        >#{n}</button>
      {/each}
    </div>
  {/if}

  {#if task.description}
    <p class="desc">{task.description}</p>
  {/if}

  <div class="chip-row">
    {#if task.assigned_to && task.assigned_to !== 'Unassigned'}
      <span class="chip"><Icon name="person" size={11} /> {task.assigned_to}{#if coCount} <span class="co-count" title={(task.co_assignees ?? []).join(', ')}>+{coCount}</span>{/if}</span>
    {:else}
      <span class="unassigned">Unassigned{#if coCount} <span class="co-count">+{coCount}</span>{/if}</span>
    {/if}
    {#if dueShort}
      <span class="due-chip" class:overdue title={overdue ? 'Overdue' : 'Due date'}><Icon name="calendar" size={11} /> {dueShort}</span>
    {/if}
    {#if aging !== 'none'}
      <span class="aging-chip" class:alert={aging === 'alert'} title="In {task.status} for {agedDays} days"><Icon name="hourglass" size={11} /> {agedDays}d</span>
    {/if}
    {#if task.quote}
      <span class="quote-chip" title="Quote · {qStatus}">
        <Icon name="quote" size={11} /> {task.quote}
        <span class="qs-badge" style:background={qMeta.bg} style:color={qMeta.text}>{qStatus}</span>
      </span>
    {/if}
    {#if task.po}
      <span class="po-chip"><Icon name="bill" size={11} /> {task.po}</span>
    {/if}
  </div>

  <div class="foot-row">
    <span class="source" title={isAdmin && task.source_mailbox ? `Flagged in ${task.source_mailbox}` : undefined}>
      <Icon name={sourceIcon} size={11} /> {source}{#if isAdmin && inbox}&nbsp;· <Icon name="import" size={11} /> {inbox}{/if}
    </span>
    <span class="created" title="Created {createdFull}"><Icon name="calendar" size={11} /> {createdShort}</span>
    <span class="counts">
      {#if clTotal}<span class="count" class:cl-complete={clDone === clTotal} title="Checklist — {clDone} of {clTotal} done"><Icon name="checklist" size={11} />{clDone}/{clTotal}</span>{/if}
      {#if hasNote}<span class="count" title="Has a note"><Icon name="note" size={11} /></span>{/if}
      {#if attCount}<span class="count" title="{attCount} attachment{attCount === 1 ? '' : 's'}"><Icon name="attachment" size={11} />{attCount}</span>{/if}
      {#if commentCount}<span class="count" title="{commentCount} comment{commentCount === 1 ? '' : 's'}"><Icon name="comment" size={11} />{commentCount}</span>{/if}
    </span>
  </div>
</div>

<style>
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border-card);
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 8px;
    position: relative;
    box-shadow: var(--shadow);
    transition: box-shadow 0.18s, transform 0.18s;
    cursor: pointer;
    text-align: left;
  }
  .card:hover {
    box-shadow: var(--shadow-hover);
    transform: translateY(-2px);
  }
  .card:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .card.selected {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
  }

  /* Multi-select toggle: top-right beside the drag handle (the title already
     reserves right padding), materializes on hover/focus, pinned while
     selected. Sized for touch on mobile below. */
  .select-box {
    position: absolute;
    top: 6px;
    right: 34px;
    width: 18px;
    height: 18px;
    border: 1.5px solid var(--border);
    border-radius: 5px;
    background: var(--card-bg);
    color: #fff;
    font-size: 12px;
    line-height: 1;
    padding: 0;
    min-height: 0;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s;
    z-index: 2;
  }
  .card:hover .select-box,
  .card:focus-visible .select-box,
  .select-box:focus-visible,
  .select-box.on { opacity: 1; }
  .select-box.on {
    background: var(--primary);
    border-color: var(--primary);
  }
  @media (prefers-reduced-motion: reduce) {
    .card:hover { transform: none; box-shadow: var(--shadow); }
  }

  .drag-hint {
    position: absolute;
    top: 2px;
    right: 2px;
    padding: 6px 8px;
    color: var(--text-faint);
    font-size: 15px;
    line-height: 1;
    letter-spacing: -2px;
    user-select: none;
    cursor: grab;
    /* touch starting on the handle initiates a drag instead of scrolling */
    touch-action: none;
    border-radius: 6px;
  }
  .drag-hint:active { cursor: grabbing; }

  .title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.4;
    margin-bottom: 6px;
    padding-right: 56px; /* clears the drag handle + select toggle */
  }

  .store-tags {
    margin-bottom: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .store-tag {
    background: #1e3a8a;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    font-family: inherit;
    line-height: 1.4;
    min-height: 0;          /* override the global 44px button min-height */
    cursor: pointer;
  }
  .store-tag:hover { background: #1e40af; }
  .store-tag.active {
    background: var(--primary);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.35);
  }

  /* Hidden by an active filter (kept in the DOM/dnd list, just not shown). */
  .card-hidden { display: none; }

  .desc {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 7px;
    line-height: 1.45;
    /* Two-line clamp: the full summary lives in the detail sheet. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .chip-row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    margin-bottom: 7px;
  }
  .chip {
    background: var(--chip-bg);
    color: var(--primary-text);
    border-radius: 20px;
    padding: 2px 9px;
    font-size: 11px;
    font-weight: 500;
  }
  .co-count { font-weight: 700; opacity: 0.85; }
  .unassigned { font-size: 11px; color: var(--text-faint); }
  .due-chip {
    font-size: 11px;
    color: var(--text-soft);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 2px 8px;
    white-space: nowrap;
  }
  /* Overdue: same calm rose treatment the old date input used — visible, not shouty. */
  .due-chip.overdue {
    border-color: #fecaca;
    color: #b06a72;
    background: transparent;
    font-weight: 600;
  }
  /* Aging: the card has sat in this column past the warn threshold (amber),
     then the alert threshold (rose). Same calm tone family as overdue. */
  .aging-chip {
    font-size: 11px;
    font-weight: 600;
    color: #92670e;
    background: transparent;
    border: 1px solid #fde68a;
    border-radius: 20px;
    padding: 2px 8px;
    white-space: nowrap;
  }
  .aging-chip.alert {
    color: #b06a72;
    border-color: #fecaca;
  }
  .quote-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-soft);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 2px 8px;
    white-space: nowrap;
  }
  .qs-badge {
    display: inline-block;
    border-radius: 999px;
    padding: 0 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .po-chip {
    display: inline-block;
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .foot-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .source {
    font-size: 11px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1 1 auto;
  }
  .created { font-size: 11px; color: var(--text-faint); white-space: nowrap; flex-shrink: 0; }
  .counts { display: inline-flex; gap: 5px; flex-shrink: 0; }
  .count { font-size: 11px; color: var(--text-faint); white-space: nowrap; }
  .count.cl-complete { color: #10b981; font-weight: 600; }

  @media (max-width: 768px) {
    .card:hover { transform: none; box-shadow: var(--shadow); }
    /* Finger-sized drag handle. */
    .drag-hint { padding: 11px 13px; font-size: 17px; }
    /* No hover on touch: keep the select toggle visible and finger-sized,
       clear of the enlarged drag handle. */
    .select-box { opacity: 1; width: 24px; height: 24px; font-size: 15px; right: 48px; }
  }
</style>
