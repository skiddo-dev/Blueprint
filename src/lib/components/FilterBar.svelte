<script lang="ts">
  // The board's filter bar: free text + assignee/store (multi) + due/quote/
  // source (single) dropdowns, with one Clear-all. Pure UI — the matching rules
  // live in $lib/boardFilters and the parent owns the state.
  import Icon from './Icon.svelte'
  import type { BoardFilters } from '$lib/boardFilters'
  import { activeFilterCount, anyFilterActive, defaultFilters } from '$lib/boardFilters'

  let {
    filters = $bindable(),
    showArchived = $bindable(false),
    assigneeOptions = [],
    storeOptions = [],
    matchCount,
  }: {
    filters: BoardFilters
    /** Swap the board to the archive (auto-archived Done/Cancelled cards). */
    showArchived?: boolean
    assigneeOptions?: string[]
    storeOptions?: string[]
    /** Tasks visible under the current view + filters (for the result ribbon). */
    matchCount: number
  } = $props()

  type Menu = 'assignee' | 'store' | 'due' | 'quote' | 'source'
  let openMenu = $state<Menu | null>(null)
  const toggleMenu = (m: Menu) => { openMenu = openMenu === m ? null : m }

  // Close any open dropdown when clicking outside the bar.
  function onWindowPointerDown(e: PointerEvent) {
    if (!(e.target as Element | null)?.closest?.('.filter-bar')) openMenu = null
  }

  const toggleIn = (list: string[], v: string): string[] =>
    list.includes(v) ? list.filter(x => x !== v) : [...list, v]

  const DUE_OPTIONS = [
    { value: 'any', label: 'Any due date' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'week', label: 'Due this week' },
    { value: 'none', label: 'No due date' },
  ] as const
  const QUOTE_OPTIONS = [
    { value: 'any', label: 'Any quote' },
    { value: 'Draft', label: 'Draft' },
    { value: 'Sent', label: 'Sent' },
    { value: 'Won', label: 'Won' },
    { value: 'Lost', label: 'Lost' },
    { value: 'none', label: 'No quote' },
  ] as const
  const SOURCE_OPTIONS = [
    { value: 'any', label: 'Any source' },
    { value: 'email', label: 'From email' },
    { value: 'manual', label: 'Manual' },
  ] as const

  let active = $derived(anyFilterActive(filters))
  let count = $derived(activeFilterCount(filters))

  const dueLabel = $derived(DUE_OPTIONS.find(o => o.value === filters.due)?.label ?? 'Due')
  const quoteLabel = $derived(QUOTE_OPTIONS.find(o => o.value === filters.quote)?.label ?? 'Quote')
  const sourceLabel = $derived(SOURCE_OPTIONS.find(o => o.value === filters.source)?.label ?? 'Source')
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="filter-bar" role="group" aria-label="Board filters">
  <input
    class="ft-text"
    type="search"
    placeholder="Filter tasks…"
    aria-label="Filter tasks by text"
    bind:value={filters.text}
  />

  <!-- Assignee (multi) -->
  <div class="ft-drop">
    <button
      type="button"
      class="ft-btn"
      class:on={filters.assignees.length > 0}
      aria-expanded={openMenu === 'assignee'}
      onclick={() => toggleMenu('assignee')}
    ><Icon name="person" size={12} /> Assignee{#if filters.assignees.length}&nbsp;· {filters.assignees.length}{/if} ▾</button>
    {#if openMenu === 'assignee'}
      <div class="ft-menu" role="listbox" aria-label="Filter by assignee">
        {#each assigneeOptions as a}
          <label class="ft-opt">
            <input
              type="checkbox"
              checked={filters.assignees.includes(a)}
              onchange={() => (filters.assignees = toggleIn(filters.assignees, a))}
            />
            {a}
          </label>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Store (multi) — only when the board has store numbers to offer -->
  {#if storeOptions.length}
    <div class="ft-drop">
      <button
        type="button"
        class="ft-btn"
        class:on={filters.stores.length > 0}
        aria-expanded={openMenu === 'store'}
        onclick={() => toggleMenu('store')}
      ><Icon name="pin" size={12} /> Store{#if filters.stores.length}&nbsp;· {filters.stores.length}{/if} ▾</button>
      {#if openMenu === 'store'}
        <div class="ft-menu" role="listbox" aria-label="Filter by store">
          {#each storeOptions as s}
            <label class="ft-opt">
              <input
                type="checkbox"
                checked={filters.stores.includes(s)}
                onchange={() => (filters.stores = toggleIn(filters.stores, s))}
              />
              #{s}
            </label>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Due (single) -->
  <div class="ft-drop">
    <button
      type="button"
      class="ft-btn"
      class:on={filters.due !== 'any'}
      aria-expanded={openMenu === 'due'}
      onclick={() => toggleMenu('due')}
    ><Icon name="calendar" size={12} /> {filters.due === 'any' ? 'Due' : dueLabel} ▾</button>
    {#if openMenu === 'due'}
      <div class="ft-menu" role="listbox" aria-label="Filter by due date">
        {#each DUE_OPTIONS as o}
          <label class="ft-opt">
            <input
              type="radio"
              name="ft-due"
              checked={filters.due === o.value}
              onchange={() => { filters.due = o.value; openMenu = null }}
            />
            {o.label}
          </label>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Quote stage (single) -->
  <div class="ft-drop">
    <button
      type="button"
      class="ft-btn"
      class:on={filters.quote !== 'any'}
      aria-expanded={openMenu === 'quote'}
      onclick={() => toggleMenu('quote')}
    ><Icon name="quote" size={12} /> {filters.quote === 'any' ? 'Quote' : quoteLabel} ▾</button>
    {#if openMenu === 'quote'}
      <div class="ft-menu" role="listbox" aria-label="Filter by quote stage">
        {#each QUOTE_OPTIONS as o}
          <label class="ft-opt">
            <input
              type="radio"
              name="ft-quote"
              checked={filters.quote === o.value}
              onchange={() => { filters.quote = o.value; openMenu = null }}
            />
            {o.label}
          </label>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Source (single) -->
  <div class="ft-drop">
    <button
      type="button"
      class="ft-btn"
      class:on={filters.source !== 'any'}
      aria-expanded={openMenu === 'source'}
      onclick={() => toggleMenu('source')}
    ><Icon name="mail" size={12} /> {filters.source === 'any' ? 'Source' : sourceLabel} ▾</button>
    {#if openMenu === 'source'}
      <div class="ft-menu" role="listbox" aria-label="Filter by source">
        {#each SOURCE_OPTIONS as o}
          <label class="ft-opt">
            <input
              type="radio"
              name="ft-source"
              checked={filters.source === o.value}
              onchange={() => { filters.source = o.value; openMenu = null }}
            />
            {o.label}
          </label>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Archive view toggle — sits with the filters but swaps the dataset. -->
  <button
    type="button"
    class="ft-btn"
    class:on={showArchived}
    aria-pressed={showArchived}
    title="Finished cards auto-archive after 30 days — view and restore them here"
    onclick={() => (showArchived = !showArchived)}
  ><Icon name="archive" size={12} /> Archived</button>

  {#if active}
    <span class="ft-result">{matchCount} match{matchCount === 1 ? '' : 'es'}</span>
    <button type="button" class="ft-clear" onclick={() => (filters = defaultFilters())}>
      <Icon name="x" size={11} /> Clear ({count})
    </button>
  {/if}
</div>

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .ft-text {
    flex: 0 1 220px;
    min-width: 140px;
    font-size: 12px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--text-body);
    outline: none;
    box-sizing: border-box;
  }
  .ft-text:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(99,102,241,0.12);
  }

  .ft-drop { position: relative; }
  .ft-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    color: var(--text-soft);
    border-radius: 999px;
    padding: 5px 11px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    min-height: 0;
    cursor: pointer;
  }
  .ft-btn:hover { border-color: var(--primary); color: var(--primary-text); }
  .ft-btn.on {
    background: var(--chip-bg);
    border-color: var(--primary);
    color: var(--primary-text);
  }

  .ft-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 40;
    min-width: 170px;
    max-height: 260px;
    overflow-y: auto;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(15, 23, 42, 0.16);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ft-opt {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-body);
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    user-select: none;
  }
  .ft-opt:hover { background: var(--primary-bg); }
  .ft-opt input {
    margin: 0;
    accent-color: var(--primary);
    width: 14px;
    height: 14px;
  }

  .ft-result { font-size: 12px; color: var(--text-muted); font-weight: 600; margin-left: 2px; }
  .ft-clear {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: 999px;
    padding: 5px 11px;
    font-size: 12px;
    font-weight: 600;
    min-height: 0;
    cursor: pointer;
  }
  .ft-clear:hover { border-color: var(--danger-border); color: var(--danger); }

  @media (max-width: 768px) {
    /* Finger-sized controls; 16px input so iOS doesn't zoom on focus. */
    .ft-text { font-size: 16px; min-height: 40px; flex-basis: 100%; }
    .ft-btn, .ft-clear { padding: 8px 13px; min-height: 38px; }
    .ft-opt { padding: 9px 10px; font-size: 14px; }
  }
</style>
