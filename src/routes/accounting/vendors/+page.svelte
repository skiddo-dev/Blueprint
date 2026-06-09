<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })
  const vendors = $derived(data.vendors)

  const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const totalOutstanding = $derived(vendors.reduce((a, v) => a + v.outstanding, 0))
</script>

<svelte:head><title>Vendors · Blueprint</title></svelte:head>

<PageShell {user} title="🏗️ Vendors" maxWidth="900px">
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
          <tr><th>Vendor</th><th>Email</th><th class="num">Bills</th><th class="num">Total billed</th><th class="num">Outstanding</th></tr>
        </thead>
        <tbody>
          {#each vendors as v (v._id)}
            <tr>
              <td>{v.name}</td>
              <td class="muted">{v.email ?? '—'}</td>
              <td class="num">{v.billCount}</td>
              <td class="num">{usd(v.totalBilled)}</td>
              <td class="num" class:owed={v.outstanding > 0}>{usd(v.outstanding)}</td>
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

  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border-soft); }
  th { color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: var(--text-muted); }
  .owed { font-weight: 600; color: #b45309; }
  .empty { color: var(--text-muted); font-size: 14px; padding: 8px 2px; }
</style>
