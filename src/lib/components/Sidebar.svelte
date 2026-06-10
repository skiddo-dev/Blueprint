<script lang="ts">
  import NavDrawer from './NavDrawer.svelte'
  import Icon from './Icon.svelte'
  import type { Task, TaskStatus, AppSession } from '$lib/types'
  import { KANBAN_STATUSES, STATUS_META } from '$lib/constants'

  let {
    open = $bindable(false),
    session,
    tasks,
    users,
    accessRequests = [],
    viewAsUser,
    onViewChange,
    onAddUser,
    onDeleteUser,
    onApproveRequest,
    onDismissRequest,
    onImported,
    onClearAll,
  }: {
    open?: boolean
    session: AppSession
    tasks: Task[]
    users: { _id: string; name: string; role: string; lastActiveAt?: string }[]
    accessRequests?: { email: string; name: string; note: string; requested_at: string }[]
    viewAsUser: string | null
    onViewChange: (name: string | null) => void
    onAddUser: (email: string, role: string, name: string) => void
    onDeleteUser: (email: string) => void
    onApproveRequest?: (email: string, name: string) => void
    onDismissRequest?: (email: string) => void
    onImported?: () => void
    onClearAll: () => void
  } = $props()

  const role = $derived(session.user.role)
  const userName = $derived(session.user.displayName)

  let newEmail = $state('')
  let newName = $state('')
  let newRole = $state('pm')
  let confirmClear = $state(false)

  // CSV import (admin)
  let csvText = $state('')
  let importing = $state(false)
  let importResult = $state('')

  async function handleCsvFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]
    if (file) csvText = await file.text()
  }

  async function runImport() {
    if (!csvText.trim()) return
    importing = true
    importResult = ''
    try {
      const r = await fetch('/api/tasks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      })
      const d = await r.json()
      if (!r.ok) { importResult = d.message ?? `Import failed (${r.status}).`; return }
      importResult = `✅ ${d.created} created${d.skipped ? `, ${d.skipped} skipped` : ''}.`
      if (d.created) { csvText = ''; onImported?.() }
    } catch (e) {
      importResult = `Error: ${e}`
    } finally {
      importing = false
    }
  }

  // Counts per status (derived from tasks prop)
  let counts = $derived(
    Object.fromEntries(KANBAN_STATUSES.map(s => [s, tasks.filter(t => t.status === s).length]))
  )
  let total = $derived(tasks.length)
  let done = $derived(counts['Done'] ?? 0)
  let pct = $derived(total > 0 ? Math.round((done / total) * 100) : 0)

  // ── Usage / adoption (admin) ──────────────────────────────────────────
  const WEEK_MS = 7 * 86_400_000
  let activeThisWeek = $derived(
    users.filter(u => u.lastActiveAt && Date.now() - new Date(u.lastActiveAt).getTime() < WEEK_MS).length,
  )
  // Compact relative time for "last active" (e.g. "3h ago", "2d ago", "never").
  function relTime(iso?: string): string {
    if (!iso) return 'never'
    const ms = Date.now() - new Date(iso).getTime()
    if (ms < 60_000) return 'just now'
    const m = Math.floor(ms / 60_000)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d ago`
    const w = Math.floor(d / 7)
    if (w < 5) return `${w}w ago`
    return `${Math.floor(d / 30)}mo ago`
  }
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

    <!-- Access requests (only shown when there are pending ones) -->
    {#if accessRequests.length}
      <details open>
        <summary class="expander-title"><Icon name="bell" size={14} /> Access Requests <span class="req-badge">{accessRequests.length}</span></summary>
        <div class="expander-body">
          {#each accessRequests as r (r.email)}
            <div class="req-row">
              <div class="req-meta">
                <span class="req-name">{r.name || r.email}</span>
                <span class="req-email">{r.email}</span>
                {#if r.note}<span class="req-note">“{r.note}”</span>{/if}
              </div>
              <div class="req-actions">
                <button class="secondary" onclick={() => onApproveRequest?.(r.email, r.name)}><Icon name="check" size={12} /> Approve</button>
                <button class="ghost" title="Dismiss" aria-label="Dismiss request" onclick={() => onDismissRequest?.(r.email)}><Icon name="x" size={12} /></button>
              </div>
            </div>
          {/each}
        </div>
      </details>
    {/if}

    <!-- View as -->
    <details>
      <summary class="expander-title"><Icon name="eye" size={14} /> View User Activity</summary>
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
      <summary class="expander-title"><Icon name="users" size={14} /> User Access</summary>
      <div class="expander-body">
        <p class="hint">
          {activeThisWeek} of {users.length} active this week · Display Name must match the "Assign to" dropdown.
        </p>
        {#each users as u}
          <div class="user-row">
            <span class="user-email">{u.name || u._id}</span>
            <span class="user-active" title={u.lastActiveAt ? `Last active ${u.lastActiveAt}` : 'Never signed in'}>{relTime(u.lastActiveAt)}</span>
            <span class="user-role">{u.role}</span>
            <button class="ghost" aria-label="Remove user" onclick={() => onDeleteUser(u._id)}><Icon name="x" size={12} /></button>
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
          <Icon name="plus" size={13} /> Add / Update
        </button>
      </div>
    </details>

    <!-- Import tasks from CSV -->
    <details>
      <summary class="expander-title"><Icon name="import" size={14} /> Import Tasks (CSV)</summary>
      <div class="expander-body">
        <p class="hint">
          Columns match <strong>Export</strong> (title, status, assigned_to, date, notes…).
          Only <strong>title</strong> is required; unknown columns are ignored.
        </p>
        <input type="file" accept=".csv,text/csv" onchange={handleCsvFile} />
        <textarea bind:value={csvText} rows="4" placeholder="…or paste CSV here"></textarea>
        <button class="secondary full-w" disabled={importing || !csvText.trim()} onclick={runImport}>
          {#if importing}Importing…{:else}<Icon name="import" size={13} /> Import{/if}
        </button>
        {#if importResult}<p class="hint">{importResult}</p>{/if}
        <a class="hint dl-link" href="/api/tasks/export" download>⬇ Download current tasks (use as a template)</a>
      </div>
    </details>

    <!-- Danger zone -->
    <details>
      <summary class="expander-title danger"><Icon name="warning" size={14} /> Danger Zone</summary>
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
          <Icon name="trash" size={13} /> Clear All Tasks
        </button>
      </div>
    </details>
  {/if}
</NavDrawer>

<style>
  .full-w { width: 100%; justify-content: center; }
  hr { border: none; border-top: 1px solid var(--border-soft); margin: 4px 0; }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-faint);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: var(--card-bg);
    border: 1px solid var(--border-soft);
    border-radius: 7px;
  }
  .stat-label {
    font-size: 13px;
    color: var(--text-body);
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
    color: var(--text-faint);
    margin-bottom: 4px;
  }
  .progress-track {
    background: var(--border);
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
    color: var(--text-body);
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

  .hint { font-size: 11px; color: var(--text-faint); }

  .user-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .user-email { font-size: 11px; color: var(--text-body); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .user-active { font-size: 10px; color: var(--text-faint); white-space: nowrap; }
  .user-role { font-size: 10px; color: var(--text-faint); }

  .req-badge {
    background: #fee2e2;
    color: #b91c1c;
    border-radius: 999px;
    padding: 0 6px;
    font-size: 10px;
    font-weight: 700;
  }
  .req-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
    padding: 6px 8px;
    background: var(--card-bg);
    border: 1px solid var(--border-soft);
    border-radius: 7px;
  }
  .req-meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .req-name { font-size: 12px; font-weight: 600; color: var(--text-body); }
  .req-email { font-size: 10px; color: var(--text-faint); overflow: hidden; text-overflow: ellipsis; }
  .req-note { font-size: 10px; color: var(--text-muted); font-style: italic; }
  .req-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  .req-actions .secondary { font-size: 11px; padding: 3px 7px; }

  label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--text-body); }
  .checkbox-label { flex-direction: row; align-items: center; gap: 6px; font-size: 12px; }
  .danger-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    resize: vertical;
    background: var(--bg);
    color: var(--text);
  }
  input[type="file"] { font-size: 11px; color: var(--text-muted); }
  .dl-link { color: var(--primary-dark); text-decoration: none; }
  .dl-link:hover { text-decoration: underline; }
</style>
