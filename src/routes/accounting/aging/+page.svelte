<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import { AGING_BUCKETS } from '$lib/accounting/invoicing'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const aging = $derived(data.aging)

  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const labels: Record<string, string> = { current: 'Current', '1-30': '1–30 days', '31-60': '31–60 days', '61-90': '61–90 days', '90+': '90+ days' }
</script>

<svelte:head><title>A/R Aging · Blueprint</title></svelte:head>

<PageShell {user} title="📈 A/R Aging" maxWidth="1000px">
  {#snippet head()}
    <h1>📈 A/R Aging</h1>
    <p class="sub"><a href="/accounting">Accounting</a> · Receivables by age</p>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

  <div class="buckets">
    {#each AGING_BUCKETS as b (b)}
      <div class="bucket" class:overdue={b !== 'current'}>
        <span class="b-label">{labels[b]}</span>
        <span class="b-amount">{usd(aging.buckets[b])}</span>
      </div>
    {/each}
    <div class="bucket total">
      <span class="b-label">Total outstanding</span>
      <span class="b-amount">{usd(aging.total)}</span>
    </div>
  </div>

  <section class="card">
    <div class="card-head"><h2>Open invoices</h2></div>
    {#if aging.rows.length === 0}
      <p class="empty">Nothing outstanding — all invoices are paid. 🎉</p>
    {:else}
      <table>
        <thead><tr><th>#</th><th>Customer</th><th>Due</th><th>Age</th><th class="num">Balance</th></tr></thead>
        <tbody>
          {#each aging.rows as r (r._id)}
            <tr onclick={() => (window.location.href = `/accounting/invoices/${r._id}`)}>
              <td class="mono">#{r.number}</td>
              <td>{r.name}</td>
              <td class="mono">{r.due_date}</td>
              <td><span class="chip" class:overdue={r.bucket !== 'current'}>{labels[r.bucket]}</span></td>
              <td class="num">{usd(r.balance)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</PageShell>

<style>
  h1 { margin: 0; }
  .sub { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; }
  .sub a { color: var(--primary-text); text-decoration: none; }

  .buckets { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .bucket { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
  .bucket.overdue { border-color: #fcd9b6; }
  .bucket.total { border-color: var(--primary); }
  .b-label { font-size: 12px; color: var(--text-muted); font-weight: 600; }
  .b-amount { font-size: 18px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }

  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  .card-head h2 { font-size: 15px; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border-soft); }
  th { color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--primary-bg); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text-body); }
  .empty { color: var(--text-muted); font-size: 14px; padding: 8px 2px; }
  .chip { background: var(--chip-bg); color: var(--primary-text); border-radius: 8px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
  .chip.overdue { background: #fef3c7; color: #b45309; }
</style>
