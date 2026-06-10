<script lang="ts">
  import Icon from './Icon.svelte'
  import { goto } from '$app/navigation'
  import { searchUI } from '$lib/search.svelte'
  import type { SearchResults, SearchHit } from '$lib/search'

  let q = $state('')
  let results = $state<SearchResults>({ tasks: [], quotes: [], prospects: [] })
  let loading = $state(false)
  let selected = $state(0)
  let inputEl = $state<HTMLInputElement>()
  let debounce: ReturnType<typeof setTimeout>
  let reqId = 0

  // Flat list (display order) for keyboard navigation.
  const flat = $derived<SearchHit[]>([...results.tasks, ...results.quotes, ...results.prospects])
  const empty = $derived(flat.length === 0)

  function close() { searchUI.open = false }

  async function run(query: string) {
    const id = ++reqId
    if (query.trim().length < 2) { results = { tasks: [], quotes: [], prospects: [] }; loading = false; return }
    loading = true
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
      if (id !== reqId) return // superseded by a newer keystroke
      results = r.ok ? await r.json() : { tasks: [], quotes: [], prospects: [] }
    } catch {
      if (id === reqId) results = { tasks: [], quotes: [], prospects: [] }
    } finally {
      if (id === reqId) { loading = false; selected = 0 }
    }
  }

  function onInput() {
    clearTimeout(debounce)
    debounce = setTimeout(() => run(q), 200)
  }

  function openHit(hit?: SearchHit) {
    if (!hit) return
    close()
    goto(hit.href)
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      searchUI.open = !searchUI.open
      return
    }
    if (!searchUI.open) return
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, flat.length - 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0) }
    else if (e.key === 'Enter') { e.preventDefault(); openHit(flat[selected]) }
  }

  // On open: reset + focus the input.
  $effect(() => {
    if (searchUI.open) {
      q = ''
      results = { tasks: [], quotes: [], prospects: [] }
      selected = 0
      queueMicrotask(() => inputEl?.focus())
    }
  })
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet row(hit: SearchHit)}
  {@const idx = flat.indexOf(hit)}
  <button
    class="search-hit"
    class:active={idx === selected}
    onmouseenter={() => (selected = idx)}
    onclick={() => openHit(hit)}
  >
    <span class="hit-title">{hit.title}</span>
    {#if hit.subtitle}<span class="hit-sub">{hit.subtitle}</span>{/if}
  </button>
{/snippet}

{#if searchUI.open}
  <div class="search-backdrop" onclick={close} role="presentation"></div>
  <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search">
    <input
      bind:this={inputEl}
      class="search-input"
      type="search"
      maxlength={100}
      placeholder="Search tasks, quotes, prospects…  (store #, PO, vendor, assignee)"
      bind:value={q}
      oninput={onInput}
      aria-label="Search query"
    />
    <div class="search-results">
      {#if q.trim().length < 2}
        <div class="search-hint">Type at least 2 characters…</div>
      {:else if loading && empty}
        <div class="search-hint">Searching…</div>
      {:else if empty}
        <div class="search-hint">No matches for “{q.trim()}”.</div>
      {:else}
        {#if results.tasks.length}
          <div class="search-group"><Icon name="list" size={12} /> Tasks</div>
          {#each results.tasks as hit}{@render row(hit)}{/each}
        {/if}
        {#if results.quotes.length}
          <div class="search-group"><Icon name="quote" size={12} /> Quotes</div>
          {#each results.quotes as hit}{@render row(hit)}{/each}
        {/if}
        {#if results.prospects.length}
          <div class="search-group"><Icon name="prospects" size={12} /> Prospects</div>
          {#each results.prospects as hit}{@render row(hit)}{/each}
        {/if}
      {/if}
    </div>
    <div class="search-foot"><span>↑↓ navigate</span><span>↵ open</span><span>esc close</span></div>
  </div>
{/if}

<style>
  .search-backdrop {
    position: fixed; inset: 0; z-index: 60;
    background: var(--backdrop);
  }
  .search-modal {
    position: fixed; z-index: 61;
    top: 12vh; left: 50%; transform: translateX(-50%);
    width: min(560px, calc(100vw - 24px));
    max-height: 70vh;
    display: flex; flex-direction: column;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow-hover);
    overflow: hidden;
  }
  .search-input {
    width: 100%;
    border: none; border-bottom: 1px solid var(--border);
    border-radius: 0;
    padding: 14px 16px;
    font-size: 15px;
    background: var(--card-bg);
    color: var(--text);
    outline: none;
  }
  .search-results { overflow-y: auto; padding: 6px; }
  .search-hint { padding: 16px; font-size: 13px; color: var(--text-faint); text-align: center; }
  .search-group {
    font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--text-faint); padding: 8px 10px 4px;
  }
  .search-hit {
    width: 100%; text-align: left;
    display: flex; flex-direction: column; gap: 1px;
    background: transparent; border: none; border-radius: 8px;
    padding: 7px 10px; cursor: pointer; min-height: 0;
  }
  .search-hit.active { background: var(--primary-bg); }
  .hit-title { font-size: 13px; font-weight: 600; color: var(--text); }
  .hit-sub { font-size: 11px; color: var(--text-muted); }
  .search-foot {
    display: flex; gap: 14px; justify-content: flex-end;
    padding: 8px 12px; border-top: 1px solid var(--border-soft);
    font-size: 11px; color: var(--text-faint);
  }
</style>
