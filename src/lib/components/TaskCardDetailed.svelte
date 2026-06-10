<script lang="ts">
  // The DETAILED card face — the board's optional "everything on the card"
  // density (Cards: Detailed in the toolbar). This is the classic V1 card:
  // inline status/assignee/date/quote editing plus the Email / Note /
  // Attachments / Comments accordion, so daily edits never leave the column.
  // The compact face (TaskCard) is the default; both open the same
  // CardDetailSheet — here via the ⤢ chip in the tool row.
  import { onMount } from 'svelte'
  import { dragHandle } from 'svelte-dnd-action'
  import DOMPurify from 'dompurify'
  import type { Task, Attachment } from '$lib/types'
  import { KANBAN_STATUSES, QUOTE_TYPES, QUOTE_PEOPLE, QUOTE_STATUSES, QUOTE_STATUS_META, STATUS_META } from '$lib/constants'
  import { extractStoreNumbers } from '$lib/storeNumbers'
  import { agingLevel, daysInColumn } from '$lib/aging'
  import CardComments from './CardComments.svelte'
  import CardAttachments from './CardAttachments.svelte'

  let {
    task,
    assignees,
    mentionCandidates = [],
    currentUserName = '',
    currentUserEmail = '',
    onFieldUpdate,
    onDelete,
    onOpen,
    onToggleSelect,
    selected = false,
    onStoreFilter,
    onComment,
    onEditComment,
    onDeleteComment,
    onReact,
    onUploadAttachment,
    onDeleteAttachment,
    activeStores = [],
    hidden = false,
    isAdmin = false,
  }: {
    task: Task
    assignees: string[]
    mentionCandidates?: string[]
    currentUserName?: string
    currentUserEmail?: string
    onFieldUpdate: (id: string, field: string, value: unknown) => void
    onDelete: (id: string) => void
    onOpen?: (id: string) => void
    onToggleSelect?: (id: string) => void
    selected?: boolean
    onStoreFilter?: (n: string) => void
    onComment?: (id: string, text: string, parentId?: string) => void
    onEditComment?: (id: string, commentId: string, text: string) => void
    onDeleteComment?: (id: string, commentId: string) => void
    onReact?: (id: string, commentId: string, emoji: string) => void
    onUploadAttachment?: (id: string, file: File) => Promise<void> | void
    onDeleteAttachment?: (id: string, attId: string) => void
    activeStores?: string[]
    hidden?: boolean
    isAdmin?: boolean
  } = $props()

  let meta = $derived(STATUS_META[task.status] ?? STATUS_META['To Do'])

  // Raw email HTML is rendered client-side only: {@html} of (often malformed)
  // email markup parses differently server-side vs in the browser, which breaks
  // hydration. Deferring to after mount makes the SSR and initial client render
  // match (both render nothing), then fills it in on the client.
  let mounted = $state(false)
  onMount(() => { mounted = true })

  // Sanitize the raw email HTML before injecting it (stored-XSS guard against
  // crafted emails, e.g. <img onerror>, <svg onload>). Gated on `mounted` so
  // DOMPurify only runs in the browser, where it has a DOM/window.
  let safeBody = $derived(mounted ? DOMPurify.sanitize(task.full_body ?? '') : '')

  // Local editable notes to avoid resetting while user types
  // Local editable copy — task prop won't reactively update notesValue while user types
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

  // Prefer the server-extracted field (covers stores found in the email body);
  // fall back to deriving from the title for tasks created before that field.
  let storeNums = $derived(task.store_numbers ?? extractStoreNumbers(task.title))

  // Quote pipeline stage (unset → Draft).
  let qStatus = $derived(task.quote_status ?? 'Draft')
  let qMeta = $derived(QUOTE_STATUS_META[qStatus] ?? QUOTE_STATUS_META['Draft'])

  // Past-due and still open → flag the date red.
  let overdue = $derived(
    !!task.date &&
    task.date < new Date().toISOString().slice(0, 10) &&
    task.status !== 'Done' &&
    task.status !== 'Cancelled',
  )

  // Aging: how long the card has sat in this column (active columns only).
  let aging = $derived(agingLevel(task, new Date()))
  let agedDays = $derived(daysInColumn(task, new Date()))
  let source = $derived(
    task.exchange_id
      ? `📩 ${task.sender_name || task.sender_email || 'Email'}`
      : `✏️ ${task.created_by || 'Manual'}`
  )

  // ── Created date (when this to-do was opened) ───────────────────────────────
  let createdShort = $derived.by(() => {
    const d = new Date(task.created_at)
    if (Number.isNaN(d.getTime())) return ''
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
  })
  let createdFull = $derived.by(() => {
    const d = new Date(task.created_at)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  })

  // ── Co-assignees (a task can be assigned to several people) ────────────────
  let coAssignees = $derived(task.co_assignees ?? [])
  // Who can still be added: the roster minus the sentinel, the primary assignee,
  // and people already on the task.
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

  // Which PM inbox this was flagged in (admin-only chip); show the local part,
  // full address in the tooltip.
  let inbox = $derived(task.source_mailbox ? task.source_mailbox.split('@')[0] : '')

  // ── Attachments ───────────────────────────────────────────────────────────
  // Prefer the metadata list (has filename + size); fall back to the legacy
  // id-only array for tasks created before metadata was stored, where the id is
  // all we can show. Rendered by CardAttachments; the count feeds the 📎 chip.
  let attachments = $derived<Attachment[]>(
    task.attachments?.length
      ? task.attachments
      : (task.attachment_ids ?? []).map(id => ({ id, filename: id, size: 0, content_type: '' })),
  )

  // ── Comments (rendered by CardComments; the count feeds the 💬 chip) ───────
  let commentCount = $derived((task.timeline ?? []).filter(e => e.kind === 'comment').length)

  // ── Checklist (managed in the detail sheet; the ☑ chip opens it) ──────────
  let clTotal = $derived((task.checklist ?? []).length)
  let clDone = $derived((task.checklist ?? []).filter(i => i.done).length)

  // ── Footer tool bar (accordion) ─────────────────────────────────────────────
  // The Email / Note / Attachments / Comments disclosures collapse into a single
  // horizontal chip row; tapping a chip opens its panel below and closes the
  // others (one at a time), so a collapsed card stays short.
  type Panel = 'email' | 'notes' | 'attachments' | 'comments'
  let openPanel = $state<Panel | null>(null)
  const togglePanel = (p: Panel) => { openPanel = openPanel === p ? null : p }
  let hasNote = $derived(!!notesValue.trim())
  let showAttachChip = $derived(!!onUploadAttachment || attachments.length > 0)
