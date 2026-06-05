<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import KanbanColumn from './KanbanColumn.svelte'
  import NewTaskModal from './NewTaskModal.svelte'
  import type { Task, TaskStatus, AppSession } from '$lib/types'
  import { KANBAN_STATUSES, STATUS_META, SUPERVISORS } from '$lib/constants'
  import { extractStoreNumbers } from '$lib/storeNumbers'

  let {
    initialTasks,
    session,
    pmUsers,
    onMenu,
  }: {
    initialTasks: Task[]
    session: AppSession
    pmUsers: { name: string }[]
    onMenu?: () => void
  } = $props()

  const role = $derived(session.user.role)
  const userName = $derived(session.user.displayName)

  const pmNames = $derived(pmUsers.map(u => u.name).filter(Boolean))
  const assignees = $derived(
    role === 'admin'
      ? ['Unassigned', ...pmNames, ...SUPERVISORS]
      : ['Unassigned', ...SUPERVISORS]
  )

  // ── Main state: tasks grouped by status ─────────────────────────────
  function group(tasks: Task[]): Record<TaskStatus, Task[]> {
    return Object.fromEntries(
      KANBAN_STATUSES.map(s => [s, tasks.filter(t => t.status === s)])
    ) as Record<TaskStatus, Task[]>
  }

  // initialTasks is server-loaded data — initialize once, then manage locally
  let columns = $state(group(initialTasks as Task[]))
  let showNewTask = $state(false)
  let syncing = $state(false)
  let syncMessage = $state('')
  let currentSig = $state('')
  let dragging = $state(false)

  // Which column is visible on mobile (phones show one status at a time via the
  // pill switcher below; desktop shows them all side by side).
  let activeStatus = $state<TaskStatus>('To Do')

  // Store-number filter (set by tapping a #store tag on a card; toggles off when
  // the same store is tapped again). Cards are hidden in KanbanColumn via CSS.
  let storeFilter = $state<string | null>(null)
  function setStoreFilter(n: string) {
    storeFilter = storeFilter === n ? null : n
  }
  const taskStores = (t: Task) => t.store_numbers ?? extractStoreNumbers(t.title)
  let filterCount = $derived(
    storeFilter
      ? KANBAN_STATUSES.reduce((acc, s) => acc + columns[s].filter(t => taskStores(t).includes(storeFilter!)).length, 0)
      : 0,
  )

  // ── Connectivity + real-time polling (2 s) ───────────────────────────
  // The 2s poll doubles as a connectivity heartbeat: a failed fetch flags the
  // board offline, a successful one clears it. Window online/offline events add
  // instant feedback and refetch on reconnect.
  let online = $state(true)
  let saveToast = $state('')
  let pollTimer: ReturnType<typeof setInterval>
  let saveToastTimer: ReturnType<typeof setTimeout>

  // Fetch the latest tasks if the server signature changed. Throws on a network
  // error so callers can flag offline.
  async function refresh() {
    const r = await fetch('/api/tasks/signature')
    if (!r.ok) throw new Error(`signature ${r.status}`)
    const { sig } = await r.json()
    if (sig !== currentSig) {
      currentSig = sig
      const r2 = await fetch('/api/tasks')
      if (r2.ok) columns = group(await r2.json())
    }
  }

  const goOnline = () => { online = true; refresh().catch(() => { online = false }) }
  const goOffline = () => { online = false }

  // Persist a mutation; on failure (offline or server error) flag offline and
  // toast, so an optimistic UI change is never silently lost — the next
  // successful poll reconciles the board with the server (source of truth).
  async function persist(req: Promise<Response>) {
    try {
      const r = await req
      if (!r.ok) throw new Error(`save ${r.status}`)
      online = true
    } catch {
      online = false
      saveToast = '⚠️ Couldn’t save — you appear to be offline. The board re-syncs when you reconnect.'
      clearTimeout(saveToastTimer)
      saveToastTimer = setTimeout(() => (saveToast = ''), 5000)
    }
  }

  onMount(async () => {
    online = navigator.onLine
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    try {
      const r = await fetch('/api/tasks/signature')
      if (r.ok) currentSig = (await r.json()).sig
    } catch {
      online = false
    }
    pollTimer = setInterval(async () => {
      // Don't refetch mid-drag — replacing `columns` would yank the card out
      // from under svelte-dnd-action and snap it back.
      if (dragging) return
      try {
        await refresh()
        online = true
      } catch {
        online = false
      }
    }, 2000)
  })

  onDestroy(() => {
    clearInterval(pollTimer)
    clearTimeout(saveToastTimer)
    window.removeEventListener('online', goOnline)
    window.removeEventListener('offline', goOffline)
  })

  // ── Drag-and-drop handlers ───────────────────────────────────────────
  // Persist a card's new column after a drag drop. The board's `columns` state
  // is updated directly by the column via `bind:items`, so we only handle the
  // server write here.
  async function handleMoved(status: TaskStatus, taskId: string) {
    await persist(fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'status', value: status }),
    }))
  }

  // ── Inline field update (optimistic) ────────────────────────────────
  async function handleFieldUpdate(id: string, field: string, value: unknown) {
    for (const s of KANBAN_STATUSES) {
      const idx = columns[s].findIndex(t => t._id === id)
      if (idx !== -1) {
        const updated = { ...columns[s][idx], [field]: value }
        columns[s] = [...columns[s].slice(0, idx), updated, ...columns[s].slice(idx + 1)]
        break
      }
    }
    await persist(fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    }))
  }

  // ── Delete ────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    for (const s of KANBAN_STATUSES) {
      columns[s] = columns[s].filter(t => t._id !== id)
    }
    await persist(fetch(`/api/tasks/${id}`, { method: 'DELETE' }))
  }

  // ── Email sync (admin only) ───────────────────────────────────────────
  async function syncEmails() {
    syncing = true
    syncMessage = ''
    try {
      const r = await fetch('/api/sync', { method: 'POST' })
      const data = await r.json()
      syncMessage = data.message ?? 'Done'
      const r2 = await fetch('/api/tasks')
      if (r2.ok) columns = group(await r2.json())
    } catch (e) {
      syncMessage = `Error: ${e}`
    } finally {
      syncing = false
    }
  }

  // ── New task created ─────────────────────────────────────────────────
  function handleTaskCreated(task: Task) {
    showNewTask = false
    columns[task.status] = [task, ...columns[task.status]]
  }

  // ── Board stats ───────────────────────────────────────────────────────
  let total = $derived(KANBAN_STATUSES.reduce((n, s) => n + columns[s].length, 0))
  let done = $derived(columns['Done'].length)
  let pct = $derived(total > 0 ? Math.round(done / total * 100) : 0)
