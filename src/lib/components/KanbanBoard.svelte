<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import KanbanColumn from './KanbanColumn.svelte'
  import NewTaskModal from './NewTaskModal.svelte'
  import type { Task, TaskStatus, AppSession } from '$lib/types'
  import { KANBAN_STATUSES, SUPERVISORS } from '$lib/constants'

  let {
    initialTasks,
    session,
    pmUsers,
  }: {
    initialTasks: Task[]
    session: AppSession
    pmUsers: { name: string }[]
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

  // ── Real-time polling (2 s) ──────────────────────────────────────────
  let pollTimer: ReturnType<typeof setInterval>

  onMount(async () => {
    const r = await fetch('/api/tasks/signature')
    if (r.ok) currentSig = (await r.json()).sig
    pollTimer = setInterval(async () => {
      const r = await fetch('/api/tasks/signature')
      if (!r.ok) return
      const { sig } = await r.json()
      if (sig !== currentSig) {
        currentSig = sig
        const r2 = await fetch('/api/tasks')
        if (r2.ok) columns = group(await r2.json())
      }
    }, 2000)
  })

  onDestroy(() => clearInterval(pollTimer))

  // ── Drag-and-drop handlers ───────────────────────────────────────────
  function handleConsider(status: TaskStatus, items: Task[]) {
    // Keep columns in sync during drag hover (smooth animation)
    columns[status] = items
  }

  async function handleFinalize(status: TaskStatus, items: Task[], droppedId: string | null) {
    columns[status] = items
    if (droppedId) {
      await fetch(`/api/tasks/${droppedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'status', value: status }),
      })
    }
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
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    })
  }

  // ── Delete ────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    for (const s of KANBAN_STATUSES) {
      columns[s] = columns[s].filter(t => t._id !== id)
    }
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
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

<div class="board-columns">
  {#each KANBAN_STATUSES as status}
    <KanbanColumn
      {status}
      tasks={columns[status]}
      {assignees}
      onConsider={handleConsider}
      onFinalize={handleFinalize}
      onFieldUpdate={handleFieldUpdate}
      onDelete={handleDelete}
    />
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

  .board-columns {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 12px;
    align-items: flex-start;
  }

  @media (max-width: 768px) {
    .board-columns {
      flex-direction: column;
      overflow-x: unset;
    }
  }
</style>