</script>

<div class="card" id="task-{task._id}" class:card-hidden={hidden} class:selected style:border-top="3px solid {meta.color}">
  {#if onToggleSelect}
    <!-- Multi-select toggle — shown on hover/focus (always when selected). -->
    <button
      type="button"
      class="select-box"
      class:on={selected}
      role="checkbox"
      aria-checked={selected}
      aria-label="Select task — {task.title}"
      title={selected ? 'Deselect' : 'Select for bulk actions'}
      onclick={(e) => { e.stopPropagation(); onToggleSelect?.(task._id) }}
    >{selected ? '✓' : ''}</button>
  {/if}
  <!-- Drag handle — the ONLY element that initiates a drag, so the rest of the
       card (quote dropdown, selects, notes, links) stays tappable/scrollable. -->
  <div class="drag-hint" use:dragHandle aria-label="Drag to move this task">⠿⠿</div>

  <!-- Title -->
  <div class="title">{task.title}</div>

  <!-- Store number tags -->
  {#if storeNums.length}
    <div class="store-tags">
      {#each storeNums as n}
        <button
          type="button"
          class="store-tag"
          class:active={activeStores.includes(n)}
          onclick={() => onStoreFilter?.(n)}
          title="Filter the board by store #{n}"
        >#{n}</button>
      {/each}
    </div>
  {/if}

  <!-- PO (from a reply or a parsed attachment) -->
  {#if task.po}
    <div class="po-row"><span class="po-chip">🧾 PO {task.po}</span></div>
  {/if}

  <!-- Source + created date + assignees -->
  <div class="meta-row">
    <span class="source">{source}</span>
    {#if createdShort}
      <span class="created-chip" title="Created {createdFull}">🗓 {createdShort}</span>
    {/if}
    {#if aging !== 'none'}
      <span class="aging-chip" class:alert={aging === 'alert'} title="In {task.status} for {agedDays} days">⏳ {agedDays}d</span>
    {/if}
    {#if task.assigned_to && task.assigned_to !== 'Unassigned'}
      <span class="chip">👤 {task.assigned_to}</span>
    {:else}
      <span class="unassigned">Unassigned</span>
    {/if}
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
        {#each coCandidates as a}
          <option value={a}>{a}</option>
        {/each}
      </select>
    {/if}
    {#if isAdmin && task.source_mailbox}
      <span class="inbox-chip" title="Flagged in {task.source_mailbox}">📥 {inbox}</span>
    {/if}
  </div>

  <!-- LLM summary shown by default (at-a-glance context); the full email is one
       tap away behind the 📄 Email chip in the footer tool bar below. -->
  {#if task.description}
    <p class="desc">
      {task.description.slice(0, 200)}{task.description.length > 200 ? '…' : ''}
    </p>
  {/if}
  <!-- Status + Assignee selects -->
  <div class="row-2">
    <select
      value={task.status}
      style:border-color={meta.color}
      onchange={(e) => onFieldUpdate(task._id, 'status', e.currentTarget.value)}
    >
      {#each KANBAN_STATUSES as s}
        <option value={s}>{s}</option>
      {/each}
    </select>

    <select
      value={task.assigned_to || 'Unassigned'}
      onchange={(e) => onFieldUpdate(task._id, 'assigned_to', e.currentTarget.value)}
    >
      {#each assignees as a}
        <option value={a}>{a}</option>
      {/each}
    </select>
  </div>

  <!-- Date + Quote -->
  <div class="row-2" class:single={!task.quote}>
    <input
      type="date"
      class:overdue
      title={overdue ? 'Overdue' : undefined}
      value={task.date ?? ''}
      onchange={(e) => onFieldUpdate(task._id, 'date', e.currentTarget.value)}
    />

    {#if task.quote}
      <details class="quote-pop">
        <summary>
          💰 {task.quote}
          <span class="qs-badge" style:background={qMeta.bg} style:color={qMeta.text}>{qStatus}</span>
        </summary>
        <div class="pop-body">
          <select
            class="qs-select"
            value={task.quote_status ?? 'Draft'}
            onchange={(e) => onFieldUpdate(task._id, 'quote_status', e.currentTarget.value)}
          >
            {#each QUOTE_STATUSES as qs}
              <option value={qs}>{qs}</option>
            {/each}
          </select>
          <select
            value={task.quote_type ?? QUOTE_TYPES[0]}
            onchange={(e) => onFieldUpdate(task._id, 'quote_type', e.currentTarget.value)}
          >
            {#each QUOTE_TYPES as qt}
              <option value={qt}>{qt}</option>
            {/each}
          </select>
          <select
            value={task.quote_assignee ?? QUOTE_PEOPLE[0]}
            onchange={(e) => onFieldUpdate(task._id, 'quote_assignee', e.currentTarget.value)}
          >
            {#each QUOTE_PEOPLE as qp}
              <option value={qp}>{qp}</option>
            {/each}
          </select>
          <input
            type="text"
            value={task.quote ?? ''}
            placeholder="Amount e.g. $12,000"
            onchange={(e) => onFieldUpdate(task._id, 'quote', e.currentTarget.value)}
          />
        </div>
      </details>
    {/if}
  </div>

  <!-- Footer tool bar — Email / Note / Attachments / Comments collapse into one
       chip row; the active chip's panel expands below (accordion, one at a time)
       so a collapsed card stays short. -->
  <!-- Icon-only chips (tooltips name each) so all four — incl. 📄 Email and the
       count chips — always sit on one row in a ~240px column. -->
  <div class="card-tools">
    {#if task.full_body}
      <button type="button" class="tool-chip" class:active={openPanel === 'email'} aria-expanded={openPanel === 'email'} aria-label="Full email" title="Full email" onclick={() => togglePanel('email')}>📄</button>
    {/if}
    <button type="button" class="tool-chip" class:active={openPanel === 'notes'} aria-expanded={openPanel === 'notes'} aria-label={hasNote ? 'Note (has content)' : 'Note'} title={hasNote ? 'Note (has content)' : 'Add a note'} onclick={() => togglePanel('notes')}>
      📝{#if hasNote}<span class="tool-dot"></span>{/if}
    </button>
    {#if showAttachChip}
      <button type="button" class="tool-chip" class:active={openPanel === 'attachments'} aria-expanded={openPanel === 'attachments'} aria-label="Attachments" title="Attachments" onclick={() => togglePanel('attachments')}>📎{#if attachments.length}&nbsp;{attachments.length}{/if}</button>
    {/if}
    {#if onComment}
      <button type="button" class="tool-chip" class:active={openPanel === 'comments'} aria-expanded={openPanel === 'comments'} aria-label="Comments" title="Comments" onclick={() => togglePanel('comments')}>💬{#if commentCount}&nbsp;{commentCount}{/if}</button>
    {/if}
    {#if clTotal}
      <button type="button" class="tool-chip" aria-label="Checklist — {clDone} of {clTotal} done (open details)" title="Checklist — {clDone}/{clTotal} (manage in details)" onclick={() => onOpen?.(task._id)}>☑&nbsp;{clDone}/{clTotal}</button>
    {/if}
    {#if onOpen}
      <button type="button" class="tool-chip" aria-label="Open full details" title="Open full details" onclick={() => onOpen?.(task._id)}>⤢</button>
    {/if}
  </div>

  {#if openPanel === 'email' && task.full_body}
    <div class="tool-panel">
      {#if mounted}<div class="email-body">{@html safeBody}</div>{/if}
    </div>
  {/if}
  {#if openPanel === 'notes'}
    <div class="tool-panel">
      <textarea
        bind:value={notesValue}
        rows="3"
        placeholder="Add a note…"
        oninput={() => { notesDirty = true }}
        onblur={saveNotes}
      ></textarea>
    </div>
  {/if}

  <!-- Attachments panel (opened from the 📎 chip). The chip only shows when there
       are files or an uploader; the panel additionally guards on the open chip so
       just the active section renders. -->
  {#if openPanel === 'attachments' && (onUploadAttachment || attachments.length)}
    <div class="tool-panel">
      <CardAttachments
        taskId={task._id}
        {attachments}
        {onUploadAttachment}
        {onDeleteAttachment}
      />
    </div>
  {/if}

  <!-- Comments + @mentions -->
  {#if onComment && openPanel === 'comments'}
    <div class="tool-panel">
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
    </div>
  {/if}

  <!-- Delete -->
  <button class="delete-btn" onclick={() => onDelete(task._id)} title="Delete task" aria-label="Delete task">
    ✕
  </button>
</div>

<style>
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border-card);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 8px;
    position: relative;
    box-shadow: var(--shadow);
    transition: box-shadow 0.18s, transform 0.18s;
  }
  .card:hover {
    box-shadow: var(--shadow-hover);
    transform: translateY(-2px);
  }
  /* Respect reduced-motion: drop the hover lift, keep the resting shadow. */
  @media (prefers-reduced-motion: reduce) {
    .card:hover { transform: none; box-shadow: var(--shadow); }
  }

  .drag-hint {
    position: absolute;
    top: 2px;
    right: 2px;
    padding: 6px 8px;
    color: var(--text-faint);
    font-size: 15px;
    line-height: 1;
    letter-spacing: -2px;
    user-select: none;
    cursor: grab;
    /* touch starting on the handle initiates a drag instead of scrolling */
    touch-action: none;
    border-radius: 6px;
  }
  .drag-hint:active { cursor: grabbing; }

  .card.selected {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
  }
  /* Multi-select toggle: top-right beside the drag handle, materializes on
     hover/focus, pinned while selected. Mirrors the compact face. */
  .select-box {
    position: absolute;
    top: 6px;
    right: 34px;
    width: 18px;
    height: 18px;
    border: 1.5px solid var(--border);
    border-radius: 5px;
    background: var(--card-bg);
    color: #fff;
    font-size: 12px;
    line-height: 1;
    padding: 0;
    min-height: 0;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s;
    z-index: 2;
  }
  .card:hover .select-box,
  .select-box:focus-visible,
  .select-box.on { opacity: 1; }
  .select-box.on {
    background: var(--primary);
    border-color: var(--primary);
  }

  .title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.4;
    margin-bottom: 6px;
    padding-right: 56px; /* clears the drag handle + select toggle */
  }

  .po-row { margin-bottom: 6px; }
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

  .store-tags {
    margin-bottom: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .store-tag {
    background: #1e3a8a;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    font-family: inherit;
    line-height: 1.4;
    min-height: 0;          /* override the global 44px button min-height */
    cursor: pointer;
  }
  .store-tag:hover { background: #1e40af; }
  /* The store currently filtering the board. */
  .store-tag.active {
    background: var(--primary);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.35);
  }

  /* Hidden by an active store filter (kept in the DOM/dnd list, just not shown). */
  .card-hidden { display: none; }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .source { font-size: 11px; color: var(--text-faint); }
  .chip {
    background: var(--chip-bg);
    color: var(--primary-text);
    border-radius: 20px;
    padding: 2px 9px;
    font-size: 11px;
    font-weight: 500;
  }
  .unassigned { font-size: 11px; color: var(--text-faint); }
  .created-chip { font-size: 11px; color: var(--text-faint); white-space: nowrap; }
  /* Aging: past the warn threshold (amber) / alert threshold (rose) in this column. */
  .aging-chip {
    font-size: 11px;
    font-weight: 600;
    color: #92670e;
    border: 1px solid #fde68a;
    border-radius: 20px;
    padding: 2px 8px;
    white-space: nowrap;
  }
  .aging-chip.alert {
    color: #b06a72;
    border-color: #fecaca;
  }
  /* Co-assignee chip: same pill as the primary, plus an inline remove ✕. */
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
  /* "＋👤" add-person picker — a select dressed as a dashed chip; the native
     dropdown does the rest (works the same on touch). Overrides the generic
     full-width select rule below. */
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
  /* Admin-only: which PM inbox this email was flagged in. */
  .inbox-chip {
    background: var(--border-soft);
    color: var(--text-muted, #64748b);
    border-radius: 20px;
    padding: 2px 9px;
    font-size: 11px;
    font-weight: 500;
  }

  .desc {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 6px;
    line-height: 1.45;
  }

  /* Footer tool bar: Email / Note / Attachments / Comments as one horizontal chip
     row (accordion). Replaces the four stacked full-width disclosure links so a
     collapsed card stays compact. */
  .card-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
    margin-bottom: 6px;
  }
  /* Snug padding/gaps so all four chips (incl. 📄 Email) fit one row in a ~240px
     column instead of wrapping 💬 to a second line. nowrap keeps a chip intact. */
  .tool-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-soft);
    border-radius: 999px;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    min-height: 0;
    cursor: pointer;
    white-space: nowrap;
  }
  .tool-chip:hover { border-color: var(--primary); color: var(--primary-text); }
  .tool-chip.active {
    background: var(--chip-bg);
    border-color: var(--primary);
    color: var(--primary-text);
  }
  /* Small filled dot on the Note chip when a note already exists. */
  .tool-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--primary);
  }
  /* The expanded panel for whichever chip is active. Bottom room clears the
     absolutely-positioned ✕ delete button when a panel (esp. comments) is open. */
  .tool-panel { margin-top: 2px; margin-bottom: 22px; }

  .email-body {
    font-size: 11px;
    color: var(--text-soft);
    max-height: 120px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    margin-top: 4px;
    background: var(--bg);
  }

  .row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 6px;
  }
  /* No quote → let the date field take the full width instead of a lone half box */
  .row-2.single { grid-template-columns: 1fr; }

  select, input[type="date"], input[type="text"], textarea {
    font-size: 12px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card-bg);
    color: var(--text-body);
    width: 100%;
    box-sizing: border-box;
    outline: none;
  }
  /* iOS Safari renders <input type="date"> taller than other fields and centers
     its value via an internal pseudo-element. Strip the native appearance and
     normalize the value so it matches the selects / quote box beside it. */
  input[type="date"] {
    -webkit-appearance: none;
    appearance: none;
    text-align: left;
  }
  input[type="date"]::-webkit-date-and-time-value {
    text-align: left;
    margin: 0;
    padding: 0;
    font-size: 12px;
  }
  /* Overdue, still-open task → a calm, muted nudge — NOT a bold red box. A soft
     border + desaturated rose text (plus the title="Overdue" tooltip) is enough;
     no fill and no bold weight, so it doesn't shout (especially full-width on
     mobile). */
  input[type="date"].overdue {
    border-color: #fecaca;
    color: #b06a72;
  }
  select:focus, input:focus, textarea:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(99,102,241,0.12);
  }
  textarea { resize: none; font-family: inherit; }

  .quote-pop summary {
    font-size: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 5px 8px;
    cursor: pointer;
    user-select: none;
  }
  .qs-badge {
    display: inline-block;
    border-radius: 999px;
    padding: 0 7px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    vertical-align: middle;
  }
  .pop-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card-bg);
  }

  .delete-btn {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: transparent;
    border: none;
    color: var(--text-faint);
    font-size: 11px;
    padding: 2px 5px;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1;
    min-height: unset;
  }
  .delete-btn:hover { color: #ef4444; background: #fee2e2; }

  @media (max-width: 768px) {
    .card:hover { transform: none; box-shadow: var(--shadow); }
    /* Finger-sized hit areas for the two smallest controls on the card. */
    .drag-hint { padding: 11px 13px; font-size: 17px; }
    /* No hover on touch: keep the select toggle visible, finger-sized, clear
       of the enlarged drag handle. */
    .select-box { opacity: 1; width: 24px; height: 24px; font-size: 15px; right: 48px; }
    .delete-btn {
      min-width: 40px;
      min-height: 40px;
      font-size: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    /* The editable controls — selects, date, quote amount, notes. A 16px font
       stops iOS Safari from zooming the whole page on focus (it zooms anything
       <16px), and a 44px min-height makes them comfortable to tap. */
    select, input[type="date"], input[type="text"], textarea {
      font-size: 16px;
      min-height: 44px;
      padding: 9px 10px;
    }
    input[type="date"]::-webkit-date-and-time-value { font-size: 16px; }
    textarea { min-height: 56px; }

    /* Roomier tap targets on touch: the footer chips and the quote disclosure. */
    .tool-chip { padding: 7px 12px; font-size: 12px; }
    /* The add-person picker keeps its chip shape but gets a finger-sized target;
       16px stops iOS Safari from zooming the page when the picker opens. */
    .co-add { font-size: 16px; min-height: 36px; padding: 4px 10px; width: auto; }
    .co-remove { font-size: 13px; padding: 2px 5px; }
    .quote-pop summary {
      padding-top: 8px;
      padding-bottom: 8px;
    }
  }
</style>
