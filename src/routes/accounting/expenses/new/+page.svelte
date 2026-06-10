<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import AccountingShell from '$lib/components/accounting/AccountingShell.svelte'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'

  let { data }: { data: PageData } = $props()
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  const today = new Date().toISOString().slice(0, 10)
  let date = $state(today)
  let payee = $state('')
  let accountId = $state('')
  // svelte-ignore state_referenced_locally
  let paidFrom = $state(data.bankAccounts[0]?._id ?? '')
  let amount = $state('')
  let job = $state('')
  let memo = $state('')
  let saving = $state(false)
  let error = $state('')

  // Receipt scan: AI-prefill from a photo/PDF; the file itself uploads onto the
  // posted entry AFTER the user confirms and posts (orphan-free).
  let scanFile = $state<File | null>(null)
  let scanning = $state(false)
  let scanNote = $state('')

  const canSubmit = $derived(!saving && accountId !== '' && paidFrom !== '' && amount.trim() !== '')

  async function scanReceipt(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    scanning = true
    scanNote = ''
    error = ''
    try {
      const form = new FormData()
      form.set('file', file)
      const r = await fetch('/api/accounting/receipt-scan', { method: 'POST', body: form })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `HTTP ${r.status}`)
      const { prefill } = await r.json()
      if (prefill.payee) payee = prefill.payee
      if (prefill.amount) amount = prefill.amount
      if (prefill.date) date = prefill.date
      if (prefill.memo && !memo) memo = prefill.memo
      scanFile = file
      scanNote = `Read ${file.name} — check the draft, then post; the receipt attaches to the entry.`
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      scanning = false
      input.value = ''
    }
  }

  async function submit() {
    saving = true
    error = ''
    try {
      const r = await fetch('/api/accounting/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, payee, account_id: accountId, paid_from: paidFrom, amount, job: job.trim() || undefined, memo }),
      })
      if (!r.ok) throw new Error(await r.text())
      const entry = await r.json()
      if (scanFile && entry?._id) {
        const form = new FormData()
        form.set('owner_type', 'journal-entry')
        form.set('owner_id', entry._id)
        form.set('file', scanFile)
        // Best-effort: a failed upload shouldn't strand the posted expense.
        await fetch('/api/accounting/attachments', { method: 'POST', body: form }).catch(() => null)
        await goto(`/accounting/expenses/${entry._id}`)
        return
      }
      await goto(`/accounting/register/${paidFrom}`)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }
</script>

<svelte:head><title>Record expense · Blueprint</title></svelte:head>

<AccountingShell {user} title="Record expense" maxWidth="640px"
  crumbs={[{ label: 'Accounting', href: '/accounting' }, { label: 'Record expense' }]}>
  <p class="report-hint">Money spent without a vendor bill — fuel, supplies, a permit paid on the spot. Posts one balanced entry: the expense account up, the bank account down.</p>

  <section class="card">
    <div class="scan-row">
      <label class="btn-secondary scan" class:busy={scanning}>
        {#if scanning}Reading receipt…{:else}<Icon name="camera" size={13} /> Scan receipt{/if}
        <input type="file" accept="image/*,.pdf" onchange={scanReceipt} disabled={scanning} hidden />
      </label>
      {#if scanNote}<span class="scan-note">✓ {scanNote}</span>{/if}
    </div>
    <div class="grid">
      <label class="field">Date<input type="date" bind:value={date} /></label>
      <label class="field grow">Paid to
        <input type="text" list="payee-list" bind:value={payee} placeholder="Who got paid?" />
        <datalist id="payee-list">{#each data.vendors as v (v._id)}<option value={v.name}></option>{/each}</datalist>
      </label>
    </div>
    <div class="grid">
      <label class="field grow">Expense account
        <select bind:value={accountId}>
          <option value="" disabled selected>Select account…</option>
          {#each data.expenseAccounts as a (a._id)}<option value={a._id}>{a.code} · {a.name}</option>{/each}
        </select>
      </label>
      <label class="field grow">Paid from
        <select bind:value={paidFrom}>
          {#each data.bankAccounts as a (a._id)}<option value={a._id}>{a.code} · {a.name}</option>{/each}
        </select>
      </label>
      <label class="field">Amount<input type="text" inputmode="decimal" bind:value={amount} placeholder="0.00" /></label>
    </div>
    <div class="grid">
      <label class="field grow">Job (optional)
        <input type="text" list="job-list" bind:value={job} placeholder="job / project" />
        <datalist id="job-list">{#each data.jobs as j (j)}<option value={j}></option>{/each}</datalist>
      </label>
      <label class="field grow">Memo (optional)<input type="text" bind:value={memo} placeholder="What was it for?" /></label>
    </div>

    {#if error}<p class="error">{error}</p>{/if}

    <div class="actions">
      <a class="btn-secondary" href="/accounting">Cancel</a>
      <button class="btn-primary" type="button" onclick={submit} disabled={!canSubmit}>
        {saving ? 'Posting…' : 'Record expense'}
      </button>
    </div>
  </section>
</AccountingShell>

<style>
  .grid { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  .grid .grow { flex: 1; min-width: 180px; }
  .field input, .field select { width: 100%; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
  .scan-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px dashed var(--border); }
  .scan { cursor: pointer; }
  .scan.busy { opacity: 0.6; }
  .scan-note { font-size: 12.5px; color: var(--success); }
</style>
