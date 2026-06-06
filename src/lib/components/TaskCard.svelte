<script lang="ts">
  import { onMount } from 'svelte'
  import { dragHandle } from 'svelte-dnd-action'
  import DOMPurify from 'dompurify'
  import type { Task } from '$lib/types'
  import { KANBAN_STATUSES, QUOTE_TYPES, QUOTE_PEOPLE, QUOTE_STATUSES, QUOTE_STATUS_META, STATUS_META } from '$lib/constants'
  import { extractStoreNumbers } from '$lib/storeNumbers'

  let {
    task,
    assignees,
    onFieldUpdate,
    onDelete,
    onStoreFilter,
    activeStore = null,
    hidden = false,
  }: {
    task: Task
    assignees: string[]
    onFieldUpdate: (id: string, field: string, value: unknown) => void
    onDelete: (id: string) => void
    onStoreFilter?: (n: string) => void
    activeStore?: string | null
    hidden?: boolean
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
  let source = $derived(
    task.exchange_id
      ? `📩 ${task.sender_name || task.sender_email || 'Email'}`
      : `✏️ ${task.created_by || 'Manual'}`
  )

  // Compact "Jun 5" stamp for activity-timeline entries.
  function fmtWhen(iso: string): string {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  // Newest activity first.
  let timeline = $derived([...(task.timeline ?? [])].reverse())
</script>

<div class="card" class:card-hidden={hidden} style:border-top="3px solid {meta.color}">
  <!-- Drag handle — the ONLY element that initiates a drag, so the rest of the
       card (quote dropdown, selects, notes, links) stays tappable/scrollable. -->
  <div class="drag-hint" use:dragHandle aria-label="Drag to move this task">⠿⠿</div>

  <!-- AI review flag — low-confidence extraction or a thread reply the PM should
       eyeball. One tap confirms and clears it. -->
  {#if task.needs_review}
    <div class="review-banner">
      <span class="rb-text">🔍 {task.review_reason || 'Needs review'}</span>
      <button class="rb-confirm" onclick={() => onFieldUpdate(task._id, 'needs_review', false)}>
        ✓ Looks good
      </button>
    </div>
  {/if}

  <!-- Title -->
  <div class="title">{task.title}</div>

  <!-- Store number tags -->
  {#if storeNums.length}
    <div class="store-tags">
      {#each storeNums as n}
        <button
          type="button"
          class="store-tag"
          class:active={n === activeStore}
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

  <!-- Source + assignee -->
  <div class="meta-row">
    <span class="source">{source}</span>
    {#if task.assigned_to && task.assigned_to !== 'Unassigned'}
      <span class="chip">👤 {task.assigned_to}</span>
    {:else}
      <span class="unassigned">Unassigned</span>
    {/if}
  </div>

  <!-- Description / email summary -->
  {#if task.description}
    <p class="desc">
      {task.description.slice(0, 200)}{task.description.length > 200 ? '…' : ''}
    </p>
    {#if task.full_body}
      <details class="email-expand">
        <summary>📄 Full Email</summary>
        {#if mounted}
          <div class="email-body">{@html safeBody}</div>
        {/if}
      </details>
    {/if}
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

  <!-- Notes -->
  {#if task.notes}
    <textarea
      bind:value={notesValue}
      rows="2"
      placeholder="Add notes…"
      oninput={() => { notesDirty = true }}
      onblur={saveNotes}
    ></textarea>
  {:else}
    <details class="notes-expand">
      <summary>📝 Add note</summary>
      <textarea
        rows="2"
        placeholder="Type a note…"
        oninput={(e) => { notesDirty = true; notesValue = e.currentTarget.value }}
        onblur={saveNotes}
      ></textarea>
    </details>
  {/if}

  <!-- Attachments -->
  {#if task.attachment_ids?.length}
    <details class="att-expand">
      <summary>📎 {task.attachment_ids.length} attachment(s)</summary>
      <div class="att-list">
        {#each task.attachment_ids as attId}
          <a href="/api/attachments/{attId}" class="att-link" download>
            ⬇️ {attId.slice(0, 20)}…
          </a>
        {/each}
      </div>
    </details>
  {/if}

  <!-- Activity timeline — how this card evolved (created, replies, parsed docs) -->
  {#if timeline.length}
    <details class="activity-expand">
      <summary>🕓 Activity ({timeline.length})</summary>
      <div class="activity-list">
        {#each timeline as entry}
          <div class="activity-item">
            <span class="ai-when">{fmtWhen(entry.at)}</span>
            <span class="ai-text">{entry.text}{#if entry.from}<span class="ai-from"> · {entry.from}</span>{/if}</span>
          </div>
        {/each}
      </div>
    </details>
  {/if}

  <!-- Delete -->
  <button class="delete-btn" onclick={() => onDelete(task._id)} title="Delete task">
    ✕
  </button>
</div>

<style>
  .card {
    background: #fff;
    border: 1px solid var(--border-card);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 8px;
    position: relative;
    box-shadow: 0 1px 4px rgba(15,23,42,0.06);
    transition: box-shadow 0.18s, transform 0.18s;
  }
  .card:hover {
    box-shadow: 0 6px 20px rgba(15,23,42,0.11);
    transform: translateY(-2px);
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

  .review-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 7px;
    padding: 5px 8px;
    margin-bottom: 8px;
    margin-right: 28px;            /* clear the drag handle */
  }
  .rb-text {
    font-size: 11px;
    font-weight: 600;
    color: #b45309;
    line-height: 1.35;
  }
  .rb-confirm {
    background: #fff;
    border: 1px solid #fbbf24;
    color: #b45309;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    min-height: 0;
    cursor: pointer;
  }
  .rb-confirm:hover { background: #fef3c7; }

  .title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.4;
    margin-bottom: 6px;
    padding-right: 30px;
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
    background: #e0e7ff;
    color: var(--primary-text);
    border-radius: 20px;
    padding: 2px 9px;
    font-size: 11px;
    font-weight: 500;
  }
  .unassigned { font-size: 11px; color: var(--text-faint); }

  .desc {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 6px;
    line-height: 1.45;
  }

  .email-expand summary,
  .notes-expand summary,
  .att-expand summary,
  .activity-expand summary {
    font-size: 11px;
    color: var(--primary);
    padding: 4px 0;
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
    border-left: 2px solid var(--border);
    padding-left: 8px;
  }
  .activity-item {
    display: flex;
    gap: 6px;
    font-size: 11px;
    line-height: 1.4;
  }
  .ai-when {
    color: var(--text-faint);
    font-weight: 600;
    flex-shrink: 0;
    min-width: 38px;
  }
  .ai-text { color: var(--text-soft); }
  .ai-from { color: var(--text-faint); }
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
    background: #fff;
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
  /* Overdue, still-open task → a soft red tint, not a loud box. The calm red
     text (plus the title="Overdue" tooltip) carries the signal; the border is a
     gentle red-200 and the fill a barely-there wash. */
  input[type="date"].overdue {
    border-color: #fecaca;
    color: #dc2626;
    background: #fef5f5;
    font-weight: 600;
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
    background: #fff;
  }

  .att-list { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .att-link {
    font-size: 11px;
    color: var(--primary-text);
    text-decoration: none;
    padding: 3px 0;
  }
  .att-link:hover { text-decoration: underline; }

  .delete-btn {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: transparent;
    border: none;
    color: #cbd5e1;
    font-size: 11px;
    padding: 2px 5px;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1;
    min-height: unset;
  }
  .delete-btn:hover { color: #ef4444; background: #fee2e2; }

  @media (max-width: 768px) {
    .card:hover { transform: none; box-shadow: 0 1px 4px rgba(15,23,42,0.06); }
    /* Finger-sized hit areas for the two smallest controls on the card. */
    .drag-hint { padding: 11px 13px; font-size: 17px; }
    .delete-btn {
      min-width: 40px;
      min-height: 40px;
      font-size: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
  }
</style>
