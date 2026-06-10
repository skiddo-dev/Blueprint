<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { usd } from '$lib/accounting/format'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const customers = $derived(data.customers)

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

<AccountingShell {user} title="Customers" maxWidth="940px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Customers' }]}>
  <section class="card flush">
    <div class="card-head">
      <h2>{customers.length} customer{customers.length === 1 ? '' : 's'}</h2>
      <span class="muted">{usd(totalOutstanding)} outstanding</span>
    </div>
    {#if customers.length === 0}
      <p class="empty">No customers yet. They're created automatically when you raise an invoice.</p>
      <p><a class="btn-primary" href="/accounting/invoices/new">+ Create your first invoice</a></p>
    {:else}
      <div class="table-wrap">
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
                  <td class="row-actions">
                    <button class="link" type="button" onclick={() => save(c._id)} disabled={saving || !draftName.trim()}>{saving ? '…' : 'Save'}</button>
                    <button class="link muted" type="button" onclick={cancel} disabled={saving}>Cancel</button>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td><span class="party"><span class="avatar">{c.name.trim().slice(0, 1).toUpperCase()}</span>{c.name}</span></td>
                  <td class="muted">{c.email ?? '—'}</td>
                  <td class="num">{c.invoiceCount}</td>
                  <td class="num">{usd(c.totalInvoiced)}</td>
                  <td class="num" class:owed={c.outstanding > 0}>{usd(c.outstanding)}</td>
                  <td class="row-actions">
                    {#if c.outstanding > 0}
                      <a class="link" href="/api/accounting/customers/{c._id}/statement.pdf" target="_blank" rel="noopener">Statement</a>
                    {/if}
                    <button class="link" type="button" onclick={() => startEdit(c)}>Edit</button>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
      {#if error}<p class="error">{error}</p>{/if}
    {/if}
  </section>
</AccountingShell>

<style>
  /* Inline-edit specifics not covered by the shared sheet. */
  tr.editing td { background: var(--primary-bg); }
  td input { padding: 5px 7px; border-radius: var(--radius-md); width: 100%; }
  .row-actions { text-align: right; white-space: nowrap; }
</style>
