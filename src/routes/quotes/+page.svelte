<script lang="ts">
  import { QUOTE_CONTACTS, QUOTE_WORK_TYPES } from '$lib/constants'
  import PageShell from '$lib/components/PageShell.svelte'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  // Session comes from the root layout load; this route is admin-only.
  // svelte-ignore state_referenced_locally
  const session = data.session as unknown as AppSession
  const user = { name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' }

  let customer = $state('')
  let storeNumber = $state('')
  let pointOfContact = $state('')
  let workType = $state('')
  let amount = $state(0)
  let dateSent = $state(new Date().toISOString().slice(0, 10))
  let bidDue = $state('')
  let po = $state('')
  let sitefolio = $state(false)
  let description = $state('')
  let notes = $state('')
  let generating = $state(false)
  let error = $state('')
  let downloadUrl = $state('')
  let filename = $state('')

  const today = new Date().toISOString().slice(0, 10)

  async function generate() {
    generating = true; error = ''; downloadUrl = ''
    try {
      const r = await fetch('/api/quotes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: customer || 'TBD',
          store_number: storeNumber,
          point_of_contact: pointOfContact,
          work_type: workType,
          amount: Number(amount) || 0,
          date_sent: dateSent || today,
          bid_due_date: bidDue,
          po,
          sitefolio,
          description,
          notes,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const blob = await r.blob()
      downloadUrl = URL.createObjectURL(blob)
      filename = `Proposal_${(customer || 'Client').replace(/\s+/g, '_')}_${today}.pdf`
    } catch (e) {
      error = String(e)
    } finally {
      generating = false
    }
  }
</script>

<svelte:head><title>Quote Generator · Blueprint</title></svelte:head>

<PageShell {user} title="📝 Quote Generator" maxWidth="720px">
  {#snippet head()}
    <h1>📝 RAVES Construction Quote Generator</h1>
    <p class="sub">Generate professional proposal PDFs matching your company template</p>
    <hr style="margin: 14px 0 20px" />
  {/snippet}

    <div class="form-grid">
      <label>
        Customer Name
        <input type="text" bind:value={customer} placeholder="Client name" />
      </label>
      <label>
        Store #
        <input type="text" bind:value={storeNumber} placeholder="e.g. 642" />
      </label>
      <label>
        Point of Contact
        <input type="text" list="contacts" bind:value={pointOfContact} placeholder="Estimator" />
        <datalist id="contacts">
          {#each QUOTE_CONTACTS as c}<option value={c}></option>{/each}
        </datalist>
      </label>
      <label>
        Work Type
        <input type="text" list="worktypes" bind:value={workType} placeholder="e.g. Minor Remodel" />
        <datalist id="worktypes">
          {#each QUOTE_WORK_TYPES as w}<option value={w}></option>{/each}
        </datalist>
      </label>
      <label>
        Amount ($)
        <input type="number" bind:value={amount} min="0" step="0.01" />
      </label>
      <label>
        Date Sent
        <input type="date" bind:value={dateSent} />
      </label>
      <label>
        Bid Due Date
        <input type="date" bind:value={bidDue} />
      </label>
      <label>
        PO (optional)
        <input type="text" bind:value={po} placeholder="Purchase order" />
      </label>
      <label class="checkbox">
        <input type="checkbox" bind:checked={sitefolio} />
        Sitefolio
      </label>
      <div></div>
      <label class="span-2">
        Description of Work
        <textarea bind:value={description} rows="3" placeholder="Scope of work (appears on the proposal PDF)"></textarea>
      </label>
      <label class="span-2">
        Notes (Optional)
        <textarea bind:value={notes} rows="2" placeholder="Additional terms or conditions"></textarea>
      </label>
    </div>

    {#if error}
      <p class="error">❌ {error}</p>
    {/if}

    <div class="actions">
      <button class="primary" onclick={generate} disabled={generating}>
        {generating ? '⏳ Generating…' : '📄 Generate Proposal PDF'}
      </button>

      {#if downloadUrl}
        <a href={downloadUrl} download={filename} class="dl-btn">
          📥 Download Proposal PDF
        </a>
      {/if}
    </div>

    <details class="how-it-works" style="margin-top: 24px">
      <summary>ℹ️ How Proposal Generation Works</summary>
      <ul>
        <li>The PDF layout matches your RAVES CONSTRUCTION proposal form.</li>
        <li>Each quote is logged (auto Quote #/year, Store #, Point of Contact, Work Type, Amount) and tracked in the Dashboard analytics.</li>
      </ul>
    </details>
</PageShell>

<style>
  h1 { font-size: 20px; font-weight: 800; color: #1e293b; }
  .sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }

  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .span-2 { grid-column: span 2; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 500; color: #374151; }
  label.checkbox { flex-direction: row; align-items: center; gap: 8px; }
  label.checkbox input { width: auto; }

  .error { color: #dc2626; font-size: 13px; margin-top: 10px; }
  .actions { display: flex; gap: 10px; align-items: center; margin-top: 20px; flex-wrap: wrap; }
  .dl-btn {
    display: inline-block;
    padding: 8px 16px;
    background: #d1fae5;
    color: #047857;
    border: 1px solid #a7f3d0;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
  }
  .dl-btn:hover { background: #a7f3d0; }

  .how-it-works { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
  .how-it-works summary { font-size: 13px; color: #374151; cursor: pointer; }
  .how-it-works ul { font-size: 12px; color: #64748b; margin-top: 8px; padding-left: 16px; }
  .how-it-works li { margin-bottom: 4px; }

  @media (max-width: 640px) {
    .form-grid { grid-template-columns: 1fr; }
    .span-2 { grid-column: span 1; }
  }
</style>
