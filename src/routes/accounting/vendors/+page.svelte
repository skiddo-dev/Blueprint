<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const vendors = $derived(data.vendors)

  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const totalOutstanding = $derived(vendors.reduce((a, v) => a + v.outstanding, 0))

  // Inline edit of a vendor's name/email.
  let editingId = $state<string | null>(null)
  let draftName = $state('')
  let draftEmail = $state('')
  let saving = $state(false)
  let error = $state('')

  function startEdit(v: { _id: string; name: string; email?: string }) {
    editingId = v._id
    draftName = v.name
    draftEmail = v.email ?? ''
    error = ''
  }
  function cancel() { editingId = null; error = '' }

  async function save(id: string) {
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/vendors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName, email: draftEmail }),
      })
      if (!r.ok) throw new Error(await r.text())
      editingId = null
      await invalidateAll()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>Vendors · Blueprint</title></svelte:head>

<PageShell {user} title="🏗️ Vendors" maxWidth="940px">
  {#snippet head()}
    <h1>🏗️ Vendors</h1>
    <p class="sub"><a href="/accounting">Accounting</a> · {vendors.length} vendor{vendors.length === 1 ? '' : 's'} · {usd(totalOutstanding)} owed</p>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

  <section class="card">
    {#if vendors.length === 0}
      <p class="empty">No vendors yet. They're created automatically when you enter a bill.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Vendor</th><th>Email</th><th class="num">Bills</th><th class="num">Total billed</th><th class="num">Outstanding</th><th></th></tr>
        </thead>
        <tbody>
          {#each vendors as v (v._id)}
            {#if editingId === v._id}
              <tr class="editing">
                <td><input type="text" bind:value={draftName} aria-label="Name" /></td>
                <td><input type="email" bind:value={draftEmail} placeholder="(none)" aria-label="Email" /></td>
                <td class="num">{v.billCount}</td>
                <td class="num">{usd(v.totalBilled)}</td>
                <td class="num">{usd(v.outstanding)}</td>
                <td class="actions">
                  <button class="link" type="button" onclick={() => save(v._id)} disabled={saving || !draftName.trim()}>{saving ? '…' : 'Save'}</button>
                  <button class="link muted" type="button" onclick={cancel} disabled={saving}>Cancel</button>
                </td>
              </tr>
            {:else}
              <tr>
                <td>{v.name}</td>
                <td class="muted">{v.email ?? '—'}</td>
                <td class="num">{v.billCount}</td>
                <td class="num">{usd(v.totalBilled)}</td>
                <td class="num" class:owed={v.outstanding > 0}>{usd(v.outstanding)}</td>
                <td class="actions"><button class="link" type="button" onclick={() => startEdit(v)}>Edit</button></td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
      {#if error}<p class="error">{error}</p>{/if}
    {/if}
  </section>
</PageShell>

<style>
  h1 { margin: 0; }
  .sub { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; }
  .sub a { color: var(--primary-text); text-decoration: none; }

  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border-soft); }
  th { color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: var(--text-muted); }
  .owed { font-weight: 600; color: #b45309; }
  .empty { color: var(--text-muted); font-size: 14px; padding: 8px 2px; }
  .actions { text-align: right; white-space: nowrap; }
  tr.editing { background: var(--primary-bg); }
  td input { font: inherit; padding: 5px 7px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); width: 100%; }
  .link { background: none; border: none; color: var(--primary-text); font-size: 13px; font-weight: 600; cursor: pointer; padding: 2px 6px; }
  .link.muted { color: var(--text-muted); }
  .link:disabled { opacity: 0.5; cursor: not-allowed; }
  .error { color: #dc2626; font-size: 13px; background: #fee2e2; border-radius: 8px; padding: 8px 12px; margin-top: 10px; }
</style>
