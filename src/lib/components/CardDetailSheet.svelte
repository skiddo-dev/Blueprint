<script lang="ts">
  // The task detail sheet — everything that used to crowd the 240px card face:
  // status/assignee/date/quote editing, co-assignees, notes, the full email,
  // attachments, comments, and the activity log. Renders as a right-hand panel
  // on desktop and a full-screen sheet on phones. Client-only by construction:
  // it mounts when a card is opened, never during SSR.
  import { onMount } from 'svelte'
  import DOMPurify from 'dompurify'
  import type { Task, TimelineEntry } from '$lib/types'
  import { KANBAN_STATUSES, QUOTE_TYPES, QUOTE_PEOPLE, QUOTE_STATUSES, QUOTE_STATUS_META, STATUS_META } from '$lib/constants'
  import { extractStoreNumbers } from '$lib/storeNumbers'
  import CardComments from './CardComments.svelte'
  import CardAttachments from './CardAttachments.svelte'

  let {
    task,
    assignees,
    mentionCandidates = [],
    currentUserName = '',
    currentUserEmail = '',
    isAdmin = false,
    onClose,
    onFieldUpdate,
    onDelete,
    onStoreFilter,
    onComment,
    onEditComment,
    onDeleteComment,
    onReact,
    onUploadAttachment,
    onDeleteAttachment,
    onAddChecklist,
    onToggleChecklist,
    onDeleteChecklist,
  }: {
    task: Task
    assignees: string[]
    mentionCandidates?: string[]
    currentUserName?: string
    currentUserEmail?: string
    isAdmin?: boolean
    onClose: () => void
    onFieldUpdate: (id: string, field: string, value: unknown) => void
    onDelete: (id: string) => void
    onStoreFilter?: (n: string) => void
    onComment?: (id: string, text: string, parentId?: string) => void
    onEditComment?: (id: string, commentId: string, text: string) => void
    onDeleteComment?: (id: string, commentId: string) => void
    onReact?: (id: string, commentId: string, emoji: string) => void
    onUploadAttachment?: (id: string, file: File) => Promise<void> | void
    onDeleteAttachment?: (id: string, attId: string) => void
    onAddChecklist?: (id: string, text: string) => Promise<void> | void
    onToggleChecklist?: (id: string, itemId: string, done: boolean) => void
    onDeleteChecklist?: (id: string, itemId: string) => void
  } = $props()

  let meta = $derived(STATUS_META[task.status] ?? STATUS_META['To Do'])
  let storeNums = $derived(task.store_numbers ?? extractStoreNumbers(task.title))
  let qMeta = $derived(QUOTE_STATUS_META[task.quote_status ?? 'Draft'] ?? QUOTE_STATUS_META['Draft'])
  let overdue = $derived(
    !!task.date &&
    task.date < new Date().toISOString().slice(0, 10) &&
    task.status !== 'Done' &&
    task.status !== 'Cancelled',
  )
  let source = $derived(
    task.exchange_id
      ? `📩 ${task.sender_name || task.sender_email || 'Email'}`
      : `✏️ ${task.created_by || 'Manual'}`
  )
  let createdFull = $derived.by(() => {
    const d = new Date(task.created_at)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  })

  // The sheet never SSRs (it mounts on interaction), but gate the raw-email
  // sanitize on mount anyway so DOMPurify only ever runs with a real DOM.
  let mounted = $state(false)
  onMount(() => { mounted = true })
  let safeBody = $derived(mounted ? DOMPurify.sanitize(task.full_body ?? '') : '')

  // ── Notes (local copy so the poll doesn't reset mid-typing) ────────────────
  // svelte-ignore state_referenced_locally
  let notesValue = $state(task.notes ?? '')
  let notesDirty = $state(false)
  $effect(() => { if (!notesDirty) notesValue = (task as Task).notes ?? '' })
  function saveNotes() {
    if (notesDirty) {
      onFieldUpdate(task._id, 'notes', notesValue)
      notesDirty = false
    }
  }

  // ── Co-assignees ────────────────────────────────────────────────────────────
  let coAssignees = $derived(task.co_assignees ?? [])
  let coCandidates = $derived(
    assignees.filter(a => a !== 'Unassigned' && a !== task.assigned_to && !coAssignees.includes(a)),
  )
  function addCoAssignee(e: Event & { currentTarget: HTMLSelectElement }) {
    const name = e.currentTarget.value
    e.currentTarget.value = ''
    if (name) onFieldUpdate(task._id, 'co_assignees', [...coAssignees, name])
  }
  const removeCoAssignee = (name: string) =>
    onFieldUpdate(task._id, 'co_assignees', coAssignees.filter(n => n !== name))

  // ── Checklist (shared punch list) ───────────────────────────────────────────
  let clItems = $derived(task.checklist ?? [])
  let clDone = $derived(clItems.filter(i => i.done).length)
  let clText = $state('')
  let clBusy = $state(false)
  async function addChecklistItem() {
    const t = clText.trim()
    if (!t || !onAddChecklist) return
    clBusy = true
    try {
      await onAddChecklist(task._id, t)
      clText = ''
    } finally {
      clBusy = false
    }
  }
  function clKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addChecklistItem()
    }
  }
  const doneTip = (i: { done_by?: string; done_at?: string }) => {
    if (!i.done_by && !i.done_at) return undefined
    const when = i.done_at ? new Date(i.done_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
    return `Done${i.done_by ? ` by ${i.done_by}` : ''}${when ? ` · ${when}` : ''}`
  }

  // ── Activity log (system timeline: created / replies / parsed files) ───────
  let activity = $derived((task.timeline ?? []).filter(e => e.kind !== 'comment'))
  const KIND_ICON: Record<string, string> = { created: '✨', email: '📩', attachment: '📎', system: '🛠️' }
  function entryDate(e: TimelineEntry): string {
    const d = new Date(e.at)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Esc anywhere in the sheet closes it. Save pending notes on the way out so a
  // half-typed note isn't lost when the sheet is dismissed.
  function close() {
    saveNotes()
    onClose()
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }

  let inbox = $derived(task.source_mailbox ? task.source_mailbox.split('@')[0] : '')
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Backdrop: click closes (the panel stops propagation). -->
<div class="sheet-backdrop" onclick={close} aria-hidden="true"></div>

<div
  class="sheet"
  role="dialog"
  aria-modal="true"
  aria-label="Task details — {task.title}"
  style:border-top="4px solid {meta.color}"
>
  <header class="sheet-head">
    <span class="status-pill" style:background={meta.bg} style:color={meta.text}>{meta.icon} {task.status}</span>
    <button class="sheet-close" onclick={close} aria-label="Close task details">✕</button>
  </header>

  <h2 class="sheet-title">{task.title}</h2>

  <div class="sheet-meta">
    <span class="src">{source}</span>
    {#if createdFull}<span class="src" title="Created {createdFull}">🗓 {createdFull}</span>{/if}
    {#if isAdmin && task.source_mailbox}
      <span class="src" title="Flagged in {task.source_mailbox}">📥 {inbox}</span>
    {/if}
    {#if task.po}<span class="po-chip">🧾 PO {task.po}</span>{/if}
  </div>

  {#if storeNums.length}
    <div class="store-tags">
      {#each storeNums as n}
        <button
          type="button"
          class="store-tag"
          onclick={() => { onStoreFilter?.(n); close() }}
          title="Filter the board by store #{n}"
        >#{n}</button>
      {/each}
    </div>
  {/if}

  <!-- ── Edit fields ──────────────────────────────────────────────────── -->
  <section class="fields">
    <label class="field">
      <span class="field-label">Status</span>
      <select
        value={task.status}
        style:border-color={meta.color}
        onchange={(e) => onFieldUpdate(task._id, 'status', e.currentTarget.value)}
      >
        {#each KANBAN_STATUSES as s}<option value={s}>{s}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span class="field-label">Assignee</span>
      <select
        value={task.assigned_to || 'Unassigned'}
        onchange={(e) => onFieldUpdate(task._id, 'assigned_to', e.currentTarget.value)}
      >
        {#each assignees as a}<option value={a}>{a}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span class="field-label">Due date</span>
      <input
        type="date"
        class:overdue
        title={overdue ? 'Overdue' : undefined}
        value={task.date ?? ''}
        onchange={(e) => onFieldUpdate(task._id, 'date', e.currentTarget.value)}
      />
    </label>
    <div class="field">
      <span class="field-label">Also assigned</span>
      <div class="co-row">
        {#each coAssignees as name (name)}
          <span class="chip co-chip" title="Also assigned to {name}">
            👥 {name}
            <button
              type="button"
              class="co-remove"
              onclick={() => removeCoAssignee(name)}
              aria-label="Remove {name} from this task"
              title="Remove {name}"
            >✕</button>
          </span>
        {/each}
        {#if coCandidates.length}
          <select class="co-add" aria-label="Add another person" title="Assign another person" onchange={addCoAssignee}>
            <option value="" selected>＋👤</option>
            {#each coCandidates as a}<option value={a}>{a}</option>{/each}
          </select>
        {:else if !coAssignees.length}
          <span class="co-none">—</span>
        {/if}
      </div>
    </div>
  </section>

  {#if task.quote}
    <section class="sect">
      <h3 class="sect-title">💰 Quote</h3>
      <div class="quote-grid">
        <label class="field">
          <span class="field-label">Stage</span>
          <select
            value={task.quote_status ?? 'Draft'}
            style:border-color={qMeta.color}
            onchange={(e) => onFieldUpdate(task._id, 'quote_status', e.currentTarget.value)}
          >
            {#each QUOTE_STATUSES as qs}<option value={qs}>{qs}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Amount</span>
          <input
            type="text"
            value={task.quote ?? ''}
            placeholder="e.g. $12,000"
            onchange={(e) => onFieldUpdate(task._id, 'quote', e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span class="field-label">Type</span>
          <select
            value={task.quote_type ?? QUOTE_TYPES[0]}
            onchange={(e) => onFieldUpdate(task._id, 'quote_type', e.currentTarget.value)}
          >
            {#each QUOTE_TYPES as qt}<option value={qt}>{qt}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Estimator</span>
          <select
            value={task.quote_assignee ?? QUOTE_PEOPLE[0]}
            onchange={(e) => onFieldUpdate(task._id, 'quote_assignee', e.currentTarget.value)}
          >
            {#each QUOTE_PEOPLE as qp}<option value={qp}>{qp}</option>{/each}
          </select>
        </label>
      </div>
    </section>
  {/if}

  {#if task.description}
    <section class="sect">
      <h3 class="sect-title">Summary</h3>
      <p class="desc">{task.description}</p>
    </section>
  {/if}

  <section class="sect">
    <h3 class="sect-title">📝 Note</h3>
    <textarea
      bind:value={notesValue}
      rows="3"
      placeholder="Add a note…"
      oninput={() => { notesDirty = true }}
      onblur={saveNotes}
    ></textarea>
  </section>

  {#if onAddChecklist}
    <section class="sect">
      <h3 class="sect-title">☑ Checklist{#if clItems.length}&nbsp;({clDone}/{clItems.length}){/if}</h3>
      <div class="cl-list">
        {#each clItems as item (item.id)}
          <div class="cl-row" class:done={item.done}>
            <input
              type="checkbox"
              id="cl-{item.id}"
              checked={item.done}
              onchange={() => onToggleChecklist?.(task._id, item.id, !item.done)}
            />
            <label class="cl-text" for="cl-{item.id}" title={doneTip(item)}>{item.text}</label>
            {#if onDeleteChecklist}
              <button
                type="button"
                class="cl-del"
                onclick={() => onDeleteChecklist?.(task._id, item.id)}
                aria-label="Remove checklist item"
                title="Remove"
              >✕</button>
            {/if}
          </div>
        {/each}
      </div>
      <input
        class="cl-add"
        type="text"
        maxlength="300"
        placeholder="Add an item — Enter to save"
        bind:value={clText}
        disabled={clBusy}
        onkeydown={clKeydown}
      />
    </section>
  {/if}

  {#if task.full_body}
    <section class="sect">
      <details>
        <summary class="sect-title email-summary">📄 Full email</summary>
        {#if mounted}<div class="email-body">{@html safeBody}</div>{/if}
      </details>
    </section>
  {/if}

  {#if onUploadAttachment || task.attachments?.length || task.attachment_ids?.length}
    <section class="sect">
      <h3 class="sect-title">📎 Attachments</h3>
      <CardAttachments
        taskId={task._id}
        attachments={task.attachments?.length
          ? task.attachments
          : (task.attachment_ids ?? []).map(id => ({ id, filename: id, size: 0, content_type: '' }))}
        {onUploadAttachment}
        {onDeleteAttachment}
      />
    </section>
  {/if}

  {#if onComment}
    <section class="sect">
      <h3 class="sect-title">💬 Comments</h3>
      <CardComments
        taskId={task._id}
        timeline={task.timeline}
        {mentionCandidates}
        {currentUserName}
        {currentUserEmail}
        {isAdmin}
        {onComment}
        {onEditComment}
        {onDeleteComment}
        {onReact}
      />
    </section>
  {/if}

  {#if activity.length}
    <section class="sect">
      <h3 class="sect-title">Activity</h3>
      <ul class="activity">
        {#each activity as e}
          <li class="act-row">
            <span class="act-icon">{KIND_ICON[e.kind] ?? '•'}</span>
            <span class="act-text">{e.text}{#if e.from}<span class="act-from"> — {e.from}</span>{/if}</span>
            <span class="act-date">{entryDate(e)}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <footer class="sheet-foot">
    <button class="danger" onclick={() => { onDelete(task._id); onClose() }}>🗑 Delete task</button>
  </footer>
</div>

<style>
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.42);
    z-index: 60;
  }
  .sheet {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(480px, 100vw);
    background: var(--card-bg);
    border-left: 1px solid var(--border);
    box-shadow: -12px 0 40px rgba(15, 23, 42, 0.18);
    z-index: 61;
    overflow-y: auto;
    padding: 16px 18px calc(24px + env(safe-area-inset-bottom));
    animation: slide-in 0.18s ease-out;
  }
  @keyframes slide-in {
    from { transform: translateX(40px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet { animation: none; }
  }

  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: 999px;
    padding: 3px 11px;
    font-size: 12px;
    font-weight: 700;
  }
  .sheet-close {
    background: transparent;
    border: none;
    color: var(--text-faint);
    font-size: 16px;
    padding: 6px 9px;
    border-radius: 8px;
    cursor: pointer;
    line-height: 1;
    min-height: 0;
  }
  .sheet-close:hover { color: var(--text); background: var(--bg); }

  .sheet-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.35;
    margin: 0 0 8px;
  }
  .sheet-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }
  .src { font-size: 12px; color: var(--text-faint); }
  .po-chip {
    display: inline-block;
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .store-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
  .store-tag {
    background: #1e3a8a;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1.5;
    min-height: 0;
    cursor: pointer;
  }
  .store-tag:hover { background: #1e40af; }

  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
  }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-faint);
  }
  .co-row { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; min-height: 30px; }
  .co-none { color: var(--text-faint); font-size: 12px; }
  .chip {
    background: var(--chip-bg);
    color: var(--primary-text);
    border-radius: 20px;
    padding: 2px 9px;
    font-size: 11px;
    font-weight: 500;
  }
  .co-chip { display: inline-flex; align-items: center; gap: 4px; }
  .co-remove {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 1px;
    font-size: 10px;
    line-height: 1;
    color: var(--primary-text);
    opacity: 0.6;
    min-height: 0;
  }
  .co-remove:hover { opacity: 1; color: #ef4444; }
  .co-add {
    width: auto;
    min-height: 0;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-soft);
    background: var(--bg);
    border: 1px dashed var(--border);
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }
  .co-add:hover { border-color: var(--primary); color: var(--primary-text); }

  .sect { margin-bottom: 14px; }
  .sect-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin: 0 0 6px;
  }
  .email-summary { cursor: pointer; user-select: none; }
  .desc {
    font-size: 13px;
    color: var(--text-soft);
    line-height: 1.5;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .quote-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  /* Checklist rows: checkbox + text (struck when done) + hover delete. */
  .cl-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
  .cl-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 4px;
    border-radius: 6px;
  }
  .cl-row:hover { background: var(--bg); }
  .cl-row input[type="checkbox"] {
    width: 15px;
    height: 15px;
    margin: 0;
    flex-shrink: 0;
    accent-color: var(--primary);
    align-self: center;
  }
  .cl-text {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 13px;
    color: var(--text-body);
    line-height: 1.45;
    cursor: pointer;
    word-break: break-word;
  }
  .cl-row.done .cl-text {
    color: var(--text-faint);
    text-decoration: line-through;
  }
  .cl-del {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    color: var(--text-faint);
    min-height: 0;
    flex-shrink: 0;
    opacity: 0;
  }
  .cl-row:hover .cl-del, .cl-del:focus-visible { opacity: 1; }
  .cl-del:hover { color: #ef4444; background: #fee2e2; }

  .email-body {
    font-size: 12px;
    color: var(--text-soft);
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    margin-top: 6px;
    background: var(--bg);
  }

  .activity { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .act-row { display: flex; align-items: baseline; gap: 7px; font-size: 12px; }
  .act-icon { flex-shrink: 0; }
  .act-text { color: var(--text-soft); line-height: 1.4; min-width: 0; }
  .act-from { color: var(--text-faint); }
  .act-date { margin-left: auto; flex-shrink: 0; color: var(--text-faint); font-size: 11px; }

  select, input[type="date"], input[type="text"], textarea {
    font-size: 13px;
    padding: 6px 9px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--card-bg);
    color: var(--text-body);
    width: 100%;
    box-sizing: border-box;
    outline: none;
  }
  input[type="date"] {
    -webkit-appearance: none;
    appearance: none;
    text-align: left;
  }
  input[type="date"]::-webkit-date-and-time-value {
    text-align: left;
    margin: 0;
    padding: 0;
    font-size: 13px;
  }
  input[type="date"].overdue {
    border-color: #fecaca;
    color: #b06a72;
  }
  select:focus, input:focus, textarea:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(99,102,241,0.12);
  }
  textarea { resize: vertical; font-family: inherit; }

  .sheet-foot {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
  }
  .danger {
    background: transparent;
    border: 1px solid #fecaca;
    color: #dc2626;
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    min-height: 0;
  }
  .danger:hover { background: #fee2e2; }

  @media (max-width: 768px) {
    /* Full-screen sheet on phones; finger-sized controls, 16px to stop iOS zoom. */
    .sheet { width: 100vw; border-left: none; padding-top: max(14px, env(safe-area-inset-top)); }
    select, input[type="date"], input[type="text"], textarea {
      font-size: 16px;
      min-height: 44px;
      padding: 9px 10px;
    }
    input[type="date"]::-webkit-date-and-time-value { font-size: 16px; }
    textarea { min-height: 56px; }
    .co-add { font-size: 16px; min-height: 36px; padding: 4px 10px; width: auto; }
    .co-remove { font-size: 13px; padding: 2px 5px; }
    .sheet-close { min-width: 44px; min-height: 44px; }
  }
</style>