</script>

{#if showNewTask}
  <NewTaskModal
    {assignees}
    {userName}
    onCreated={handleTaskCreated}
    onClose={() => { showNewTask = false }}
  />
{/if}

{#if !online}
  <div class="offline-banner">📡 You’re offline — the board may be out of date, and changes won’t save until you reconnect.</div>
{/if}
{#if saveToast}
  <div class="save-toast">{saveToast}</div>
{/if}

<div class="board-toolbar">
  <div class="toolbar-left">
    <h1 class="board-title">🏗️ Blueprint</h1>
    <p class="board-sub">Email-to-Task Kanban · Grocery Construction</p>
  </div>
  <div class="toolbar-right">
    {#if role === 'admin'}
      <button
        class="secondary"
        onclick={syncEmails}
        disabled={syncing}
      >
        {syncing ? '⏳ Syncing…' : '🔄 Sync Emails'}
      </button>
    {/if}
    <button class="primary" onclick={() => { showNewTask = true }}>✏️ New Task</button>
  </div>
</div>

{#if syncMessage}
  <div class="sync-toast">{syncMessage}</div>
{/if}

<!-- Mobile-only top bar: a menu button (opens the sidebar drawer) + a column
     switcher. Phones stack the board to one column at a time (a 6-column
     horizontal scroll is unusable on a narrow screen), so the pills jump
     between statuses; moving a card between columns is done via the card's own
     Status dropdown. The whole bar is hidden on desktop, where the sidebar is
     always visible and all columns show side by side. -->
<div class="mobile-topbar">
  <button class="menu-btn" onclick={() => onMenu?.()} aria-label="Open menu">☰</button>
  <nav class="col-tabs" aria-label="Switch board column">
    {#each KANBAN_STATUSES as status}
      {@const m = STATUS_META[status]}
      <button
        class="col-tab"
        class:active={status === activeStatus}
        style:--tab-color={m.color}
        aria-pressed={status === activeStatus}
        onclick={() => (activeStatus = status)}
      >
        <span class="tab-dot" style:background={m.color}></span>
        {status}
        <span class="tab-count">{columns[status].length}</span>
      </button>
    {/each}
  </nav>
</div>

{#if storeFilter}
  <div class="store-filter-bar">
    <span class="sf-label">📍 Store <strong>#{storeFilter}</strong> · {filterCount} task{filterCount === 1 ? '' : 's'}</span>
    <button class="sf-clear" onclick={() => (storeFilter = null)}>✕ Clear filter</button>
  </div>
{/if}

<div class="board-columns">
  {#each KANBAN_STATUSES as status}
    <!-- `display: contents` on desktop so this wrapper disappears and the inner
         .column stays the direct flex item (layout unchanged); on mobile the
         wrapper becomes the show/hide unit for the active column. -->
    <div class="col-wrap" class:active={status === activeStatus}>
      <KanbanColumn
        {status}
        bind:items={columns[status]}
        {assignees}
        {storeFilter}
        onMoved={handleMoved}
        onDragStateChange={(d) => (dragging = d)}
        onFieldUpdate={handleFieldUpdate}
        onDelete={handleDelete}
        onStoreFilter={setStoreFilter}
      />
    </div>
  {/each}
</div>

<style>
  .board-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 8px;
  }
  .board-title {
    font-size: 22px;
    font-weight: 800;
    color: #1e293b;
    letter-spacing: -0.02em;
  }
  .board-sub {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 2px;
  }
  .toolbar-right {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .sync-toast {
    background: #d1fae5;
    color: #047857;
    border: 1px solid #a7f3d0;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    margin-bottom: 10px;
  }

  .offline-banner {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 10px;
  }
  .save-toast {
    background: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    margin-bottom: 10px;
  }

  .store-filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    background: var(--primary-bg);
    border: 1px solid #c7d2fe;
    color: #3730a3;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    margin-bottom: 10px;
  }
  .sf-label strong { font-weight: 800; }
  .sf-clear {
    background: #fff;
    border: 1px solid #c7d2fe;
    color: #4338ca;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
  }
  .sf-clear:hover { background: #eef2ff; }

  .board-columns {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 12px;
    align-items: flex-start;
  }

  /* Desktop: the wrapper is layout-transparent so .column is the flex item and
     the side-by-side board is unchanged. (The mobile top bar — .mobile-topbar in
     app.css — is hidden on desktop.) */
  .col-wrap { display: contents; }

  @media (max-width: 768px) {
    .board-columns {
      flex-direction: column;
      overflow-x: unset;
      /* Override the desktop `align-items: flex-start`: in this column-direction
         layout that aligns items to the left and lets an EMPTY column shrink to
         its header width. `stretch` makes every column fill the screen width. */
      align-items: stretch;
    }

    /* Top spacing lives here, not on the .main-content scroll container, so the
       sticky bar below can pin flush to the top (notch-safe). */
    .board-toolbar {
      padding-top: max(0.5rem, env(safe-area-inset-top));
    }

    /* Show only the selected column. */
    .col-wrap { display: none; }
    .col-wrap.active { display: block; }

    /* The sticky bar container (.mobile-topbar) + menu button (.menu-btn) styles
       live in app.css so every page shares them. Here we only lay out the column
       pills inside that bar. */
    /* Pills take the remaining width and scroll horizontally under the menu. */
    .col-tabs {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      gap: 6px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .col-tabs::-webkit-scrollbar { display: none; }

    .col-tab {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #fff;
      border: 1px solid var(--border);
      color: #475569;
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
    }
    .col-tab.active {
      color: var(--tab-color);
      border-color: var(--tab-color);
      box-shadow: inset 0 0 0 1px var(--tab-color);
    }
    .tab-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .tab-count {
      background: #f1f5f9;
      color: #64748b;
      border-radius: 999px;
      padding: 0 7px;
      font-size: 11px;
      font-weight: 700;
      min-width: 18px;
      text-align: center;
    }
    .col-tab.active .tab-count { background: var(--tab-color); color: #fff; }
  }
</style>
