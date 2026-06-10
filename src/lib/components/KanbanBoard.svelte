<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { page } from '$app/state'
  import KanbanColumn from './KanbanColumn.svelte'
  import NewTaskModal from './NewTaskModal.svelte'
  import CardDetailSheet from './CardDetailSheet.svelte'
  import FilterBar from './FilterBar.svelte'
  import type { Task, TaskStatus, AppSession } from '$lib/types'
  import { KANBAN_STATUSES, STATUS_META, SUPERVISORS } from '$lib/constants'
  import { defaultFilters, taskMatchesFilters, taskStores, anyFilterActive } from '$lib/boardFilters'
  import { parseMentions } from '$lib/mentions'
  import { toggleReactor } from '$lib/reactions'
  import { isOwnedBy } from '$lib/ownership'
  import { statusOnAssign } from '$lib/taskRules'

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
  // Who can be @mentioned in a comment — the same roster, minus the pseudo-name.
  // De-duped: a PM provisioned in the DB can also appear in the static SUPERVISORS
  // list, which would otherwise show the same name twice in the autocomplete.
  const mentionCandidates = $derived([...new Set(assignees.filter(a => a !== 'Unassigned'))])

  // ── Main state: tasks grouped by status ─────────────────────────────
  function group(tasks: Task[]): Record<TaskStatus, Task[]> {
    return Object.fromEntries(
      KANBAN_STATUSES.map(s => [s, tasks.filter(t => t.status === s)])
    ) as Record<TaskStatus, Task[]>
  }

  // initialTasks is server-loaded data — initialize once, then manage locally
  // svelte-ignore state_referenced_locally
  let columns = $state(group(initialTasks as Task[]))
  let showNewTask = $state(false)
  let syncing = $state(false)
  let syncMessage = $state('')
  let currentSig = $state('')
  let dragging = $state(false)

  // Which column is visible on mobile (phones show one status at a time via the
  // pill switcher below; desktop shows them all side by side).
  let activeStatus = $state<TaskStatus>('To Do')

  // ── Detail sheet ─────────────────────────────────────────────────────
  // Which card's sheet is open. The sheet reads the LIVE task from `columns`
  // (not a snapshot) so poll updates and optimistic edits flow straight in;
  // if the task vanishes (deleted here or elsewhere), the sheet closes itself
  // by virtue of openTask going null.
  let openTaskId = $state<string | null>(null)
  let openTask = $derived(
    openTaskId
      ? KANBAN_STATUSES.flatMap(s => columns[s]).find(t => t._id === openTaskId) ?? null
      : null,
  )

  // ── Filters ──────────────────────────────────────────────────────────
  // One composable filter state (assignees / stores / due / quote / source /
  // text — see $lib/boardFilters) drives the FilterBar, per-column CSS hiding,
  // and the pill counts. Tapping a #store tag on a card toggles that store in
  // the store filter. Remembered per browser, like the view toggle.
  let filters = $state(defaultFilters())
  let filtersLoaded = $state(false) // don't persist until the saved set is restored
  function toggleStore(n: string) {
    filters.stores = filters.stores.includes(n)
      ? filters.stores.filter(s => s !== n)
      : [...filters.stores, n]
  }
  $effect(() => {
    const json = JSON.stringify(filters) // deep read — tracks every filter field
    if (!filtersLoaded) return
    try { localStorage.setItem('blueprint:boardFilters', json) } catch { /* ignore */ }
  })
  // Filter-bar options reflect what's actually on the board.
  let storeOptions = $derived(
    [...new Set(KANBAN_STATUSES.flatMap(s => columns[s].flatMap(taskStores)))].sort(),
  )

  // ── "My Work" view (default) ─────────────────────────────────────────
  // Each user lands on just their assigned tasks (the board-of-everything is a
  // manager view); a toggle flips to all. Remembered per browser. Composes with
  // the store filter.
  let view = $state<'mine' | 'all'>('mine')
  function setView(v: 'mine' | 'all') {
    view = v
    try { localStorage.setItem('blueprint:boardView', v) } catch { /* ignore */ }
  }

  // Card density: compact summary faces (the V2 default — click opens the
  // detail sheet) or the classic detailed faces with inline editing and the
  // tool-chip panels right on the card. Remembered per browser.
  let cardView = $state<'compact' | 'detailed'>('compact')
  function setCardView(v: 'compact' | 'detailed') {
    cardView = v
    try { localStorage.setItem('blueprint:cardView', v) } catch { /* ignore */ }
  }

  // Deep-link from global search: `/?task=<id>` reveals + flashes that card and
  // opens its detail sheet. Show All Tasks, clear the store filter, switch to
  // the card's column (mobile), then scroll it into view and pulse a highlight
  // ring. Re-runs whenever the URL's `task` param changes (works even when
  // already on the board).
  $effect(() => {
    const id = page.url.searchParams.get('task')
    if (!id) return
    setView('all')
    filters = defaultFilters()
    for (const s of KANBAN_STATUSES) {
      if (columns[s].some(t => t._id === id)) { activeStatus = s; openTaskId = id; break }
    }
    tick().then(() => {
      const el = document.getElementById('task-' + id)
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.add('search-flash')
      setTimeout(() => el.classList.remove('search-flash'), 2500)
    })
  })
  const viewMine = $derived(view === 'mine')
  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase()
  const today = new Date().toISOString().slice(0, 10)
  // "Mine" is keyed on identity (login email), with a display-name fallback for
  // un-backfilled tasks — same rule the server uses (see $lib/ownership). Must
  // NOT match on assigned_to === displayName alone: assigned_to holds the
  // dropdown name, which differs from the Entra displayName, so that emptied out
  // every user's "My Work".
  const isMine = (t: Task) => isOwnedBy(t, { email: myEmail, name: userName })
  const isOverdue = (t: Task) =>
    !!t.date && t.date < today && t.status !== 'Done' && t.status !== 'Cancelled'
  // Which tasks the current view shows (before the filters).
  const inView = (t: Task) =>
    view === 'all' ? true : isMine(t)
  // Visible under the current view + filters — used for the column-nav pill
  // counts and the filter bar's match ribbon so they reflect what's shown.
  const matchesView = (t: Task) =>
    inView(t) && taskMatchesFilters(t, filters, today)
  let matchCount = $derived(
    KANBAN_STATUSES.reduce((n, s) => n + columns[s].filter(matchesView).length, 0),
  )
  let myOverdue = $derived(
    KANBAN_STATUSES.reduce((n, s) => n + columns[s].filter(t => isMine(t) && isOverdue(t)).length, 0),
  )
  let myTotal = $derived(KANBAN_STATUSES.reduce((n, s) => n + columns[s].filter(isMine).length, 0))

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

  // Browser-only connectivity listeners. Use $effect, NOT onMount/onDestroy:
  // onDestroy runs on the server during SSR too, so a `window.removeEventListener`
  // there throws `window is not defined` and 500s the page. $effect never runs
  // during SSR, and its teardown runs on the client.
  $effect(() => {
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  })

  onMount(async () => {
    const savedView = localStorage.getItem('blueprint:boardView')
    if (savedView === 'mine' || savedView === 'all') view = savedView
    const savedCardView = localStorage.getItem('blueprint:cardView')
    if (savedCardView === 'compact' || savedCardView === 'detailed') cardView = savedCardView
    // Restore the saved filters, tolerating older/garbled shapes (merge over
    // defaults so a missing field never leaves the UI half-initialized).
    try {
      const saved = localStorage.getItem('blueprint:boardFilters')
      if (saved) filters = { ...defaultFilters(), ...JSON.parse(saved) }
    } catch { /* ignore */ }
    filtersLoaded = true
    online = navigator.onLine
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
  })

  // ── Drag-and-drop handlers ───────────────────────────────────────────
  // Persist a drag drop — target column + the card's fractional rank between
  // its new neighbours (computed by KanbanColumn) — in one write. The board's
  // `columns` state is updated directly by the column via `bind:items`, so we
  // only handle the server write here.
  async function handleMoved(status: TaskStatus, taskId: string, rank: string) {
    await persist(fetch(`/api/tasks/${taskId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, rank }),
    }))
  }

  // ── Inline field update (optimistic) ────────────────────────────────
  async function handleFieldUpdate(id: string, field: string, value: unknown) {
    for (const s of KANBAN_STATUSES) {
      const idx = columns[s].findIndex(t => t._id === id)
      if (idx !== -1) {
        const updated = { ...columns[s][idx], [field]: value }
        // Mirror the server rule: assigning a real person to a "To Do" task starts
        // it. Sync the optimistic card so its status select flips immediately (the
        // column move follows on the next poll, like any inline status change).
        if (field === 'assigned_to') {
          const next = statusOnAssign(columns[s][idx].status, value)
          if (next) updated.status = next
        }
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

  // Patch a single task in-place in the local columns (optimistic UI). Returns
  // false if the task isn't on the board (already removed).
  function patchLocal(id: string, patch: (t: Task) => Task): boolean {
    for (const s of KANBAN_STATUSES) {
      const idx = columns[s].findIndex(t => t._id === id)
      if (idx !== -1) {
        columns[s] = [...columns[s].slice(0, idx), patch(columns[s][idx]), ...columns[s].slice(idx + 1)]
        return true
      }
    }
    return false
  }

  // ── Comments (optimistic) ───────────────────────────────────────────────
  // Each handler mutates the card's timeline locally, then calls the server; the
  // server is authoritative (mentions, reactions) and the 2s poll reconciles.
  const myEmail = $derived((session.user.email ?? '').toLowerCase())
  const jsonReq = (url: string, method: string, body?: unknown) =>
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  async function handleComment(id: string, text: string, parentId?: string) {
    const body = text.trim()
    if (!body) return
    const entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      kind: 'comment' as const,
      text: body,
      author: userName,
      author_email: myEmail,
      mentions: parseMentions(body, mentionCandidates),
      reactions: {},
      ...(parentId ? { parent_id: parentId } : {}),
    }
    patchLocal(id, t => ({ ...t, timeline: [...(t.timeline ?? []), entry] }))
    await persist(jsonReq(`/api/tasks/${id}/comments`, 'POST', { text: body, parent_id: parentId }))
  }

  async function handleEditComment(id: string, commentId: string, text: string) {
    const body = text.trim()
    if (!body) return
    patchLocal(id, t => ({
      ...t,
      timeline: (t.timeline ?? []).map(e =>
        e.id === commentId
          ? { ...e, text: body, edited_at: new Date().toISOString(), mentions: parseMentions(body, mentionCandidates) }
          : e),
    }))
    await persist(jsonReq(`/api/tasks/${id}/comments/${commentId}`, 'PATCH', { text: body }))
  }

  async function handleDeleteComment(id: string, commentId: string) {
    patchLocal(id, t => ({
      ...t,
      timeline: (t.timeline ?? []).filter(e => e.id !== commentId && e.parent_id !== commentId),
    }))
    await persist(jsonReq(`/api/tasks/${id}/comments/${commentId}`, 'DELETE'))
  }

  async function handleReact(id: string, commentId: string, emoji: string) {
    patchLocal(id, t => ({
      ...t,
      timeline: (t.timeline ?? []).map(e =>
        e.id === commentId ? { ...e, reactions: toggleReactor(e.reactions, emoji, userName) } : e),
    }))
    await persist(jsonReq(`/api/tasks/${id}/comments/${commentId}/react`, 'POST', { emoji }))
  }

  // ── Attachments ─────────────────────────────────────────────────────────
  // Upload posts multipart/form-data; the server returns the stored metadata,
  // which we splice into the card so the new file shows without waiting for the
  // 2s poll. A failure is surfaced via the same offline toast as other writes
  // (custom here rather than persist(): we need the parsed response to patch).
  async function handleUploadAttachment(id: string, file: File) {
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await fetch(`/api/tasks/${id}/attachments`, { method: 'POST', body: fd })
      if (!r.ok) throw new Error(`upload ${r.status}`)
      const { attachment } = await r.json()
      patchLocal(id, t => ({
        ...t,
        attachment_ids: [...(t.attachment_ids ?? []), attachment.id],
        attachments: [...(t.attachments ?? []), attachment],
      }))
      online = true
    } catch {
      online = false
      saveToast = '⚠️ Couldn’t upload that file — check your connection and try again.'
      clearTimeout(saveToastTimer)
      saveToastTimer = setTimeout(() => (saveToast = ''), 5000)
    }
  }

  async function handleDeleteAttachment(id: string, attId: string) {
    patchLocal(id, t => ({
      ...t,
      attachment_ids: (t.attachment_ids ?? []).filter(a => a !== attId),
      attachments: (t.attachments ?? []).filter(a => a.id !== attId),
    }))
    await persist(fetch(`/api/tasks/${id}/attachments/${attId}`, { method: 'DELETE' }))
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

{#if openTask}
  <CardDetailSheet
    task={openTask}
    {assignees}
    {mentionCandidates}
    currentUserName={userName}
    currentUserEmail={myEmail}
    isAdmin={role === 'admin'}
    onClose={() => (openTaskId = null)}
    onFieldUpdate={handleFieldUpdate}
    onDelete={handleDelete}
    onStoreFilter={toggleStore}
    onComment={handleComment}
    onEditComment={handleEditComment}
    onDeleteComment={handleDeleteComment}
    onReact={handleReact}
    onUploadAttachment={handleUploadAttachment}
    onDeleteAttachment={handleDeleteAttachment}
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
        title="Flagged email syncs automatically — tap to pull it in right now"
      >
        {syncing ? '⏳ Refreshing…' : '🔄 Refresh now'}
      </button>
    {/if}
    <button class="primary" onclick={() => { showNewTask = true }}>✏️ New Task</button>
  </div>
</div>

{#if syncMessage}
  <div class="sync-toast">{syncMessage}</div>
{/if}

{#if total === 0}
  <!-- First-run / fully-empty board: explain where cards come from instead of
       showing six empty columns, and point to the first actions + the guide. -->
  <div class="board-empty">
    <div class="be-icon" aria-hidden="true">🗂️</div>
    <h2>No tasks yet</h2>
    <p>Flagged vendor emails sync in automatically and land here as cards — or add the first one yourself.</p>
    <div class="be-actions">
      <button class="primary" onclick={() => { showNewTask = true }}>✏️ New Task</button>
      {#if role === 'admin'}
        <button class="secondary" onclick={syncEmails} disabled={syncing}>
          {syncing ? '⏳ Refreshing…' : '🔄 Refresh now'}
        </button>
      {/if}
    </div>
    <a
      class="be-help"
      href={role === 'admin' ? '/guides/admin-user-guide.pdf' : '/guides/pm-user-guide.pdf'}
      target="_blank"
      rel="noopener"
    >
      📖 Read the {role === 'admin' ? 'admin' : 'PM'} guide
    </a>
  </div>
{:else}
<div class="toggles-row">
  <div class="view-toggle" role="group" aria-label="Board view">
    <button class="vt-btn" class:active={view === 'mine'} aria-pressed={view === 'mine'} onclick={() => setView('mine')}>
      🙋 My Work
      {#if myOverdue > 0}<span class="vt-overdue">{myOverdue} overdue</span>{/if}
    </button>
    <button class="vt-btn" class:active={view === 'all'} aria-pressed={view === 'all'} onclick={() => setView('all')}>
      📋 All Tasks
    </button>
  </div>
  <div class="view-toggle" role="group" aria-label="Card density">
    <button class="vt-btn" class:active={cardView === 'compact'} aria-pressed={cardView === 'compact'} title="Compact cards — click a card for details" onclick={() => setCardView('compact')}>
      ▦ Compact
    </button>
    <button class="vt-btn" class:active={cardView === 'detailed'} aria-pressed={cardView === 'detailed'} title="Detailed cards — edit everything inline" onclick={() => setCardView('detailed')}>
      ▤ Detailed
    </button>
  </div>
</div>

<FilterBar
  bind:filters
  assigneeOptions={assignees}
  {storeOptions}
  {matchCount}
/>

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
        <span class="tab-count">{columns[status].filter(matchesView).length}</span>
      </button>
    {/each}
  </nav>
</div>

{#if viewMine && myTotal === 0 && !anyFilterActive(filters)}
  <div class="mywork-empty">
    Nothing’s assigned to you right now.
    <button class="link-btn" onclick={() => setView('all')}>Show all tasks →</button>
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
        currentUserEmail={myEmail}
        {filters}
        {view}
        myName={userName}
        isAdmin={role === 'admin'}
        {cardView}
        {assignees}
        {mentionCandidates}
        currentUserName={userName}
        onMoved={handleMoved}
        onDragStateChange={(d) => (dragging = d)}
        onStoreFilter={toggleStore}
        onOpen={(id) => (openTaskId = id)}
        onFieldUpdate={handleFieldUpdate}
        onDelete={handleDelete}
        onComment={handleComment}
        onEditComment={handleEditComment}
        onDeleteComment={handleDeleteComment}
        onReact={handleReact}
        onUploadAttachment={handleUploadAttachment}
        onDeleteAttachment={handleDeleteAttachment}
      />
    </div>
  {/each}
</div>
{/if}

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
    color: var(--text);
    letter-spacing: -0.02em;
  }
  .board-sub {
    font-size: 12px;
    color: var(--text-faint);
    margin-top: 2px;
  }
  .toolbar-right {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  /* Segmented toggles (My Work / All + card density), side by side. */
  .toggles-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .view-toggle {
    display: inline-flex;
    gap: 2px;
    background: var(--primary-bg);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 2px;
  }
  .vt-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: var(--text-soft);
    font-size: 13px;
    font-weight: 600;
    border-radius: 7px;
    padding: 6px 12px;
  }
  .vt-btn.active {
    background: var(--card-bg);
    color: var(--primary-dark);
    box-shadow: var(--shadow);
  }
  .vt-overdue {
    background: #fee2e2;
    color: #b91c1c;
    border-radius: 999px;
    padding: 1px 7px;
    font-size: 11px;
    font-weight: 700;
  }
  .mywork-empty {
    background: var(--bg);
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 10px;
  }
  .link-btn {
    background: none;
    border: none;
    color: var(--primary-dark);
    font-weight: 600;
    font-size: 13px;
    padding: 0 2px;
    text-decoration: underline;
  }

  /* First-run empty board (no tasks at all). */
  .board-empty {
    text-align: center;
    max-width: 460px;
    margin: 8vh auto 0;
    padding: 32px 24px;
    background: var(--card-bg);
    border: 1px dashed var(--border);
    border-radius: 16px;
  }
  .be-icon { font-size: 40px; margin-bottom: 8px; }
  .board-empty h2 { font-size: 18px; font-weight: 700; color: var(--text); margin: 0 0 8px; }
  .board-empty p { font-size: 14px; color: var(--text-muted); line-height: 1.5; margin: 0 0 18px; }
  .be-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px; }
  .be-help { font-size: 13px; font-weight: 600; color: var(--primary-dark); text-decoration: none; }
  .be-help:hover { text-decoration: underline; }

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
      gap: 4px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .col-tabs::-webkit-scrollbar { display: none; }

    .col-tab {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text-soft);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .col-tab.active {
      color: var(--tab-color);
      border-color: var(--tab-color);
      box-shadow: inset 0 0 0 1px var(--tab-color);
    }
    .tab-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .tab-count {
      background: var(--border-soft);
      color: var(--text-muted);
      border-radius: 999px;
      padding: 0 6px;
      font-size: 10px;
      font-weight: 700;
      min-width: 16px;
      text-align: center;
    }
    .col-tab.active .tab-count { background: var(--tab-color); color: #fff; }
  }
</style>
