<script lang="ts">
  // The comments panel of a task card: thread (top-level + replies), compose box
  // with @mention autocomplete, edit/delete, emoji reactions. Extracted from
  // TaskCard so the card face stays manageable; behavior and styles are
  // unchanged. The parent owns persistence — every callback gets the task id.
  import Icon from './Icon.svelte'
  import type { TimelineEntry } from '$lib/types'
  import { REACTION_EMOJIS } from '$lib/reactions'

  let {
    taskId,
    timeline = [],
    mentionCandidates = [],
    currentUserName = '',
    currentUserEmail = '',
    isAdmin = false,
    onComment,
    onEditComment,
    onDeleteComment,
    onReact,
  }: {
    taskId: string
    timeline?: TimelineEntry[]
    mentionCandidates?: string[]
    currentUserName?: string
    currentUserEmail?: string
    isAdmin?: boolean
    onComment?: (id: string, text: string, parentId?: string) => void
    onEditComment?: (id: string, commentId: string, text: string) => void
    onDeleteComment?: (id: string, commentId: string) => void
    onReact?: (id: string, commentId: string, emoji: string) => void
  } = $props()

  let allComments = $derived((timeline ?? []).filter(e => e.kind === 'comment'))
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
    onComment(taskId, t)
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
      const start = m.index + m[0].length - token.length
      if (known.has(token.slice(1).toLowerCase())) {
        if (start > last) out.push({ text: text.slice(last, start), mention: false })
        out.push({ text: token, mention: true })
        last = start + token.length
      }
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
    onComment(taskId, t, parentId)
    replyText = ''
    replyTo = null
  }

  function startEdit(c: TimelineEntry) { if (!c.id) return; editingId = c.id; editText = c.text; replyTo = null }
  function submitEdit(commentId: string) {
    const t = editText.trim()
    if (!t || !onEditComment) return
    onEditComment(taskId, commentId, t)
    editingId = null
  }

  function react(commentId: string, emoji: string) {
    onReact?.(taskId, commentId, emoji)
    reactPickerFor = null
  }
</script>

{#snippet commentView(c: TimelineEntry, isReply: boolean)}
  <div class="comment" class:reply={isReply}>
    <div class="comment-head">
      <span class="comment-author">{c.author ?? 'Someone'}</span>
      <span class="comment-time">{ago(c.at)}{c.edited_at ? ' · edited' : ''}</span>
      {#if c.id && canModify(c)}
        <span class="cmt-actions">
          <button class="cmt-act" onclick={() => startEdit(c)} aria-label="Edit comment" title="Edit"><Icon name="pencil" size={12} /></button>
          <button class="cmt-act" onclick={() => onDeleteComment?.(taskId, c.id!)} aria-label="Delete comment" title="Delete"><Icon name="x" size={12} /></button>
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

<style>
  textarea {
    font-size: 12px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card-bg);
    color: var(--text-body);
    width: 100%;
    box-sizing: border-box;
    outline: none;
    resize: none;
    font-family: inherit;
  }
  textarea:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(99,102,241,0.12);
  }

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

  @media (max-width: 768px) {
    /* 16px stops iOS Safari from zooming the page on focus; 44px+ is a
       comfortable touch target. Mirrors the card's other editable controls. */
    textarea {
      font-size: 16px;
      min-height: 56px;
      padding: 9px 10px;
    }
  }
</style>
