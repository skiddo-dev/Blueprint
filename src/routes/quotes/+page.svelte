<script lang="ts">
  import { QUOTE_CONTACTS, QUOTE_WORK_TYPES } from '$lib/constants'
  import { quoteCostRows } from '$lib/quoteCost'
  import { guardUnsaved } from '$lib/unsavedGuard'
  import PageShell from '$lib/components/PageShell.svelte'
  import Icon from '$lib/components/Icon.svelte'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  // Session comes from the root layout load; this route is admin-only.
  // svelte-ignore state_referenced_locally
  const session = data.session as unknown as AppSession
  const user = { name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' }

  const today = new Date().toISOString().slice(0, 10)

  let customer = $state('')
  let storeNumber = $state('')
  let pointOfContact = $state('')
  let workType = $state('')
  let dateSent = $state(today)
  let bidDue = $state('')
  let po = $state('')
  let sitefolio = $state(false)
  let description = $state('')
  let notes = $state('')

  // Pricing. The total is always logged (one Amount per quote in the quote log);
  // the two toggles only control which lines print in the proposal's cost box.
  let laborStr = $state('')
  let materialsStr = $state('')
  let totalStr = $state('')
  let totalTouched = $state(false) // a hand-edited total stops the labor+materials auto-sum
  let showLabor = $state(false)
  let showTotal = $state(true)

  let generating = $state(false)
  let error = $state('')
  let downloadUrl = $state('')
  let filename = $state('')

  // Money inputs are free text ("$4,500", "1,200.50"); empty counts as 0 and
  // anything non-numeric or negative parses to NaN so we can flag it.
  function parseUsd(s: string): number {
    const t = s.replace(/[$,\s]/g, '')
    if (!t) return 0
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 ? n : NaN
  }
  const fmtUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const labor = $derived(parseUsd(laborStr))
  const materials = $derived(parseUsd(materialsStr))
  const total = $derived(parseUsd(totalStr))
  const pricingInvalid = $derived([labor, materials, total].some(Number.isNaN))

  // Generating the proposal is this form's "save" (the quote is logged
  // server-side), so a successful generate releases the guard — don't nag
  // once the user has their PDF.
  const dirty = $derived(
    !downloadUrl && (
      customer.trim() !== '' || storeNumber.trim() !== '' || pointOfContact.trim() !== '' ||
      workType.trim() !== '' || dateSent !== today || bidDue !== '' || po.trim() !== '' ||
      sitefolio || description.trim() !== '' || notes.trim() !== '' ||
      laborStr.trim() !== '' || materialsStr.trim() !== '' || totalStr.trim() !== ''
    ),
  )
  guardUnsaved(() => dirty)

  // Exactly the rows generateQuotePdf will print — same helper, so the
  // on-screen preview can't drift from the PDF.
  const previewRows = $derived(
    pricingInvalid
      ? []
      : quoteCostRows({
          labor: showLabor ? labor : 0,
          materials: showLabor ? materials : 0,
          total,
          show_labor: showLabor,
          show_total: showTotal,
        }),
  )

  function syncTotalFromBreakdown() {
    if (totalTouched || !showLabor) return
    const sum = (Number.isNaN(parseUsd(laborStr)) ? 0 : parseUsd(laborStr)) + (Number.isNaN(parseUsd(materialsStr)) ? 0 : parseUsd(materialsStr))
    totalStr = sum > 0 ? fmtUsd(sum) : ''
  }
  function onTotalInput() {
    totalTouched = totalStr.trim() !== ''
    if (!totalTouched) syncTotalFromBreakdown()
  }
  // Pretty-print a money field once the user leaves it ("4500" → "4,500.00").
  function tidy(which: 'labor' | 'materials' | 'total') {
    if (which === 'labor' && !Number.isNaN(labor)) laborStr = labor > 0 ? fmtUsd(labor) : ''
    if (which === 'materials' && !Number.isNaN(materials)) materialsStr = materials > 0 ? fmtUsd(materials) : ''
    if (which === 'total' && !Number.isNaN(total)) totalStr = total > 0 ? fmtUsd(total) : ''
  }

  async function generate() {
    generating = true
    error = ''
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    downloadUrl = ''
    try {
      const r = await fetch('/api/quotes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: customer || 'TBD',
          store_number: storeNumber,
          point_of_contact: pointOfContact,
          work_type: workType,
          amount: Number.isNaN(total) ? 0 : total,
          labor: showLabor && !Number.isNaN(labor) ? labor : 0,
          materials: showLabor && !Number.isNaN(materials) ? materials : 0,
          show_labor: showLabor,
          show_total: showTotal,
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

<PageShell {user} title="Quote Generator" maxWidth="860px">
  {#snippet head()}
    <h1 class="page-title">Quote Generator</h1>
    <p class="page-sub">RAVES Construction proposals — branded PDF, logged to the quote log and dashboard analytics · Admin only</p>
    <hr style="margin: 12px 0 20px" />
  {/snippet}

  <section class="card">
    <div class="section">
      <h2 class="section-title">Client &amp; project</h2>
      <div class="grid">
        <label>
          Customer
          <input type="text" bind:value={customer} placeholder="Client name" />
        </label>
        <label>
          Store #
          <input type="text" bind:value={storeNumber} placeholder="e.g. 642" />
        </label>
        <label>
          Point of contact
          <input type="text" list="contacts" bind:value={pointOfContact} placeholder="Estimator" />
          <datalist id="contacts">
            {#each QUOTE_CONTACTS as c}<option value={c}></option>{/each}
          </datalist>
        </label>
        <label>
          Work type
          <input type="text" list="worktypes" bind:value={workType} placeholder="e.g. Minor Remodel" />
          <datalist id="worktypes">
            {#each QUOTE_WORK_TYPES as w}<option value={w}></option>{/each}
          </datalist>
        </label>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Schedule &amp; references</h2>
      <div class="grid">
        <label>
          Date sent
          <input type="date" bind:value={dateSent} />
        </label>
        <label>
          Bid due date
          <input type="date" bind:value={bidDue} />
        </label>
        <label>
          <span>PO <span class="optional">(optional)</span></span>
          <input type="text" bind:value={po} placeholder="Purchase order" />
        </label>
        <label class="checkbox">
          <input type="checkbox" bind:checked={sitefolio} />
          Sitefolio
        </label>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Pricing</h2>
      <div class="pricing">
        <div class="pricing-inputs">
          <div class="toggles">
            <label class="toggle">
              <span class="switch">
                <input type="checkbox" role="switch" bind:checked={showLabor} onchange={syncTotalFromBreakdown} />
                <span class="track" aria-hidden="true"></span>
              </span>
              <span class="toggle-text">
                Labor cost
                <span class="hint">Print the labor (and materials) lines</span>
              </span>
            </label>
            <label class="toggle">
              <span class="switch">
                <input type="checkbox" role="switch" bind:checked={showTotal} />
                <span class="track" aria-hidden="true"></span>
              </span>
              <span class="toggle-text">
                Total cost
                <span class="hint">Print the {showLabor ? 'total' : 'amount'} line</span>
              </span>
            </label>
          </div>

          <div class="grid money-grid">
            {#if showLabor}
              <label>
                Labor
                <span class="money"><span class="cur" aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={laborStr} oninput={syncTotalFromBreakdown} onblur={() => tidy('labor')} placeholder="0.00" /></span>
              </label>
              <label>
                <span>Materials <span class="optional">(optional)</span></span>
                <span class="money"><span class="cur" aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={materialsStr} oninput={syncTotalFromBreakdown} onblur={() => tidy('materials')} placeholder="0.00" /></span>
              </label>
            {/if}
            <label class:span-2={!showLabor}>
              Total quoted amount
              <span class="money"><span class="cur" aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={totalStr} oninput={onTotalInput} onblur={() => tidy('total')} placeholder="0.00" /></span>
              <span class="hint">
                {#if showLabor && !totalTouched}Auto-filled from labor + materials · always logged for analytics{:else}Always logged for analytics, even when hidden on the proposal{/if}
              </span>
            </label>
          </div>
          {#if pricingInvalid}
            <p class="field-error" role="alert">Pricing must be a positive dollar figure, e.g. 4,500.00</p>
          {/if}
        </div>

        <div class="preview" aria-live="polite">
          <span class="preview-title">Proposal cost box</span>
          <div class="preview-paper">
            {#if previewRows.length}
              {#each previewRows as [label, value]}
                <div class="preview-row"><span class="lbl">{label}</span><span class="val">${fmtUsd(value)}</span></div>
              {/each}
            {:else}
              <p class="preview-empty">{pricingInvalid ? 'Fix the pricing fields to preview' : 'No pricing printed on this proposal'}</p>
            {/if}
          </div>
          <span class="preview-caption">Exactly what prints on the PDF</span>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Scope of work</h2>
      <div class="grid">
        <label class="span-2">
          Description of work
          <textarea bind:value={description} rows="4" placeholder="Scope of work (appears on the proposal PDF)"></textarea>
        </label>
        <label class="span-2">
          <span>Notes <span class="optional">(optional)</span></span>
          <textarea bind:value={notes} rows="2" placeholder="Additional terms or conditions"></textarea>
        </label>
      </div>
    </div>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <div class="actions">
      {#if downloadUrl}
        <a href={downloadUrl} download={filename} class="btn-primary"><Icon name="download" size={14} /> Download proposal PDF</a>
      {/if}
      <!-- Once a PDF is ready, downloading is the primary action; regenerate demotes. -->
      <button class={downloadUrl ? 'secondary' : 'primary'} onclick={generate} disabled={generating || pricingInvalid}>
        {generating ? 'Generating…' : downloadUrl ? 'Regenerate proposal' : 'Generate proposal PDF'}
      </button>
    </div>
  </section>

  <details class="how-it-works">
    <summary>How proposal generation works</summary>
    <ul>
      <li>The PDF layout matches the RAVES CONSTRUCTION proposal form.</li>
      <li>The pricing toggles only change what the customer sees — the total is always logged.</li>
      <li>Each quote is logged (auto Quote #/year, Store #, Point of Contact, Work Type, Amount) and tracked in the Dashboard analytics.</li>
    </ul>
  </details>
</PageShell>

<style>
  .page-title { font-size: var(--font-2xl); font-weight: 800; color: var(--text); }
  .page-sub { font-size: var(--font-sm); color: var(--text-faint); margin-top: 2px; }

  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 20px 22px;
  }

  .section { padding: 16px 0; border-bottom: 1px solid var(--border-soft); }
  .section:first-child { padding-top: 0; }
  .section-title {
    font-size: var(--font-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 0 0 12px;
  }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
  .span-2 { grid-column: span 2; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: var(--font-base); font-weight: 600; color: var(--text-soft); }
  .optional { font-weight: 400; color: var(--text-faint); }
  .hint { font-size: var(--font-sm); font-weight: 400; color: var(--text-faint); }

  label.checkbox { flex-direction: row; align-items: center; gap: 8px; align-self: end; padding-bottom: 8px; }
  label.checkbox input { width: 15px; height: 15px; accent-color: var(--primary); }

  /* ── Pricing ── */
  .pricing { display: grid; grid-template-columns: 1fr 240px; gap: 20px; align-items: start; }
  .pricing-inputs { min-width: 0; }

  .toggles { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
  .toggle { flex-direction: row; align-items: flex-start; gap: 10px; cursor: pointer; }
  .toggle-text { display: flex; flex-direction: column; gap: 1px; font-size: var(--font-base); color: var(--text-body); }

  .switch { position: relative; flex-shrink: 0; width: 36px; height: 20px; margin-top: 1px; }
  .switch input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
  .switch .track {
    display: block; width: 100%; height: 100%;
    border-radius: var(--radius-pill);
    background: var(--scrollbar-thumb);
    transition: background var(--speed) ease;
  }
  .switch .track::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 16px; height: 16px; border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.3);
    transition: transform var(--speed) ease;
  }
  .switch input:checked + .track { background: var(--primary); }
  .switch input:checked + .track::after { transform: translateX(16px); }
  .switch input:focus-visible + .track { box-shadow: var(--focus-ring); }

  .money-grid { max-width: 480px; }
  .money { position: relative; display: block; }
  .cur {
    position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
    font-size: var(--font-base); color: var(--text-faint); pointer-events: none;
  }
  .money input { padding-left: 24px; text-align: right; font-variant-numeric: tabular-nums; }

  .field-error { margin-top: 10px; font-size: var(--font-base); color: var(--danger); }

  /* Mini rendering of the PDF's cost box (kept paper-white in both themes). */
  .preview { display: flex; flex-direction: column; gap: 6px; }
  .preview-title { font-size: var(--font-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
  .preview-paper {
    background: #fff; border: 1.5px solid #94a3b8; border-radius: var(--radius-sm);
    padding: 10px 12px; min-height: 78px;
    display: flex; flex-direction: column; justify-content: center; gap: 6px;
    box-shadow: var(--shadow);
  }
  .preview-row { display: flex; justify-content: space-between; gap: 12px; font-size: var(--font-base); color: #111827; }
  .preview-row .lbl { font-weight: 700; }
  .preview-row .val { font-variant-numeric: tabular-nums; }
  .preview-empty { font-size: var(--font-sm); font-style: italic; color: #6b7280; text-align: center; }
  .preview-caption { font-size: var(--font-sm); color: var(--text-faint); }

  .error { color: var(--danger); font-size: var(--font-base); background: var(--danger-bg); border-radius: var(--radius-md); padding: 8px 12px; margin-top: 14px; }

  .actions { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
  /* The download anchor uses the global .btn-primary treatment (app.css). */

  .how-it-works { margin-top: 16px; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 10px 14px; background: var(--card-bg); }
  .how-it-works summary { font-size: var(--font-base); font-weight: 600; color: var(--text-soft); }
  .how-it-works ul { font-size: var(--font-base); color: var(--text-muted); margin-top: 8px; padding-left: 18px; }
  .how-it-works li { margin-bottom: 4px; }

  @media (max-width: 768px) {
    .grid { grid-template-columns: 1fr; }
    .span-2 { grid-column: span 1; }
    .pricing { grid-template-columns: 1fr; }
    .money-grid { max-width: none; }
    label.checkbox { align-self: start; padding-bottom: 0; }
  }
</style>
