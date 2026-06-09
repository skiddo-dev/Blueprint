<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const invoices = $derived(data.invoices)

  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
</script>

<svelte:head><title>Invoices · Blueprint</title></svelte:head>

<PageShell {user} title="📄 Invoices" maxWidth="1000px">
  {#snippet head()}
    <div class="head-row">
      <div>
        <h1>📄 Invoices</h1>
        <p class="sub"><a href="/accounting">Accounting</a> · Invoices</p>
      </div>
      <a class="btn-primary" href="/accounting/invoices/new">+ New invoice</a>
    </div>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

  <section class="card">
    {#if invoices.length === 0}
      <p class="empty">No invoices yet. Create one — optionally from a won quote.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>#</th><th>Customer</th><th>Issued</th><th>Due</th>
            <th class="num">Total</th><th class="num">Balance</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each invoices as inv (inv._id)}
            <tr onclick={() => (window.location.href = `/accounting/invoices/${inv._id}`)}>
              <td class="mono">{inv.year}-{String(inv.number).padStart(4, '0')}</td>
              <td>{inv.customer_name}</td>
              <td class="mono">{inv.issue_date}</td>
              <td class="mono">{inv.due_date}</td>
              <td class="num">{usd(inv.total)}</td>
              <td class="num">{usd(inv.balance)}</td>
              <td><span class="badge {inv.status}">{inv.status}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</PageShell>

<style>
  .head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  h1 { margin: 0; }
  .sub { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; }
  .sub a { color: var(--primary-text); text-decoration: none; }

  .btn-primary {
    background: var(--primary); color: #fff; border: 1px solid var(--primary);
    border-radius: 8px; padding: 9px 14px; font-size: 13px; font-weight: 600;
    text-decoration: none; white-space: nowrap; flex-shrink: 0;
  }
  .btn-primary:hover { filter: brightness(1.05); }

  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border-soft); }
  th { color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--primary-bg); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text-body); }
  .empty { color: var(--text-muted); font-size: 14px; padding: 8px 2px; }

  .badge { font-size: 11px; font-weight: 600; border-radius: 8px; padding: 2px 8px; text-transform: capitalize; }
  .badge.open { background: #dbeafe; color: #1d4ed8; }
  .badge.partial { background: #fef3c7; color: #b45309; }
  .badge.paid { background: #d1fae5; color: #047857; }
  .badge.void { background: #f1f5f9; color: #475569; }
</style>
