<script lang="ts">
  import { QUOTE_TYPES, QUOTE_PEOPLE } from '$lib/constants'

  let customer = $state('')
  let quotePerson = $state(QUOTE_PEOPLE[0])
  let location = $state('')
  let quoteType = $state(QUOTE_TYPES[0])
  let bidDue = $state('')
  let description = $state('Generated proposal via Quote Generator')
  let notes = $state('')
  let labor = $state(0)
  let materials = $state(0)
  let generating = $state(false)
  let error = $state('')
  let downloadUrl = $state('')
  let filename = $state('')

  const today = new Date().toISOString().slice(0, 10)

  async function generate() {
    generating = true; error = ''; downloadUrl = ''
    try {
      const total = (labor + materials) > 0 ? labor + materials : undefined
      const r = await fetch('/api/quotes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: customer || 'TBD',
          date_received: today,
          bid_due_date: bidDue || today,
          architect: quotePerson,
          project_location: location || 'TBD',
          description,
          notes,
          labor,
          materials,
          total,
          quote_type: quoteType,
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

<div class="app-layout">
  <aside class="sidebar">
    <a href="/" class="nav-link">← Back to Board</a>
    <a href="/dashboard" class="nav-link">📊 Dashboard</a>
  </aside>

  <main class="main-content">
    <h1>📝 RAVES Construction Quote Generator</h1>
    <p class="sub">Generate professional proposal PDFs matching your company template</p>
    <hr style="margin: 14px 0 20px" />

    <div class="form-grid">
      <label>
        Customer Name
        <input type="text" bind:value={customer} placeholder="Client name" />
      </label>
      <label>
        Architect / Quote Person
        <select bind:value={quotePerson}>
          {#each QUOTE_PEOPLE as p}
            <option value={p}>{p}</option>
          {/each}
        </select>
      </label>
      <label>
        Project Location
        <input type="text" bind:value={location} placeholder="Site or project address" />
      </label>
      <label>
        Quote Type
        <select bind:value={quoteType}>
          {#each QUOTE_TYPES as qt}
            <option value={qt}>{qt}</option>
          {/each}
        </select>
      </label>
      <label>
        Bid Due Date
        <input type="date" bind:value={bidDue} />
      </label>
      <div></div>
      <label class="span-2">
        Description of Work
        <textarea bind:value={description} rows="3"></textarea>
      </label>
      <label class="span-2">
        Notes (Optional)
        <textarea bind:value={notes} rows="2" placeholder="Additional terms or conditions"></textarea>
      </label>
      <label>
        Labor Cost ($)
        <input type="number" bind:value={labor} min="0" step="0.01" />
      </label>
      <label>
        Materials Cost ($)
        <input type="number" bind:value={materials} min="0" step="0.01" />
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
        <li>The PDF layout uses coordinates matching your RAVES CONSTRUCTION form.</li>
        <li>If you enter Labor & Materials, the Total updates automatically.</li>
        <li>If both are 0, a suggested total is calculated based on quote type.</li>
      </ul>
    </details>
  </main>
</div>

<style>
  .app-layout { display: flex; min-height: 100vh; }
  .sidebar {
    width: 180px; background: #fff; border-right: 1px solid #e2e8f0;
    padding: 14px 12px; display: flex; flex-direction: column; gap: 6px;
    flex-shrink: 0;
  }
  .nav-link { display: block; padding: 8px 10px; font-size: 13px; color: #374151; text-decoration: none; border: 1px solid #e2e8f0; border-radius: 7px; background: #f8fafc; }
  .nav-link:hover { background: #eef2ff; color: #4338ca; }
  .main-content { flex: 1; padding: 1.4rem; max-width: 720px; }
  h1 { font-size: 20px; font-weight: 800; color: #1e293b; }
  .sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }

  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .span-2 { grid-column: span 2; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 500; color: #374151; }

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
