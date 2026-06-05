<script lang="ts">
  import type { Task, TaskStatus, AppSession } from '$lib/types'
  import { KANBAN_STATUSES, STATUS_META } from '$lib/constants'

  let {
    open = $bindable(false),
    session,
    tasks,
    users,
    viewAsUser,
    onViewChange,
    onAddUser,
    onDeleteUser,
    onClearAll,
  }: {
    open?: boolean
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

  // `open` is owned by the parent page and bound here. It controls the mobile
  // off-canvas drawer; on desktop CSS keeps the sidebar always visible regardless.
  // The board's top bar (KanbanBoard) opens it; the backdrop / close button below
  // closes it.
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

<!-- Dim/close backdrop — only rendered on mobile when the drawer is open. -->
{#if open}
  <div class="sidebar-backdrop" onclick={() => (open = false)} role="presentation"></div>
{/if}

  <aside class="sidebar" class:open>
    <!-- User info -->
    <div class="user-info">
      <div class="user-meta">
        <div class="user-name">{userName}</div>
        <span class="role-badge">{role === 'admin' ? 'Admin' : 'PM'}</span>
      </div>
      <button class="sidebar-close" onclick={() => (open = false)} aria-label="Close menu">✕</button>
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

  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.4);
    z-index: 39; /* just under the drawer (40) */
  }

  .user-info {
    padding: 4px 2px 6px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .user-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .user-name { font-size: 13px; font-weight: 600; color: #1e293b; }
  /* Close button only appears in the mobile drawer (see media query). */
  .sidebar-close {
    display: none;
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: #64748b;
    background: #f8fafc;
    border: 1px solid var(--border);
    border-radius: 9px;
  }
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
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      height: 100dvh;
      width: min(280px, 84vw);
      z-index: 40;
      /* Clear the notch and the home indicator (no floating toggle anymore —
         the board's top bar opens this drawer). */
      padding-top: max(14px, env(safe-area-inset-top));
      padding-left: max(12px, env(safe-area-inset-left));
      padding-bottom: max(14px, env(safe-area-inset-bottom));
      box-shadow: 4px 0 20px rgba(15,23,42,0.12);
      display: none;          /* hidden by default on mobile */
    }
    .sidebar.open { display: flex; }   /* shown when the menu button is tapped */
    .sidebar-close { display: inline-flex; }
    .nav-link { display: flex; align-items: center; min-height: 44px; }
  }
</style>
