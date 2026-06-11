<script lang="ts">
  import Icon from './Icon.svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { searchUI } from '$lib/search.svelte'
  import { openShortcuts } from '$lib/shortcuts.svelte'
  import { setTheme } from '$lib/theme.svelte'
  import { trapFocus } from '$lib/actions/trapFocus'
  import Skeleton from './Skeleton.svelte'
  import EmptyState from './EmptyState.svelte'
  import type { IconName } from '$lib/icons'
  import type { SearchResults, SearchHit } from '$lib/search'

  let q = $state('')
  let results = $state<SearchResults>({ tasks: [], quotes: [], prospects: [] })
  let loading = $state(false)
  let selected = $state(0)
  let inputEl = $state<HTMLInputElement>()
  let debounce: ReturnType<typeof setTimeout>
  let reqId = 0

  // ── Commands ──────────────────────────────────────────────────────────
  // The palette is also the command bar: an empty query lists every command,
  // typing filters them (label + hidden keywords) alongside search results.
  type Command = { id: string; label: string; icon: IconName; keywords: string; run: () => void }

  const role = $derived(((page.data.session?.user ?? {}) as { role?: string }).role ?? 'pm')

  const commands = $derived.by<Command[]>(() => {
    const nav: Command[] = [
      { id: 'go-board', label: 'Go to Kanban Board', icon: 'board', keywords: 'home kanban tasks', run: () => goto('/') },
      ...(role === 'admin'
        ? ([
            { id: 'go-dashboard', label: 'Go to Dashboard', icon: 'dashboard', keywords: 'charts metrics insights', run: () => goto('/dashboard') },
            { id: 'go-quotes', label: 'Go to Quote Generator', icon: 'quote', keywords: 'proposal pdf pricing', run: () => goto('/quotes') },
            { id: 'go-accounting', label: 'Go to Accounting', icon: 'ledger', keywords: 'books invoices bills journal', run: () => goto('/accounting') },
            { id: 'go-infra', label: 'Go to Infra Spend', icon: 'spend', keywords: 'billing azure atlas openai costs', run: () => goto('/infra') },
            { id: 'go-prospects', label: 'Go to Prospects', icon: 'prospects', keywords: 'warehouses leads map', run: () => goto('/prospects') },
            { id: 'go-landscape', label: 'Go to Competitive Landscape', icon: 'map', keywords: 'competitors blueprint sheet', run: () => goto('/competitive-landscape') },
            { id: 'go-design', label: 'Go to Design System', icon: 'palette', keywords: 'style guide tokens', run: () => goto('/design') },
          ] satisfies Command[])
        : []),
    ]
    return [
      // The board opens its create dialog when it sees ?new=1 (works from any page).
      { id: 'new-task', label: 'New task', icon: 'pencil', keywords: 'create add card', run: () => goto('/?new=1') },
      ...nav,
      { id: 'theme-light', label: 'Theme: Light', icon: 'sun', keywords: 'appearance day', run: () => setTheme('light') },
      { id: 'theme-dark', label: 'Theme: Dark', icon: 'moon', keywords: 'appearance night', run: () => setTheme('dark') },
      { id: 'theme-system', label: 'Theme: System', icon: 'monitor', keywords: 'appearance auto os', run: () => setTheme('system') },
      {
        id: 'help-guide', label: 'Open the user guide', icon: 'guide', keywords: 'help docs manual',
        run: () => window.open(role === 'admin' ? '/guides/admin-user-guide.pdf' : '/guides/pm-user-guide.pdf', '_blank', 'noopener'),
      },
      { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'checklist', keywords: 'keys hotkeys', run: openShortcuts },
    ]
  })

  const cmdMatches = $derived.by(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter(c => `${c.label} ${c.keywords}`.toLowerCase().includes(needle))
  })

  // Flat display order for keyboard navigation: search hits first, then commands.
  const flat = $derived<SearchHit[]>([...results.tasks, ...results.quotes, ...results.prospects])
  const total = $derived(flat.length + cmdMatches.length)
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
    selected = 0
    clearTimeout(debounce)
    debounce = setTimeout(() => run(q), 200)
  }

  function openHit(hit?: SearchHit) {
    if (!hit) return
    close()
    goto(hit.href)
  }

  function runCommand(cmd?: Command) {
    if (!cmd) return
    close()
    cmd.run()
  }

  function activate(idx: number) {
    if (idx < flat.length) openHit(flat[idx])
    else runCommand(cmdMatches[idx - flat.length])
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      searchUI.open = !searchUI.open
      return
    }
    if (!searchUI.open) return
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, total - 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0) }
    else if (e.key === 'Enter') { e.preventDefault(); activate(selected) }
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
  <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search and commands" use:trapFocus>
    <input
      bind:this={inputEl}
      class="search-input"
      type="search"
      maxlength={100}
      placeholder="Search or run a command…  (store #, PO, vendor, assignee)"
      bind:value={q}
      oninput={onInput}
      aria-label="Search query"
    />
    <div class="search-results">
      {#if loading && empty && cmdMatches.length === 0}
        <!-- Result-row-shaped placeholders, so the list doesn't jump on arrival. -->
        {#each { length: 3 } as _, i (i)}
          <div class="skel-row">
            <Skeleton height="13px" width="62%" />
            <Skeleton height="10px" width="38%" />
          </div>
        {/each}
      {:else if empty && cmdMatches.length === 0}
        <EmptyState icon="search" title="No matches" size="sm" framed={false}>
          Nothing found for “{q.trim()}” — try a store #, PO, vendor, or assignee.
        </EmptyState>
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
        {#if cmdMatches.length}
          <div class="search-group"><Icon name="spark" size={12} /> Commands</div>
          {#each cmdMatches as cmd, i (cmd.id)}
            {@const idx = flat.length + i}
            <button
              class="search-hit cmd"
              class:active={idx === selected}
              onmouseenter={() => (selected = idx)}
              onclick={() => runCommand(cmd)}
            >
              <span class="cmd-icon"><Icon name={cmd.icon} size={14} /></span>
              <span class="hit-title">{cmd.label}</span>
            </button>
          {/each}
        {/if}
      {/if}
    </div>
    <div class="search-foot"><span>↑↓ navigate</span><span>↵ open</span><span>esc close</span></div>
  </div>
{/if}

<style>
  .search-backdrop {
    position: fixed; inset: 0; z-index: calc(var(--z-sheet) - 1);
    background: var(--backdrop);
  }
  .search-modal {
    position: fixed; z-index: var(--z-sheet);
    top: 12vh; left: 50%; transform: translateX(-50%);
    width: min(560px, calc(100vw - 24px));
    max-height: 70vh;
    display: flex; flex-direction: column;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-hover);
    overflow: hidden;
  }
  .search-input {
    width: 100%;
    border: none; border-bottom: 1px solid var(--border);
    border-radius: 0;
    padding: 14px 16px;
    font-size: var(--font-lg);
    background: var(--card-bg);
    color: var(--text);
    outline: none;
  }
  .search-results { overflow-y: auto; padding: 6px; }
  .skel-row { display: flex; flex-direction: column; gap: 6px; padding: 9px 10px; }
  .search-group {
    font-size: var(--font-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--text-faint); padding: 8px 10px 4px;
  }
  .search-hit {
    width: 100%; text-align: left;
    display: flex; flex-direction: column; gap: 1px;
    background: transparent; border: none; border-radius: var(--radius-md);
    padding: 7px 10px; cursor: pointer; min-height: 0;
  }
  .search-hit.active { background: var(--primary-bg); }
  .search-hit.cmd { flex-direction: row; align-items: center; gap: 8px; }
  .cmd-icon { display: inline-flex; color: var(--text-soft); }
  .hit-title { font-size: var(--font-base); font-weight: 600; color: var(--text); }
  .hit-sub { font-size: var(--font-xs); color: var(--text-muted); }
  .search-foot {
    display: flex; gap: 14px; justify-content: flex-end;
    padding: 8px 12px; border-top: 1px solid var(--border-soft);
    font-size: var(--font-xs); color: var(--text-faint);
  }
</style>
