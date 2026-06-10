<script lang="ts">
  import Icon from './Icon.svelte'
  import { onMount } from 'svelte'
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
  let coAssignees = $state<string[]>([])
  let status = $state<TaskStatus>('To Do')
  let dueDate = $state('')
  let quote = $state('')
  let notes = $state('')
  let saving = $state(false)
  let error = $state('')

  // People who can still be added alongside the primary assignee.
  let coCandidates = $derived(
    assignees.filter(a => a !== 'Unassigned' && a !== assignedTo && !coAssignees.includes(a)),
  )
  // Making a co-assignee the primary removes them from the co-list.
  $effect(() => {
    if (coAssignees.includes(assignedTo)) coAssignees = coAssignees.filter(n => n !== assignedTo)
  })
  function addCoAssignee(e: Event & { currentTarget: HTMLSelectElement }) {
    const name = e.currentTarget.value
    e.currentTarget.value = ''
    if (name) coAssignees = [...coAssignees, name]
  }

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
          quote_status: quote.trim() ? 'Draft' : null,
          assigned_to: assignedTo,
          co_assignees: coAssignees,
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

  // Lock background scroll while the modal is open so the page behind a mobile
  // bottom-sheet doesn't scroll under it. Cleanup runs when the modal unmounts.
  onMount(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  })
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose() }} />

<!-- Modal backdrop -->
<div class="backdrop" onclick={onClose} role="presentation"></div>

<div class="modal" role="dialog" aria-modal="true" aria-label="Create New Task">
  <div class="modal-header">
    <h2><Icon name="pencil" size={15} /> Create New Task</h2>
    <button class="ghost close-btn" onclick={onClose}><Icon name="x" size={14} /></button>
  </div>

  <div class="modal-body">
    <label>
      <span>Title *</span>
      <!-- svelte-ignore a11y_autofocus -->
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

    <div class="field">
      <span class="field-label">Also assign</span>
      <div class="co-row">
        {#each coAssignees as name (name)}
          <span class="co-chip">
            <Icon name="users" size={12} /> {name}
            <button
              type="button"
              class="co-remove"
              onclick={() => (coAssignees = coAssignees.filter(n => n !== name))}
              aria-label="Remove {name}"
              title="Remove {name}"
            ><Icon name="x" size={11} /></button>
          </span>
        {/each}
        {#if coCandidates.length}
          <select class="co-add" aria-label="Add another person" onchange={addCoAssignee}>
            <option value="" selected>＋ Add person…</option>
            {#each coCandidates as a}
              <option value={a}>{a}</option>
            {/each}
          </select>
        {/if}
      </div>
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
    background: var(--backdrop);
    z-index: calc(var(--z-modal) - 1);
  }
  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: var(--z-modal);
    background: var(--card-bg);
    border-radius: var(--radius-lg);
    width: min(480px, calc(100vw - 32px));
    /* Never taller than the viewport — the body scrolls inside instead. */
    max-height: calc(100dvh - 32px);
    box-shadow: var(--shadow-modal);
    display: flex;
    flex-direction: column;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--border);
  }
  .modal-header h2 { font-size: var(--font-lg); font-weight: 700; color: var(--text); }
  .close-btn { font-size: var(--font-lg); color: var(--text-faint); padding: 4px 8px; }
  .modal-body {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    flex: 1;        /* take the slack so it, not the modal, is the scroll region */
    min-height: 0;  /* allow it to shrink below content height inside the flex column */
  }
  label { display: flex; flex-direction: column; gap: 4px; }
  label span { font-size: var(--font-sm); font-weight: 500; color: var(--text-body); }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  /* "Also assign" — chips for each extra person + a dashed add-person picker.
     A .field div (not a <label>) so a stray click can't focus the select. */
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field-label { font-size: var(--font-sm); font-weight: 500; color: var(--text-body); }
  .co-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .co-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--chip-bg);
    color: var(--primary-text);
    border-radius: var(--radius-pill);
    padding: 4px 10px;
    font-size: var(--font-sm);
    font-weight: 500;
  }
  .co-remove {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 1px;
    font-size: var(--font-xs);
    line-height: 1;
    color: var(--primary-text);
    opacity: 0.6;
    min-height: 0;
  }
  .co-remove:hover { opacity: 1; color: var(--danger); }
  .co-add {
    width: auto;
    min-height: 0;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-soft);
    background: var(--bg);
    border: 1px dashed var(--border);
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }
  .co-add:hover { border-color: var(--primary); color: var(--primary-text); }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 16px;
    border-top: 1px solid var(--border);
  }
  .error { font-size: var(--font-sm); color: var(--danger); }

  /* Mobile: dock the dialog to the bottom as a thumb-reachable sheet, clear of
     the home indicator, with bigger tap targets. */
  @media (max-width: 768px) {
    .modal {
      top: auto;
      bottom: 0;
      left: 0;
      transform: none;
      width: 100%;
      max-width: 100%;
      max-height: 92dvh;
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    }
    .modal-footer {
      padding-bottom: max(16px, env(safe-area-inset-bottom));
    }
    .close-btn {
      min-width: 44px;
      min-height: 44px;
    }
    /* 16px stops iOS Safari from zooming the page when the picker opens. */
    .co-add { font-size: 16px; min-height: 36px; }
    .co-remove { font-size: var(--font-base); padding: 2px 5px; }
  }

  /* On the narrowest phones, stack the paired fields so 16px inputs don't crowd. */
  @media (max-width: 420px) {
    .row-2 { grid-template-columns: 1fr; }
  }
</style>
