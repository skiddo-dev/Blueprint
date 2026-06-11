<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import { page } from '$app/state'
  import KanbanColumn from './KanbanColumn.svelte'
  import NewTaskModal from './NewTaskModal.svelte'
  import CardDetailSheet from './CardDetailSheet.svelte'
  import FilterBar from './FilterBar.svelte'
  import StoreLanes from './StoreLanes.svelte'
  import Icon from './Icon.svelte'
  import type { Task, TaskStatus, AppSession } from '$lib/types'
  import { KANBAN_STATUSES, STATUS_META, SUPERVISORS, WIP_LIMITS } from '$lib/constants'
  import { defaultFilters, taskMatchesFilters, taskStores, anyFilterActive, activeFilterCount } from '$lib/boardFilters'
  import { remoteChangedIds } from '$lib/boardSync'
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

  // ── Multi-select + bulk actions ───────────────────────────────────────
  // Selection is a set of task ids (survives polls; ids that vanish are just
  // ignored). The bulk bar appears while anything is selected; actions go
  // through POST /api/tasks/bulk, then the board refetches.
  let selectedIds = new SvelteSet<string>()
  let bulkBusy = $state(false)
  let bulkMessage = $state('')
  function toggleSelect(id: string) {
    if (selectedIds.has(id)) selectedIds.delete(id)
    else selectedIds.add(id)
  }
  async function runBulk(action: 'status' | 'assign' | 'archive' | 'delete', value?: string) {
    if (!selectedIds.size || bulkBusy) return
    bulkBusy = true
    for (const id of selectedIds) markLocal(id)
    try {
      const r = await fetch('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds], action, ...(value ? { value } : {}) }),
      })
      if (!r.ok) throw new Error(`bulk ${r.status}`)
      const { done, skipped } = await r.json()
      bulkMessage = `✓ ${done} task${done === 1 ? '' : 's'} updated${skipped ? ` · ${skipped} skipped` : ''}`
      setTimeout(() => (bulkMessage = ''), 4000)
      selectedIds.clear()
      const r2 = await fetch(tasksUrl())
      if (r2.ok) columns = group(await r2.json())
    } catch {
      online = false
      saveToast = 'Couldn’t apply the bulk action — check your connection and try again.'
      clearTimeout(saveToastTimer)
      saveToastTimer = setTimeout(() => (saveToast = ''), 5000)
    } finally {
      bulkBusy = false
    }
  }

  // ── Quick-add ─────────────────────────────────────────────────────────
  // Inline per-column create: title only, lands at the top of that column
  // (the server ranks new cards to the top — same as the modal).
  async function handleQuickAdd(status: TaskStatus, title: string) {
    const r = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, status }),
    })
    if (!r.ok) {
      online = false
      saveToast = 'Couldn’t add that task — check your connection and try again.'
      clearTimeout(saveToastTimer)
      saveToastTimer = setTimeout(() => (saveToast = ''), 5000)
      return
    }
    const created: Task = await r.json()
    markLocal(created._id)
    columns[created.status] = [created, ...columns[created.status]]
  }

  // ── Keyboard navigation (compact faces) ───────────────────────────────
  // Arrows walk the VISIBLE cards: up/down within a column, left/right to the
  // same row in the next non-empty column. The board owns this because only it
  // knows the filtered order across columns.
  function handleNavigate(id: string, dir: 'up' | 'down' | 'left' | 'right') {
    const visible = (s: TaskStatus) => columns[s].filter(matchesView)
    const colIdx = KANBAN_STATUSES.findIndex(s => visible(s).some(t => t._id === id))
    if (colIdx === -1) return
    const inCol = visible(KANBAN_STATUSES[colIdx])
    const rowIdx = inCol.findIndex(t => t._id === id)
    let target: Task | undefined
    if (dir === 'up') target = inCol[rowIdx - 1]
    else if (dir === 'down') target = inCol[rowIdx + 1]
    else {
      const step = dir === 'left' ? -1 : 1
      for (let c = colIdx + step; c >= 0 && c < KANBAN_STATUSES.length; c += step) {
        const cands = visible(KANBAN_STATUSES[c])
        if (cands.length) {
          target = cands[Math.min(rowIdx, cands.length - 1)]
          break
        }
      }
    }
    if (target) document.getElementById('task-' + target._id)?.focus()
  }

  // ── Archived view ─────────────────────────────────────────────────────
  // Swaps the board's dataset to auto-archived (stale Done/Cancelled) cards.
  // Restoring is just a status change or a drag — the server clears
  // archived_at and the card disappears from this view on the next poll.
  let showArchived = $state(false)
  const tasksUrl = () => (showArchived ? '/api/tasks?archived=1' : '/api/tasks')
  // Refetch immediately on toggle (don't wait for a signature change).
  function setShowArchived(v: boolean) {
    showArchived = v
    fetch(tasksUrl()).then(r => (r.ok ? r.json() : null)).then(t => { if (t) columns = group(t) }).catch(() => {})
  }

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

  // Board lens: the classic status board, or lanes grouped by store — a
  // review surface for "everything happening at store #X" (drag is off in
  // lanes; cards still open the sheet). Remembered per browser.
  let lens = $state<'none' | 'store'>('none')
  function setLens(v: 'none' | 'store') {
    lens = v
    try { localStorage.setItem('blueprint:boardLens', v) } catch { /* ignore */ }
  }

  // Phones collapse the advanced controls (density + lens toggles, the filter
  // bar) behind one "View" button — V2 had stacked nine rows of chrome above
  // the first card. Desktop always shows everything (the button is hidden and
  // the wrappers render as display:contents). The badge counts every
  // non-default setting so a hidden active filter is never a mystery.
  // Open/closed is remembered per browser, like the other view toggles.
  let controlsOpen = $state(false)
  function setControlsOpen(v: boolean) {
    controlsOpen = v
    try { localStorage.setItem('blueprint:controlsOpen', v ? '1' : '0') } catch { /* ignore */ }
  }
  let viewBadge = $derived(
    activeFilterCount(filters) +
    (cardView !== 'compact' ? 1 : 0) +
    (lens !== 'none' ? 1 : 0) +
    (showArchived ? 1 : 0),
  )
  // The lens consumes the post-view+filter board flat (lanes regroup it).
  let visibleTasks = $derived(KANBAN_STATUSES.flatMap(s => columns[s].filter(matchesView)))

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

  // Which cards THIS client wrote recently — server-side changes to them within
  // the grace window are ours echoing back, not a teammate's edit to flash.
  const localEdits = new Map<string, number>()
  const markLocal = (id: string) => localEdits.set(id, Date.now())

  // Briefly tint cards another user just changed (class lives in app.css —
  // global, since it's applied to elements inside child components).
  function flashRemote(ids: string[]) {
    if (!ids.length) return
    tick().then(() => {
      for (const id of ids) {
        const el = document.getElementById('task-' + id)
        if (!el) continue
        el.classList.remove('remote-flash')
        void el.offsetWidth // restart the animation if it's still running
        el.classList.add('remote-flash')
        setTimeout(() => el.classList.remove('remote-flash'), 1800)
      }
    })
  }

  // Fetch the latest tasks if the server signature changed. Throws on a network
  // error so callers can flag offline. Cards whose updated_at moved without a
  // matching local write get the remote-change flash.
  async function refresh() {
    const r = await fetch('/api/tasks/signature')
    if (!r.ok) throw new Error(`signature ${r.status}`)
    const { sig } = await r.json()
    if (sig !== currentSig) {
      currentSig = sig
      const r2 = await fetch(tasksUrl())
      if (r2.ok) {
        const fresh: Task[] = await r2.json()
        const remote = remoteChangedIds(KANBAN_STATUSES.flatMap(s => columns[s]), fresh, localEdits, Date.now())
        columns = group(fresh)
        flashRemote(remote)
      }
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
      saveToast = 'Couldn’t save — you appear to be offline. The board re-syncs when you reconnect.'
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
    const savedLens = localStorage.getItem('blueprint:boardLens')
    if (savedLens === 'none' || savedLens === 'store') lens = savedLens
    controlsOpen = localStorage.getItem('blueprint:controlsOpen') === '1'
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
    markLocal(taskId)
    await persist(fetch(`/api/tasks/${taskId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, rank }),
    }))
  }

  // ── Inline field update (optimistic) ────────────────────────────────
  async function handleFieldUpdate(id: string, field: string, value: unknown) {
    markLocal(id)
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
    markLocal(id) // every patchLocal caller is a local write — don't flash our own echo
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

  // ── Checklist (optimistic) ──────────────────────────────────────────────
  // Add awaits the server (it generates the item id); toggle/delete mutate
  // locally first and reconcile via the poll, like comments.
  async function handleAddChecklist(id: string, text: string) {
    try {
      const r = await jsonReq(`/api/tasks/${id}/checklist`, 'POST', { text })
      if (!r.ok) throw new Error(`checklist ${r.status}`)
      const { item } = await r.json()
      patchLocal(id, t => ({ ...t, checklist: [...(t.checklist ?? []), item] }))
      online = true
    } catch {
      online = false
      saveToast = 'Couldn’t add that checklist item — check your connection and try again.'
      clearTimeout(saveToastTimer)
      saveToastTimer = setTimeout(() => (saveToast = ''), 5000)
    }
  }

  async function handleToggleChecklist(id: string, itemId: string, done: boolean) {
    patchLocal(id, t => ({
      ...t,
      checklist: (t.checklist ?? []).map(i =>
        i.id === itemId
          ? { ...i, done, done_by: done ? userName : undefined, done_at: done ? new Date().toISOString() : undefined }
          : i),
    }))
    await persist(jsonReq(`/api/tasks/${id}/checklist/${itemId}`, 'PATCH', { done }))
  }

  async function handleDeleteChecklist(id: string, itemId: string) {
    patchLocal(id, t => ({ ...t, checklist: (t.checklist ?? []).filter(i => i.id !== itemId) }))
    await persist(jsonReq(`/api/tasks/${id}/checklist/${itemId}`, 'DELETE'))
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
      saveToast = 'Couldn’t upload that file — check your connection and try again.'
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
    markLocal(id)
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
      const r2 = await fetch(tasksUrl())
      if (r2.ok) columns = group(await r2.json())
    } catch (e) {
      syncMessage = `Error: ${e}`
    } finally {
      syncing = false
    }
  }

  // ── New task created ─────────────────────────────────────────────────
  function handleTaskCreated(task: Task) {
    markLocal(task._id)
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
    onAddChecklist={handleAddChecklist}
    onToggleChecklist={handleToggleChecklist}
    onDeleteChecklist={handleDeleteChecklist}
  />
{/if}

{#if !online}
  <div class="offline-banner"><Icon name="signal" size={14} /> You’re offline — the board may be out of date, and changes won’t save until you reconnect.</div>
{/if}
{#if bulkMessage}
  <div class="sync-toast">{bulkMessage}</div>
{/if}

{#if selectedIds.size > 0}
  <!-- Bulk action bar — floats over the board while a selection exists. -->
  <div class="bulk-bar" role="toolbar" aria-label="Bulk actions">
    <span class="bb-count">{selectedIds.size} selected</span>
    <select
      class="bb-select"
      aria-label="Move selected to status"
      disabled={bulkBusy}
      onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) runBulk('status', v) }}
    >
      <option value="" selected>Move to…</option>
      {#each KANBAN_STATUSES as s}<option value={s}>{s}</option>{/each}
    </select>
    <select
      class="bb-select"
      aria-label="Assign selected to"
      disabled={bulkBusy}
      onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) runBulk('assign', v) }}
    >
      <option value="" selected>Assign to…</option>
      {#each assignees as a}<option value={a}>{a}</option>{/each}
    </select>
    {#if !showArchived}
      <button class="bb-btn" disabled={bulkBusy} onclick={() => runBulk('archive')} title="Hide these from the board (kept in the archive)"><Icon name="archive" size={12} /> Archive</button>
    {/if}
    <button class="bb-btn bb-danger" disabled={bulkBusy} onclick={() => runBulk('delete')}><Icon name="trash" size={12} /> Delete</button>
    <button class="bb-btn" disabled={bulkBusy} onclick={() => selectedIds.clear()}><Icon name="x" size={11} /> Clear</button>
  </div>
{/if}
{#if saveToast}
  <div class="save-toast"><Icon name="warning" size={13} /> {saveToast}</div>
{/if}

<div class="board-toolbar">
  <div class="toolbar-left">
    <h1 class="board-title"><Icon name="logo" size={17} /> Blueprint</h1>
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
        {#if syncing}Refreshing…{:else}<Icon name="refresh" size={13} /> Refresh now{/if}
      </button>
    {/if}
    <button class="primary" onclick={() => { showNewTask = true }}><Icon name="pencil" size={13} /> New Task</button>
  </div>
</div>

{#if syncMessage}
  <div class="sync-toast">{syncMessage}</div>
{/if}

{#if total === 0 && !showArchived}
  <!-- First-run / fully-empty board: explain where cards come from instead of
       showing six empty columns, and point to the first actions + the guide.
       (Not in the archived view — an empty archive is normal, and the banner
       above already explains the mode.) -->
  <div class="board-empty">
    <div class="be-icon" aria-hidden="true"><Icon name="board" size={40} /></div>
    <h2>No tasks yet</h2>
    <p>Flagged vendor emails sync in automatically and land here as cards — or add the first one yourself.</p>
    <div class="be-actions">
      <button class="primary" onclick={() => { showNewTask = true }}><Icon name="pencil" size={13} /> New Task</button>
      {#if role === 'admin'}
        <button class="secondary" onclick={syncEmails} disabled={syncing}>
          {#if syncing}Refreshing…{:else}<Icon name="refresh" size={13} /> Refresh now{/if}
        </button>
      {/if}
    </div>
    <a
      class="be-help"
      href={role === 'admin' ? '/guides/admin-user-guide.pdf' : '/guides/pm-user-guide.pdf'}
      target="_blank"
      rel="noopener"
    >
      <Icon name="guide" size={14} /> Read the {role === 'admin' ? 'admin' : 'PM'} guide
    </a>
  </div>
{:else}
<div class="toggles-row">
  <div class="view-toggle" role="group" aria-label="Board view">
    <button class="vt-btn" class:active={view === 'mine'} aria-pressed={view === 'mine'} onclick={() => setView('mine')}>
      <Icon name="person" size={13} /> My Work
      {#if myOverdue > 0}<span class="vt-overdue">{myOverdue} overdue</span>{/if}
    </button>
    <button class="vt-btn" class:active={view === 'all'} aria-pressed={view === 'all'} onclick={() => setView('all')}>
      <Icon name="list" size={13} /> All Tasks
    </button>
  </div>
  <!-- Mobile-only: everything below the My Work toggle folds behind this. -->
  <button
    type="button"
    class="controls-btn"
    aria-expanded={controlsOpen}
    onclick={() => setControlsOpen(!controlsOpen)}
  >
    <Icon name="sliders" size={13} /> View{#if viewBadge}<span class="cb-badge">{viewBadge}</span>{/if}
    {controlsOpen ? '▴' : '▾'}
  </button>

  <div class="adv-controls" class:open={controlsOpen}>
    <div class="view-toggle" role="group" aria-label="Card density">
      <button class="vt-btn" class:active={cardView === 'compact'} aria-pressed={cardView === 'compact'} title="Compact cards — click a card for details" onclick={() => setCardView('compact')}>
        ▦ Compact
      </button>
      <button class="vt-btn" class:active={cardView === 'detailed'} aria-pressed={cardView === 'detailed'} title="Detailed cards — edit everything inline" onclick={() => setCardView('detailed')}>
        ▤ Detailed
      </button>
    </div>
    <div class="view-toggle" role="group" aria-label="Board lens">
      <button class="vt-btn" class:active={lens === 'none'} aria-pressed={lens === 'none'} title="Classic status board" onclick={() => setLens('none')}>
        <Icon name="board" size={12} /> Board
      </button>
      <button class="vt-btn" class:active={lens === 'store'} aria-pressed={lens === 'store'} title="One lane per store — everything happening at each site" onclick={() => setLens('store')}>
        <Icon name="pin" size={12} /> By store
      </button>
    </div>
  </div>
</div>

<div class="adv-controls" class:open={controlsOpen}>
  <FilterBar
    bind:filters
    bind:showArchived={() => showArchived, setShowArchived}
    {storeOptions}
    assigneeOptions={assignees}
    {matchCount}
  />
</div>

{#if showArchived}
  <div class="archived-banner">
    <Icon name="archive" size={13} /> Viewing archived tasks — finished cards are auto-archived after 30 days.
    Change a card's status (or drag it to a column) to restore it.
    <button class="link-btn" onclick={() => setShowArchived(false)}>← Back to the board</button>
  </div>
{/if}

{#if lens === 'store'}
  <!-- The "by store" lens replaces the status board: one collapsible lane per
       store, crossing only its non-empty statuses. Review surface — drag is
       off; cards open the sheet, filters/My Work/selection all compose. -->
  <p class="lens-hint">Grouped by store — drag is off in this view; click a card to edit it.</p>
  <StoreLanes
    tasks={visibleTasks}
    isAdmin={role === 'admin'}
    {selectedIds}
    onOpen={(id) => (openTaskId = id)}
    onToggleSelect={toggleSelect}
    onStoreFilter={toggleStore}
  />
{:else}

<!-- Mobile-only top bar: a menu button (opens the sidebar drawer) + a column
     switcher. Phones stack the board to one column at a time (a 6-column
     horizontal scroll is unusable on a narrow screen), so the pills jump
     between statuses; moving a card between columns is done via the card's own
     Status dropdown. The whole bar is hidden on desktop, where the sidebar is
     always visible and all columns show side by side. -->
<div class="mobile-topbar">
  <button class="menu-btn" onclick={() => onMenu?.()} aria-label="Open menu"><Icon name="menu" size={18} /></button>
  <nav class="col-tabs" aria-label="Switch board column">
    {#each KANBAN_STATUSES as status}
      {@const m = STATUS_META[status]}
      {@const wipLimit = WIP_LIMITS[status]}
      {@const overWip = wipLimit !== undefined && columns[status].length > wipLimit}
      <button
        class="col-tab"
        class:active={status === activeStatus}
        style:--tab-color={m.color}
        aria-pressed={status === activeStatus}
        title={overWip ? `Over the soft WIP limit — ${columns[status].length} cards, limit ${wipLimit}` : undefined}
        onclick={() => (activeStatus = status)}
      >
        <span class="tab-dot" style:background={m.color}></span>
        {status}
        <!-- The column header is hidden on phones (the pill IS the header), so
             the over-WIP signal moves into the count badge. -->
        <span class="tab-count" class:over-wip={overWip}>{columns[status].filter(matchesView).length}</span>
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
        canQuickAdd={!showArchived}
        {selectedIds}
        onToggleSelect={toggleSelect}
        onNavigate={handleNavigate}
        onQuickAdd={handleQuickAdd}
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
    font-size: var(--font-2xl);
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.02em;
  }
  .board-sub {
    font-size: var(--font-sm);
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
    border-radius: var(--radius-md);
    padding: 2px;
  }

  /* Advanced controls (density + lens + filter bar): always visible on
     desktop — the wrappers vanish via display:contents and the toggle button
     doesn't exist. Phones fold them behind the View button (see the
     mobile block below). */
  .controls-btn { display: none; }
  .adv-controls { display: contents; }
  .cb-badge {
    background: var(--primary);
    color: #fff;
    border-radius: var(--radius-pill);
    padding: 0 7px;
    font-size: var(--font-xs);
    font-weight: 700;
    margin-left: 5px;
  }
  .vt-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: var(--text-soft);
    font-size: var(--font-base);
    font-weight: 600;
    border-radius: var(--radius-md);
    padding: 6px 12px;
  }
  .vt-btn.active {
    background: var(--card-bg);
    color: var(--primary-dark);
    box-shadow: var(--shadow);
  }
  .vt-overdue {
    background: var(--danger-bg);
    color: var(--danger);
    border-radius: var(--radius-pill);
    padding: 1px 7px;
    font-size: var(--font-xs);
    font-weight: 700;
  }
  .mywork-empty {
    background: var(--bg);
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
    padding: 10px 14px;
    font-size: var(--font-base);
    color: var(--text-muted);
    margin-bottom: 10px;
  }
  /* Floating bulk-action bar — bottom-center while a selection exists. */
  .bulk-bar {
    position: fixed;
    bottom: max(16px, env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-bar);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-pop);
    padding: 10px 14px;
    max-width: min(92vw, 640px);
  }
  .bb-count { font-size: var(--font-base); font-weight: 700; color: var(--text); white-space: nowrap; }
  .bb-select {
    font-size: var(--font-sm);
    font-weight: 600;
    padding: 6px 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text-body);
    min-height: 0;
    width: auto;
  }
  .bb-btn {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-soft);
    border-radius: var(--radius-md);
    padding: 6px 11px;
    font-size: var(--font-sm);
    font-weight: 600;
    min-height: 0;
    cursor: pointer;
    white-space: nowrap;
  }
  .bb-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary-text); }
  .bb-btn:disabled { opacity: 0.6; cursor: default; }
  .bb-danger:hover:not(:disabled) { border-color: var(--danger-border); color: var(--danger); }

  .lens-hint {
    font-size: var(--font-sm);
    color: var(--text-faint);
    margin: -2px 0 10px;
  }

  .archived-banner {
    background: var(--bg);
    border: 1px solid var(--border);
    border-left: 4px solid var(--primary);
    border-radius: var(--radius-md);
    padding: 8px 14px;
    font-size: var(--font-base);
    color: var(--text-soft);
    margin-bottom: 10px;
  }
  .link-btn {
    background: none;
    border: none;
    color: var(--primary-dark);
    font-weight: 600;
    font-size: var(--font-base);
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
    border-radius: var(--radius-xl);
  }
  .be-icon { color: var(--text-faint); margin-bottom: 8px; }
  .board-empty h2 { font-size: var(--font-xl); font-weight: 700; color: var(--text); margin: 0 0 8px; }
  .board-empty p { font-size: var(--font-md); color: var(--text-muted); line-height: 1.5; margin: 0 0 18px; }
  .be-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px; }
  .be-help { font-size: var(--font-base); font-weight: 600; color: var(--primary-dark); text-decoration: none; }
  .be-help:hover { text-decoration: underline; }

  .sync-toast {
    background: var(--success-bg);
    color: var(--success);
    border: 1px solid var(--success-border);
    border-radius: var(--radius-md);
    padding: 8px 14px;
    font-size: var(--font-base);
    margin-bottom: 10px;
  }

  .offline-banner {
    background: var(--warning-bg);
    color: var(--warning);
    border: 1px solid var(--warning-border);
    border-radius: var(--radius-md);
    padding: 8px 14px;
    font-size: var(--font-base);
    font-weight: 500;
    margin-bottom: 10px;
  }
  .save-toast {
    background: var(--danger-bg);
    color: var(--danger);
    border: 1px solid var(--danger-border);
    border-radius: var(--radius-md);
    padding: 8px 14px;
    font-size: var(--font-base);
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
    /* The page identity is obvious on a phone — drop the tagline row. */
    .board-sub { display: none; }

    /* Fold the advanced controls behind the View button so the first card
       is reachable without scrolling past rows of chrome. The badge counts
       non-default settings, so an active-but-hidden filter stays visible. */
    .controls-btn {
      display: inline-flex;
      align-items: center;
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text-soft);
      border-radius: var(--radius-md);
      padding: 6px 12px;
      font-size: var(--font-base);
      font-weight: 600;
      min-height: 0;
      cursor: pointer;
    }
    .adv-controls { display: none; }
    .adv-controls.open {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      flex-basis: 100%;
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
      gap: 6px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text-soft);
      border-radius: var(--radius-pill);
      padding: 6px 10px;
      font-size: var(--font-sm);
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
      border-radius: var(--radius-pill);
      padding: 0 6px;
      font-size: var(--font-2xs);
      font-weight: 700;
      min-width: 16px;
      text-align: center;
    }
    .col-tab.active .tab-count { background: var(--tab-color); color: #fff; }
    /* Over the soft WIP limit — same amber as the desktop header pill. */
    .tab-count.over-wip { background: var(--warning-bg); color: var(--warning); }
    .col-tab.active .tab-count.over-wip { background: var(--warning-bg); color: var(--warning); }
  }
</style>
