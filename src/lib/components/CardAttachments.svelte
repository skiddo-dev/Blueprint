<script lang="ts">
  // The attachments panel of a task card: list (download / purged-expired
  // states), per-file delete, and the multi-file uploader. Extracted from
  // TaskCard; behavior and styles are unchanged. The parent computes the
  // display list (including the legacy id-only fallback) and owns persistence.
  import Icon from './Icon.svelte'
  import type { Attachment } from '$lib/types'

  let {
    taskId,
    attachments = [],
    onUploadAttachment,
    onDeleteAttachment,
  }: {
    taskId: string
    attachments?: Attachment[]
    onUploadAttachment?: (id: string, file: File) => Promise<void> | void
    onDeleteAttachment?: (id: string, attId: string) => void
  } = $props()

  function fmtSize(n: number): string {
    if (!n) return ''
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
  }

  let uploading = $state(false)
  async function onFilePicked(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = '' // let the same file be re-picked after a failed upload
    if (!files.length || !onUploadAttachment) return
    uploading = true
    try {
      for (const f of files) await onUploadAttachment(taskId, f)
    } finally {
      uploading = false
    }
  }
</script>

<div class="att-list">
  {#each attachments as att (att.id)}
    <div class="att-row">
      {#if att.purged}
        <!-- Bytes tossed after the 30-day retention window; the record stays. -->
        <span class="att-link att-expired" title="{att.filename} — file removed after 30 days; details kept on the card">
          <Icon name="attachment" size={12} /> {att.filename}
        </span>
        <span class="att-tag">expired</span>
      {:else}
        <a href="/api/attachments/{att.id}" class="att-link" download title={att.filename}>
          <Icon name="download" size={12} /> {att.filename}
        </a>
        {#if att.size}<span class="att-size">{fmtSize(att.size)}</span>{/if}
      {/if}
      {#if onDeleteAttachment}
        <button
          type="button"
          class="att-del"
          onclick={() => onDeleteAttachment?.(taskId, att.id)}
          aria-label="Remove attachment"
          title="Remove"
        ><Icon name="x" size={12} /></button>
      {/if}
    </div>
  {/each}
  {#if !attachments.length}
    <div class="att-empty">No files yet.</div>
  {/if}
</div>
{#if onUploadAttachment}
  <label class="att-add" class:busy={uploading}>
    <input type="file" multiple onchange={onFilePicked} disabled={uploading} hidden />
    {#if uploading}Uploading…{:else}<Icon name="plus" size={12} /> Add file{/if}
  </label>
{/if}

<style>
  .att-list { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .att-row { display: flex; align-items: center; gap: 6px; }
  .att-link {
    font-size: 11px;
    color: var(--primary-text);
    text-decoration: none;
    padding: 3px 0;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .att-link:hover { text-decoration: underline; }
  /* Purged email attachment: the record remains, the file is gone — not a link. */
  .att-expired { color: var(--text-faint); cursor: default; }
  .att-expired:hover { text-decoration: none; }
  .att-tag {
    font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
    color: var(--text-faint); background: var(--chip-bg); border: 1px solid var(--border);
    padding: 1px 5px; border-radius: 999px; flex-shrink: 0;
  }
  .att-size { font-size: 10px; color: var(--text-faint); flex-shrink: 0; }
  .att-empty { font-size: 11px; color: var(--text-faint); }
  .att-del {
    background: transparent; border: none; cursor: pointer;
    font-size: 11px; line-height: 1; padding: 2px 4px; border-radius: 4px;
    color: var(--text-faint); min-height: 0; flex-shrink: 0;
  }
  .att-del:hover { color: var(--danger); background: var(--danger-bg); }
  .att-add {
    display: inline-block;
    margin-top: 6px;
    background: transparent;
    border: 1px dashed var(--border);
    color: var(--primary);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .att-add:hover { border-color: var(--primary); background: var(--primary-bg); }
  .att-add.busy { opacity: 0.6; cursor: default; }
</style>
