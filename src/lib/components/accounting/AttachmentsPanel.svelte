<script lang="ts">
  // Upload/list/delete files on an accounting document. Downloads go through
  // the shared /api/attachments/[id] endpoint (admin-gated for these owners).
  import { apiError } from '$lib/accounting/api'
  import { invalidateAll } from '$app/navigation'
  import { confirmDialog } from '$lib/confirm.svelte'

  interface Meta { id: string; filename: string; size: number; content_type: string; purged?: boolean }
  let { ownerType, ownerId, attachments }: {
    ownerType: 'invoice' | 'bill' | 'journal-entry'
    ownerId: string
    attachments: Meta[]
  } = $props()

  let uploading = $state(false)
  let errorMsg = $state('')

  const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

  async function upload(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    uploading = true
    errorMsg = ''
    try {
      const form = new FormData()
      form.set('owner_type', ownerType)
      form.set('owner_id', ownerId)
      form.set('file', file)
      const r = await fetch('/api/accounting/attachments', { method: 'POST', body: form })
      if (!r.ok) throw new Error(await apiError(r))
      await invalidateAll()
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err)
    } finally {
      uploading = false
      input.value = ''
    }
  }

  async function remove(id: string, name: string) {
    if (!(await confirmDialog({ title: `Remove ${name}?`, confirmLabel: 'Remove file', danger: true }))) return
    errorMsg = ''
    try {
      const r = await fetch(`/api/accounting/attachments/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(await apiError(r))
      await invalidateAll()
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err)
    }
  }
</script>

{#if attachments.length === 0}
  <p class="empty">No files attached.</p>
{:else}
  <ul class="files">
    {#each attachments as a (a.id)}
      <li>
        {#if a.purged}
          <span class="name purged" title="Removed under the email-attachment retention policy">📎 {a.filename}</span>
        {:else}
          <a class="name" href={`/api/attachments/${a.id}`}>📎 {a.filename}</a>
        {/if}
        <span class="size">{kb(a.size)}</span>
        <button class="link muted" type="button" onclick={() => remove(a.id, a.filename)}>Remove</button>
      </li>
    {/each}
  </ul>
{/if}
<label class="upload btn-secondary" class:busy={uploading}>
  {uploading ? 'Uploading…' : '📎 Attach file'}
  <input type="file" onchange={upload} disabled={uploading} hidden />
</label>
{#if errorMsg}<p class="error">{errorMsg}</p>{/if}

<style>
  .files { list-style: none; margin: 0 0 10px; padding: 0; }
  .files li { display: flex; align-items: baseline; gap: 10px; padding: 5px 0; font-size: var(--font-base); }
  .name { color: var(--primary-text); text-decoration: none; }
  .name:hover { text-decoration: underline; }
  .name.purged { color: var(--text-muted); text-decoration: line-through; }
  .size { color: var(--text-muted); font-size: var(--font-sm); }
  .upload { display: inline-block; cursor: pointer; }
  .upload.busy { opacity: 0.6; }
</style>
