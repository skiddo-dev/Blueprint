<script lang="ts">
  import { onMount } from 'svelte'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import KanbanBoard from '$lib/components/KanbanBoard.svelte'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()

  // Cast session — Auth.js session is extended with role/displayName in the callback
  const session = data.session as unknown as AppSession

  let users = $state<{ _id: string; name: string; role: string }[]>([])
  let viewAsUser = $state<string | null>(null)
  let boardTasks = $state(data.tasks)

  // Sidebar open/close lives here so the board's mobile top bar (in KanbanBoard)
  // can open the same off-canvas drawer the Sidebar renders.
  let sidebarOpen = $state(false)

  async function loadUsers() {
    const r = await fetch('/api/users')
    if (r.ok) users = await r.json()
  }

  async function loadTasks() {
    const url = viewAsUser ? `/api/tasks?user=${encodeURIComponent(viewAsUser)}` : '/api/tasks'
    const r = await fetch(url)
    if (r.ok) boardTasks = await r.json()
  }

  onMount(loadUsers)

  async function handleAddUser(email: string, role: string, name: string) {
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role, name }),
    })
    await loadUsers()
  }

  async function handleDeleteUser(email: string) {
    await fetch(`/api/users?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
    await loadUsers()
  }

  async function handleClearAll() {
    await fetch('/api/tasks', { method: 'DELETE' })
    boardTasks = []
  }

  async function handleViewChange(name: string | null) {
    viewAsUser = name
    await loadTasks()
  }
</script>

<svelte:head>
  <title>Blueprint</title>
</svelte:head>

<div class="app-layout">
  <Sidebar
    bind:open={sidebarOpen}
    {session}
    tasks={boardTasks}
    {users}
    {viewAsUser}
    onViewChange={handleViewChange}
    onAddUser={handleAddUser}
    onDeleteUser={handleDeleteUser}
    onClearAll={handleClearAll}
  />
  <main class="main-content">
    <KanbanBoard
      initialTasks={boardTasks}
      {session}
      pmUsers={data.pmUsers}
      onMenu={() => (sidebarOpen = true)}
    />
  </main>
</div>
