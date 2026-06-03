<script lang="ts">
  import type { Task, TaskStatus } from '$lib/types'
  import { KANBAN_STATUSES } from '$lib/constants'

  let {
    assignees,
    userName,
    onCreated,
    onClose,
  }: {
    assignees: string[]
    userName: string
    onCreated: (task: Task) => void
    onClose: () => void
  } = $props()

  let title = $state('')
  let assignedTo = $state('Unassigned')
  let status = $state<TaskStatus>('To Do')
  let dueDate = $state('')
  let quote = $state('')
  let notes = $state('')
  let saving = $state(false)
  let error = $state('')

  async function submit() {
    if (!title.trim()) { error = 'Title is required.'; return }
    saving = true; error = ''
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: '',
          quote: quote.trim() || null,
          assigned_to: assignedTo,
          notes,
          date: dueDate || null,
          status,
          exchange_id: null,
          created_by: userName,
          attachment_ids: [],
          created_at: new Date().toISOString(),
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const created: Task = await r.json()
      onCreated(created)
    } catch (e) {
      error = String(e)
    } finally {
      saving = false
    }
  }
</script>

<!-- Modal backdrop -->
<div class="backdrop" onclick={onClose} role="presentation"></div>

<div class="modal" role="dialog" aria-modal="true" aria-label="Create New Task">
  <div class="modal-header">
    <h2>✏️ Create New Task</h2>
    <button class="ghost close-btn" onclick={onClose}>✕</button>
  </div>

  <div class="modal-body">
    <label>
      <span>Title *</span>
      <input
        type="text"
        bind:value={title}
        placeholder="What needs to get done?"
        autofocus
      />
    </label>

    <div class="row-2">
      <label>
        <span>Assign to</span>
        <select bind:value={assignedTo}>
          {#each assignees as a}
            <option value={a}>{a}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Status</span>
        <select bind:value={status}>
          {#each KANBAN_STATUSES as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="row-2">
      <label>
        <span>Due Date</span>
        <input type="date" bind:value={dueDate} />
      </label>
      <label>
        <span>Quote</span>
        <input type="text" bind:value={quote} placeholder="e.g. $12,000" />
      </label>
    </div>

    <label>
      <span>Notes</span>
      <textarea bind:value={notes} rows="3" placeholder="Any additional context…"></textarea>
    </label>

    {#if error}
      <p class="error">{error}</p>
    {/if}
  </div>

  <div class="modal-footer">
    <button class="secondary" onclick={onClose}>Cancel</button>
    <button class="primary" onclick={submit} disabled={saving}>
      {saving ? 'Creating…' : 'Create Task'}
    </button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15,23,42,0.4);
    z-index: 99;
  }
  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100;
    background: #fff;
    border-radius: 12px;
    width: min(480px, calc(100vw - 32px));
    box-shadow: 0 20px 60px rgba(15,23,42,0.2);
    display: flex;
    flex-direction: column;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px 12px;
    border-bottom: 1px solid #e2e8f0;
  }
  .modal-header h2 { font-size: 16px; font-weight: 700; color: #1e293b; }
  .close-btn { font-size: 16px; color: #94a3b8; padding: 4px 8px; }
  .modal-body {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }
  label { display: flex; flex-direction: column; gap: 4px; }
  label span { font-size: 12px; font-weight: 500; color: #374151; }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 16px;
    border-top: 1px solid #e2e8f0;
  }
  .error { font-size: 12px; color: #dc2626; }
</style>
