<script lang="ts">
  import { onMount } from 'svelte'
  import { dragHandle } from 'svelte-dnd-action'
  import DOMPurify from 'dompurify'
  import type { Task, TimelineEntry } from '$lib/types'
  import { KANBAN_STATUSES, QUOTE_TYPES, QUOTE_PEOPLE, QUOTE_STATUSES, QUOTE_STATUS_META, STATUS_META } from '$lib/constants'
  import { extractStoreNumbers } from '$lib/storeNumbers'
  import { REACTION_EMOJIS } from '$lib/reactions'

  let {
    task,
    assignees,
    mentionCandidates = [],
    currentUserName = '',
    currentUserEmail = '',
    onFieldUpdate,
    onDelete,
    onStoreFilter,
    onComment,
    onEditComment,
    onDeleteComment,
    onReact,
    activeStore = null,
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
    onStoreFilter?: (n: string) => void
    onComment?: (id: string, text: string, parentId?: string) => void
    onEditComment?: (id: string, commentId: string, text: string) => void
    onDeleteComment?: (id: string, commentId: string) => void
    onReact?: (id: string, commentId: string, emoji: string) => void
    activeStore?: string | null
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
  let source = $derived(
    task.exchange_id
      ? `📩 ${task.sender_name || task.sender_email || 'Email'}`
      : `✏️ ${task.created_by || 'Manual'}`
  )

  // Which PM inbox this was flagged in (admin-only chip); show the local part,
  // full address in the tooltip.
  let inbox = $derived(task.source_mailbox ? task.source_mailbox.split('@')[0] : '')

  // ── Comments + @mentions ──────────────────────────────────────────────────
  let allComments = $derived((task.timeline ?? []).filter(e => e.kind === 'comment'))
  let topComments = $derived(allComments.filter(c => !c.parent_id))
  const repliesTo = (id?: string) => allComments.filter(c => !!c.parent_id && c.parent_id === id)

  const myEmail = $derived((currentUserEmail ?? '').toLowerCase())
  // Edit/delete are allowed for your own comment (matched on login email) or any admin.
  function canModify(c: TimelineEntry): boolean {
    return isAdmin || (!!c.author_email && !!myEmail && c.author_email.toLowerCase() === myEmail)
  }
  const iReacted = (c: TimelineEntry, emoji: string) =>
    (c.reactions?.[emoji] ?? []).includes(currentUserName)

  const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? ''

  let commentText = $state('')
  let commentInput = $state<HTMLTextAreaElement>()

  function postComment() {
    const t = commentText.trim()
    if (!t || !onComment) return
    onComment(task._id, t)
    commentText = ''
    showMentions = false
  }

  // @-autocomplete: while the caret sits in an `@token`, offer matching names.
  let showMentions = $state(false)
  let mentionQuery = $state('')
  let mentionStart = $state(-1) // index of the '@' in the textarea value
  let mentionMatches = $derived(
    showMentions
      ? mentionCandidates
          .filter(c => firstWord(c).toLowerCase().startsWith(mentionQuery.toLowerCase()))
          .slice(0, 6)
      : [],
  )

  function onCommentInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
    const el = e.currentTarget
    const caret = el.selectionStart ?? el.value.length
    const m = el.value.slice(0, caret).match(/(?:^|\s)@([A-Za-z][A-Za-z0-9._-]*)?$/)
    if (m) {
      mentionQuery = m[1] ?? ''
      mentionStart = caret - mentionQuery.length - 1
      showMentions = true
    } else {
      showMentions = false
    }
  }

  function pickMention(name: string) {
    const fw = firstWord(name)
    const caret = commentInput?.selectionStart ?? commentText.length
    const before = commentText.slice(0, mentionStart)
    const after = commentText.slice(caret)
    const insert = `@${fw} `
    commentText = before + insert + after
    showMentions = false
    queueMicrotask(() => {
      const pos = (before + insert).length
      commentInput?.focus()
      commentInput?.setSelectionRange(pos, pos)
    })
  }

  function onComposeKeydown(e: KeyboardEvent) {
    if (showMentions && mentionMatches.length && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault()
      pickMention(mentionMatches[0])
      return
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      postComment()
    } else if (e.key === 'Escape') {
      showMentions = false
    }
  }

  // Split a posted comment into plain text + highlighted mention chips. A token is
  // highlighted only when it resolves to a known candidate (matches parseMentions).
  type Seg = { text: string; mention: boolean }
  function segments(text: string): Seg[] {
    const known = new Set(mentionCandidates.map(c => firstWord(c).toLowerCase()))
    const re = /(?:^|\s)(@[A-Za-z][A-Za-z0-9._-]*)/g
    const out: Seg[] = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const token = m[1]
      const at = m.index + m[0].length - token.length
      if (!known.has(token.slice(1).toLowerCase())) continue
      if (at > last) out.push({ text: text.slice(last, at), mention: false })
      out.push({ text: token, mention: true })
      last = at + token.length
    }
    if (last < text.length) out.push({ text: text.slice(last), mention: false })
    return out
  }

  function ago(iso: string): string {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  // ── Replies / edit / reactions ────────────────────────────────────────────
  let replyTo = $state<string | null>(null)
  let replyText = $state('')
  let editingId = $state<string | null>(null)
  let editText = $state('')
  let reactPickerFor = $state<string | null>(null)

  function startReply(id: string) { replyTo = id; replyText = ''; editingId = null }
  function submitReply(parentId: string) {
    const t = replyText.trim()
    if (!t || !onComment) return
    onComment(task._id, t, parentId)
    replyText = ''
    replyTo = null
  }

  function startEdit(c: TimelineEntry) { if (!c.id) return; editingId = c.id; editText = c.text; replyTo = null }
  function submitEdit(commentId: string) {
    const t = editText.trim()
    if (!t || !onEditComment) return
    onEditComment(task._id, commentId, t)
    editingId = null
  }

  function react(commentId: string, emoji: string) {
    onReact?.(task._id, commentId, emoji)
    reactPickerFor = null
  }
</script>

<div class="card" class:card-hidden={hidden} style:border-top="3px solid {meta.color}">
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
    {#if isAdmin && task.source_mailbox}
      <span class="inbox-chip" title="Flagged in {task.source_mailbox}">📥 {inbox}</span>
    {/if}
  </div>

  <!-- LLM summary shown by default (at-a-glance context); the raw email is one
       tap away behind the disclosure. -->
  {#if task.description}
    <p class="desc">
      {task.description.slice(0, 200)}{task.description.length > 200 ? '…' : ''}
    </p>
  {/if}
  {#if task.full_body}
    <details class="email-expand">
      <summary>📄 Full Email</summary>
      {#if mounted}
        <div class="email-body">{@html safeBody}</div>
      {/if}
    </details>
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

  <!-- Comments + @mentions -->
  {#if onComment}
    {#snippet commentView(c: TimelineEntry, isReply: boolean)}
      <div class="comment" class:reply={isReply}>
        <div class="comment-head">
          <span class="comment-author">{c.author ?? 'Someone'}</span>
          <span class="comment-time">{ago(c.at)}{c.edited_at ? ' · edited' : ''}</span>
          {#if c.id && canModify(c)}
            <span class="cmt-actions">
              <button class="cmt-act" onclick={() => startEdit(c)} aria-label="Edit comment" title="Edit">✏️</button>
              <button class="cmt-act" onclick={() => onDeleteComment?.(task._id, c.id!)} aria-label="Delete comment" title="Delete">✕</button>
            </span>
          {/if}
        </div>

        {#if editingId === c.id}
          <textarea class="edit-area" bind:value={editText} rows="2"></textarea>
          <div class="cmt-edit-actions">
            <button class="comment-post" onclick={() => submitEdit(c.id!)} disabled={!editText.trim()}>Save</button>
            <button class="cmt-cancel" onclick={() => (editingId = null)}>Cancel</button>
          </div>
        {:else}
          <div class="comment-text">{#each segments(c.text) as seg}{#if seg.mention}<span class="mention">{seg.text}</span>{:else}{seg.text}{/if}{/each}</div>
        {/if}

        <div class="reaction-row">
          {#each Object.entries(c.reactions ?? {}) as [emoji, names]}
            {#if names.length}
              <button
                class="reaction-chip"
                class:mine={iReacted(c, emoji)}
                onclick={() => c.id && react(c.id, emoji)}
                title={names.join(', ')}
              >{emoji} {names.length}</button>
            {/if}
          {/each}
          {#if c.id && onReact}
            <button class="react-add" onclick={() => (reactPickerFor = reactPickerFor === c.id ? null : (c.id ?? null))} aria-label="Add reaction" title="React">＋</button>
            {#if reactPickerFor === c.id}
              <span class="react-pop">
                {#each REACTION_EMOJIS as emoji}
                  <button class="react-opt" onclick={() => react(c.id!, emoji)}>{emoji}</button>
                {/each}
              </span>
            {/if}
          {/if}
          {#if !isReply && c.id}
            <button class="reply-btn" onclick={() => startReply(c.id!)}>Reply</button>
          {/if}
        </div>

        {#if !isReply && replyTo === c.id}
          <div class="reply-compose">
            <textarea bind:value={replyText} rows="2" placeholder="Reply… @ to mention"></textarea>
            <div class="cmt-edit-actions">
              <button class="comment-post" onclick={() => submitReply(c.id!)} disabled={!replyText.trim()}>Reply</button>
              <button class="cmt-cancel" onclick={() => (replyTo = null)}>Cancel</button>
            </div>
          </div>
        {/if}
      </div>
    {/snippet}

    <details class="comments-expand">
      <summary>💬 Comments{allComments.length ? ` (${allComments.length})` : ''}</summary>
      <div class="comments">
        {#each topComments as c (c.id ?? c.at)}
          {@render commentView(c, false)}
          {#each repliesTo(c.id) as r (r.id ?? r.at)}
            {@render commentView(r, true)}
          {/each}
        {/each}
        {#if !allComments.length}
          <div class="comment-empty">No comments yet — start the thread.</div>
        {/if}

        <div class="comment-compose">
          <textarea
            bind:this={commentInput}
            bind:value={commentText}
            rows="2"
            placeholder="Add a comment… @ to mention"
            oninput={onCommentInput}
            onkeydown={onComposeKeydown}
          ></textarea>
          {#if showMentions && mentionMatches.length}
            <div class="mention-pop">
              {#each mentionMatches as name}
                <button type="button" class="mention-opt" onclick={() => pickMention(name)}>@{name}</button>
              {/each}
            </div>
          {/if}
          <button class="comment-post" onclick={postComment} disabled={!commentText.trim()}>Post</button>
        </div>
      </div>
    </details>
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
    background: var(--chip-bg);
    color: var(--primary-text);
    border-radius: 20px;
    padding: 2px 9px;
    font-size: 11px;
    font-weight: 500;
  }
  .unassigned { font-size: 11px; color: var(--text-faint); }
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

  .email-expand summary,
  .notes-expand summary,
  .att-expand summary,
  .comments-expand summary {
    font-size: 11px;
    color: var(--primary);
    padding: 4px 0;
  }

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

  .att-list { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .att-link {
    font-size: 11px;
    color: var(--primary-text);
    text-decoration: none;
    padding: 3px 0;
  }
  .att-link:hover { text-decoration: underline; }

  /* ── Comments + @mentions ────────────────────────────────────────────── */
  /* Extra bottom room so the absolutely-positioned ✕ delete button clears the
     left-aligned Post button when the thread is expanded. */
  .comments-expand { margin-bottom: 20px; }
  .comments {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }
  .comment {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 8px;
  }
  .comment-head {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 2px;
  }
  .comment-author { font-size: 11px; font-weight: 700; color: var(--text); }
  .comment-time { font-size: 10px; color: var(--text-faint); }
  .comment-text {
    font-size: 12px;
    color: var(--text-soft);
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .mention {
    color: var(--primary-text);
    background: var(--chip-bg);
    border-radius: 4px;
    padding: 0 3px;
    font-weight: 600;
  }
  .comment-empty { font-size: 11px; color: var(--text-faint); }

  /* A reply sits indented under its parent. */
  .comment.reply { margin-left: 16px; border-left: 2px solid var(--border); }

  /* Edit / delete controls — pushed to the right of the head, shown subtly. */
  .cmt-actions { margin-left: auto; display: inline-flex; gap: 2px; }
  .cmt-act {
    background: transparent; border: none; cursor: pointer;
    font-size: 11px; line-height: 1; padding: 2px 4px; border-radius: 4px;
    color: var(--text-faint); min-height: 0;
  }
  .cmt-act:hover { color: var(--primary-text); background: var(--primary-bg); }

  .edit-area { margin-top: 2px; }
  .cmt-edit-actions { display: flex; gap: 6px; margin-top: 6px; }
  .cmt-cancel {
    background: transparent; border: 1px solid var(--border); color: var(--text-muted);
    border-radius: 6px; padding: 5px 12px; font-size: 12px; font-weight: 600; min-height: 0; cursor: pointer;
  }
  .cmt-cancel:hover { background: var(--bg); }

  /* Reaction chips + the add-bar. */
  .reaction-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 5px; }
  .reaction-chip {
    display: inline-flex; align-items: center; gap: 3px;
    background: var(--bg); border: 1px solid var(--border); color: var(--text-soft);
    border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 600; min-height: 0; cursor: pointer;
  }
  .reaction-chip.mine { background: var(--chip-bg); border-color: var(--primary); color: var(--primary-text); }
  .react-add {
    background: transparent; border: 1px dashed var(--border); color: var(--text-faint);
    border-radius: 999px; width: 20px; height: 20px; line-height: 1; font-size: 12px; padding: 0; min-height: 0; cursor: pointer;
  }
  .react-add:hover { color: var(--primary-text); border-color: var(--primary); }
  .react-pop {
    display: inline-flex; gap: 2px; padding: 2px 4px;
    background: var(--card-bg); border: 1px solid var(--border); border-radius: 999px;
  }
  .react-opt { background: transparent; border: none; font-size: 14px; line-height: 1; padding: 2px; min-height: 0; cursor: pointer; border-radius: 4px; }
  .react-opt:hover { background: var(--primary-bg); }
  .reply-btn { background: transparent; border: none; color: var(--primary); font-size: 11px; font-weight: 600; padding: 2px 4px; min-height: 0; cursor: pointer; }
  .reply-btn:hover { text-decoration: underline; }
  .reply-compose { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }

  .comment-compose { position: relative; display: flex; flex-direction: column; gap: 6px; }
  .comment-post {
    align-self: flex-start;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 600;
    min-height: 0;
    cursor: pointer;
  }
  .comment-post:hover:not(:disabled) { background: var(--primary-dark, #4f46e5); }
  .comment-post:disabled { opacity: 0.5; cursor: default; }

  /* Mention autocomplete popup — anchored above the compose box. */
  .mention-pop {
    position: absolute;
    left: 0;
    bottom: calc(100% - 34px);
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-width: 140px;
    max-width: 100%;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.12);
    overflow: hidden;
  }
  .mention-opt {
    background: transparent;
    border: none;
    text-align: left;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--text-body);
    min-height: 0;
    cursor: pointer;
  }
  .mention-opt:hover { background: var(--primary-bg); }

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

    /* Roomier tap targets for the disclosure toggles (email / notes / quote /
       attachments). */
    .email-expand summary,
    .notes-expand summary,
    .att-expand summary,
    .comments-expand summary,
    .quote-pop summary {
      padding-top: 8px;
      padding-bottom: 8px;
    }
  }
</style>
