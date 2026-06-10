<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import type { IconName } from '$lib/icons'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { describeCadence } from '$lib/accounting/recurring'
  import { invalidateAll } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  let busy = $state(false)
  let error = $state('')
  let runMsg = $state('')

  async function call(method: string, url: string, body?: unknown) {
    busy = true
    error = ''
    try {
      const r = await fetch(url, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      })
      if (!r.ok) throw new Error(await r.text())
      return await r.json()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      return null
    } finally {
      busy = false
    }
  }

  const toggle = async (id: string, active: boolean) => { await call('PATCH', `/api/accounting/recurring/${id}`, { active }); await invalidateAll() }
  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete the recurring template “${name}”? Already-posted documents stay in the books.`)) return
    await call('DELETE', `/api/accounting/recurring/${id}`)
    await invalidateAll()
  }
  const runNow = async () => {
    const r = await call('POST', '/api/accounting/recurring/run')
    if (r) runMsg = `Posted ${r.posted} item${r.posted === 1 ? '' : 's'}${r.errors ? ` · ${r.errors} error(s)` : ''}`
    await invalidateAll()
  }

  const TYPE_ICON: Record<string, IconName> = { invoice: 'invoice', bill: 'bill', journal: 'ledger' }
</script>

<svelte:head><title>Recurring · Blueprint</title></svelte:head>

<AccountingShell {user} title="Recurring" maxWidth="1000px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Recurring' }]}>
  {#snippet actions()}
    <button class="btn-secondary" type="button" onclick={runNow} disabled={busy}>▶ Run now</button>
  {/snippet}

  <p class="report-hint">Templates that post themselves on schedule — monthly rent, retainer invoices, standing vendor bills. Create one from the bottom of any invoice, bill, or journal form ("Make this recurring"). The engine runs automatically; "Run now" posts anything currently due.</p>

  {#if runMsg}<p class="run-msg">{runMsg}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  <section class="card flush">
    {#if data.templates.length === 0}
      <p class="empty">No recurring templates yet. Open a new invoice, bill, or journal entry and use “Make this recurring” at the bottom of the form.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Template</th><th>Cadence</th><th>Next run</th><th>Last result</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {#each data.templates as t (t._id)}
              <tr class:paused={!t.active}>
                <td><Icon name={TYPE_ICON[t.type] ?? 'ledger'} size={12} /> {t.name}</td>
                <td>{describeCadence(t.cadence)}</td>
                <td class="mono">{t.active ? t.next_date : '—'}</td>
                <td class="muted result" title={t.last_result}>{t.last_result ?? 'never run'}</td>
                <td><span class="badge" class:ok={t.active} class:bad={!t.active}>{t.active ? 'active' : 'paused'}</span></td>
                <td class="row-actions">
                  <button class="link" type="button" onclick={() => toggle(t._id, !t.active)} disabled={busy}>{t.active ? 'Pause' : 'Resume'}</button>
                  <button class="link muted" type="button" onclick={() => remove(t._id, t.name)} disabled={busy}>Delete</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</AccountingShell>

<style>
  tr.paused td { opacity: 0.6; }
  .result { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .row-actions { text-align: right; white-space: nowrap; }
  .run-msg { font-size: 13px; font-weight: 600; color: #047857; margin: 0 0 10px; }
</style>
