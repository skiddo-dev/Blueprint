<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const customers = $derived(data.customers)

  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const totalOutstanding = $derived(customers.reduce((a, c) => a + c.outstanding, 0))

  // Inline edit of a customer's name/email.
  let editingId = $state<string | null>(null)
  let draftName = $state('')
  let draftEmail = $state('')
  let saving = $state(false)
  let error = $state('')

  function startEdit(c: { _id: string; name: string; email?: string }) {
    editingId = c._id
    draftName = c.name
    draftEmail = c.email ?? ''
    error = ''
  }
  function cancel() { editingId = null; error = '' }

  async function save(id: string) {
    saving = true
    error = ''
    try {
      const r = await fetch(`/api/accounting/customers/${id}`, {
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

<svelte:head><title>Customers · Blueprint</title></svelte:head>

<PageShell {user} title="🤝 Customers" maxWidth="940px">
  {#snippet head()}
    <h1>🤝 Customers</h1>
    <p class="sub"><a href="/accounting">Accounting</a> · {customers.length} customer{customers.length === 1 ? '' : 's'} · {usd(totalOutstanding)} outstanding</p>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

  <section class="card">
    {#if customers.length === 0}
      <p class="empty">No customers yet. They're created automatically when you raise an invoice.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Customer</th><th>Email</th><th class="num">Invoices</th><th class="num">Total invoiced</th><th class="num">Outstanding</th><th></th></tr>
        </thead>
        <tbody>
          {#each customers as c (c._id)}
            {#if editingId === c._id}
              <tr class="editing">
                <td><input type="text" bind:value={draftName} aria-label="Name" /></td>
                <td><input type="email" bind:value={draftEmail} placeholder="(none)" aria-label="Email" /></td>
                <td class="num">{c.invoiceCount}</td>
                <td class="num">{usd(c.totalInvoiced)}</td>
                <td class="num">{usd(c.outstanding)}</td>
                <td class="actions">
                  <button class="link" type="button" onclick={() => save(c._id)} disabled={saving || !draftName.trim()}>{saving ? '…' : 'Save'}</button>
                  <button class="link muted" type="button" onclick={cancel} disabled={saving}>Cancel</button>
                </td>
              </tr>
            {:else}
              <tr>
                <td>{c.name}</td>
                <td class="muted">{c.email ?? '—'}</td>
                <td class="num">{c.invoiceCount}</td>
                <td class="num">{usd(c.totalInvoiced)}</td>
                <td class="num" class:owed={c.outstanding > 0}>{usd(c.outstanding)}</td>
                <td class="actions"><button class="link" type="button" onclick={() => startEdit(c)}>Edit</button></td>
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
