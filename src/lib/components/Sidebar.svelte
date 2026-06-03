<script lang="ts">
  import type { Task, TaskStatus, AppSession } from '$lib/types'
  import { KANBAN_STATUSES, STATUS_META } from '$lib/constants'

  let {
    session,
    tasks,
    users,
    viewAsUser,
    onViewChange,
    onAddUser,
    onDeleteUser,
    onClearAll,
  }: {
    session: AppSession
    tasks: Task[]
    users: { _id: string; name: string; role: string }[]
    viewAsUser: string | null
    onViewChange: (name: string | null) => void
    onAddUser: (email: string, role: string, name: string) => void
    onDeleteUser: (email: string) => void
    onClearAll: () => void
  } = $props()

  const role = $derived(session.user.role)
  const userName = $derived(session.user.displayName)

  let sidebarOpen = $state(true)
  let newEmail = $state('')
  let newName = $state('')
  let newRole = $state('pm')
  let confirmClear = $state(false)

  // Counts per status (derived from tasks prop)
  let counts = $derived(
    Object.fromEntries(KANBAN_STATUSES.map(s => [s, tasks.filter(t => t.status === s).length]))
  )
  let total = $derived(tasks.length)
  let done = $derived(counts['Done'] ?? 0)
  let pct = $derived(total > 0 ? Math.round((done / total) * 100) : 0)
</script>

<!-- Mobile toggle -->
<button
  class="sidebar-toggle"
  onclick={() => { sidebarOpen = !sidebarOpen }}
  aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
>
  {sidebarOpen ? '‹' : '›'}
</button>

{#if sidebarOpen}
  <aside class="sidebar">
    <!-- User info -->
    <div class="user-info">
      <div class="user-name">{userName}</div>
      <span class="role-badge">{role === 'admin' ? 'Admin' : 'PM'}</span>
    </div>

    <form action="/auth/signout" method="POST">
      <button class="secondary full-w" type="submit">Log out</button>
    </form>

    <hr />

    <!-- Navigation (admin only) -->
    {#if role === 'admin'}
      <nav class="nav-links">
        <a href="/" class="nav-link">🏗️ Kanban Board</a>
        <a href="/dashboard" class="nav-link">📊 Dashboard</a>
        <a href="/quotes" class="nav-link">💰 Quote Generator</a>
      </nav>
      <hr />
    {/if}

    <!-- Board stats -->
    <p class="section-label">Board Stats</p>
    {#each KANBAN_STATUSES as s}
      {@const m = STATUS_META[s]}
      <div class="stat-row">
        <span class="stat-label">
          <span class="dot" style:background={m.color}></span>
          {s}
        </span>
        <span class="stat-count" style:color={m.color}>{counts[s] ?? 0}</span>
      </div>
    {/each}

    {#if total > 0}
      <div class="completion">
        <div class="completion-labels">
          <span>Completion</span>
          <span style:color="#10b981" style:font-weight="600">{pct}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style:width="{pct}%"></div>
        </div>
      </div>
    {/if}

    <!-- Admin controls -->
    {#if role === 'admin'}
      <hr />

      <!-- View as -->
      <details>
        <summary class="expander-title">👁️ View User Activity</summary>
        <div class="expander-body">
          <select
            value={viewAsUser ?? 'All tasks'}
            onchange={(e) => {
              const v = e.currentTarget.value
              onViewChange(v === 'All tasks' ? null : v)
            }}
          >
            <option value="All tasks">All tasks</option>
            {#each users as u}
              <option value={u.name}>{u.name}</option>
            {/each}
          </select>
        </div>
      </details>

      <!-- User access -->
      <details>
        <summary class="expander-title">👥 User Access</summary>
        <div class="expander-body">
          <p class="hint">Display Name must match the "Assign to" dropdown.</p>
          {#each users as u}
            <div class="user-row">
              <span class="user-email">{u.name || u._id}</span>
              <span class="user-role">{u.role}</span>
              <button class="ghost" onclick={() => onDeleteUser(u._id)}>✕</button>
            </div>
          {/each}
          <hr />
          <label>
            Email
            <input type="email" bind:value={newEmail} placeholder="person@ravesinc.com" />
          </label>
          <label>
            Display Name
            <input type="text" bind:value={newName} placeholder="Andrew" />
          </label>
          <label>
            Role
            <select bind:value={newRole}>
              <option value="pm">pm</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <button
            class="secondary full-w"
            onclick={() => {
              if (newEmail.trim()) {
                onAddUser(newEmail.trim(), newRole, newName.trim())
                newEmail = ''; newName = ''; newRole = 'pm'
              }
            }}
          >
            ➕ Add / Update
          </button>
        </div>
      </details>

      <!-- Danger zone -->
      <details>
        <summary class="expander-title danger">⚠️ Danger Zone</summary>
        <div class="expander-body">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={confirmClear} />
            I confirm deletion of ALL tasks
          </label>
          <button
            class="secondary full-w danger-btn"
            disabled={!confirmClear}
            onclick={() => { if (confirmClear) onClearAll() }}
          >
            🗑️ Clear All Tasks
          </button>
        </div>
      </details>
    {/if}
  </aside>
{/if}

<style>
  .sidebar {
    width: var(--sidebar-width, 240px);
    background: #ffffff;
    border-right: 1px solid #e2e8f0;
    padding: 14px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    height: 100vh;
  }

  .sidebar-toggle {
    display: none;
    position: fixed;
    top: 10px;
    left: 10px;
    z-index: 50;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 18px;
    padding: 4px 8px;
    cursor: pointer;
  }

  .user-info { padding: 4px 2px 6px; }
  .user-name { font-size: 13px; font-weight: 600; color: #1e293b; }
  .role-badge {
    background: #e0e7ff;
    color: #4338ca;
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 11px;
    font-weight: 600;
  }

  .full-w { width: 100%; justify-content: center; }

  hr { border: none; border-top: 1px solid #f1f5f9; margin: 4px 0; }

  .nav-links { display: flex; flex-direction: column; gap: 4px; }
  .nav-link {
    display: block;
    padding: 8px 10px;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    text-decoration: none;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    background: #f8fafc;
    transition: background 0.15s, border-color 0.15s;
  }
  .nav-link:hover { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: #fff;
    border: 1px solid #f1f5f9;
    border-radius: 7px;
  }
  .stat-label {
    font-size: 13px;
    color: #374151;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }
  .stat-count { font-size: 13px; font-weight: 700; }

  .completion { margin-top: 8px; }
  .completion-labels {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #94a3b8;
    margin-bottom: 4px;
  }
  .progress-track {
    background: #e2e8f0;
    border-radius: 4px;
    height: 5px;
  }
  .progress-fill {
    background: #10b981;
    border-radius: 4px;
    height: 5px;
    transition: width 0.4s ease;
  }

  details { border: none; }
  .expander-title {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    padding: 6px 2px;
    cursor: pointer;
  }
  .expander-title.danger { color: #dc2626; }
  .expander-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 2px 8px;
  }

  .hint { font-size: 11px; color: #94a3b8; }

  .user-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .user-email { font-size: 11px; color: #374151; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .user-role { font-size: 10px; color: #94a3b8; }

  label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #374151; }
  .checkbox-label { flex-direction: row; align-items: center; gap: 6px; font-size: 12px; }
  .danger-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (max-width: 768px) {
    .sidebar-toggle { display: block; }
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 40;
      box-shadow: 4px 0 20px rgba(15,23,42,0.12);
    }
  }
</style>
