<script lang="ts">
  import NavDrawer from './NavDrawer.svelte'
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

<!-- Shared drawer shell (header / logout / nav). Board-specific stats + admin
     controls below are passed as its children. -->
<NavDrawer bind:open user={{ name: userName, role: role ?? 'pm' }}>
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
</NavDrawer>

<style>
  .full-w { width: 100%; justify-content: center; }
  hr { border: none; border-top: 1px solid #f1f5f9; margin: 4px 0; }

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
</style>
