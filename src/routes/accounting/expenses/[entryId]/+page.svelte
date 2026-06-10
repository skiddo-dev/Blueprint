<script lang="ts">
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import AttachmentsPanel from '$lib/components/accounting/AttachmentsPanel.svelte'
  import { usd } from '$lib/accounting/format'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const e = $derived(data.entry)
</script>

<svelte:head><title>Journal entry · Blueprint</title></svelte:head>

<AccountingShell {user} title="Journal entry" maxWidth="720px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Journal', href: '/accounting/reports/journal' }, { label: e.date }]}>

  <section class="card">
    <div class="facts">
      <div><span class="k">Date</span><span class="mono">{e.date}</span></div>
      <div><span class="k">Source</span><span class="chip">{e.source}</span></div>
      {#if e.job}<div><span class="k">Job</span><span>{e.job}</span></div>{/if}
      {#if e.created_by}<div><span class="k">By</span><span>{e.created_by}</span></div>{/if}
    </div>
    {#if e.memo}<p class="memo">{e.memo}</p>{/if}

    <table>
      <thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
      <tbody>
        {#each e.lines as l, i (i)}
          <tr>
            <td><span class="mono">{l.account_id}</span> {data.names[l.account_id] ?? ''}</td>
            <td class="num">{l.debit ? usd(l.debit) : ''}</td>
            <td class="num">{l.credit ? usd(l.credit) : ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="card">
    <div class="card-head"><h2>Files</h2></div>
    <AttachmentsPanel ownerType="journal-entry" ownerId={e._id} attachments={data.attachments} />
  </section>
</AccountingShell>

<style>
  .facts { display: flex; flex-wrap: wrap; gap: 18px 28px; margin-bottom: 14px; }
  .facts > div { display: flex; flex-direction: column; gap: 2px; }
  .facts .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); font-weight: 600; }
  .memo { color: var(--text-body); font-size: 14px; margin: 0 0 12px; }
</style>
