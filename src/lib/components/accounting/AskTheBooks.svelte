<script lang="ts">
  // "Ask the books": one question in, one narrated report out. The answer
  // always cites the report it came from ("Based on: …") with a link to the
  // full page — the model narrates that report's data and nothing else.
  import { apiError } from '$lib/accounting/api'
  import Icon from '$lib/components/Icon.svelte'

  let { ai = true }: { ai?: boolean } = $props()

  let question = $state('')
  let asking = $state(false)
  let answer = $state('')
  let basedOn = $state<string | null>(null)
  let href = $state<string | null>(null)
  let error = $state('')

  const EXAMPLES = ['How did last month go?', 'Who owes us money?', 'Which jobs made money this year?']

  async function ask(q?: string) {
    if (q) question = q
    const text = question.trim()
    if (text.length < 3 || asking) return
    asking = true
    error = ''
    answer = ''
    basedOn = null
    href = null
    try {
      const r = await fetch('/api/accounting/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      })
      if (!r.ok) throw new Error(await apiError(r))
      const out = await r.json()
      if (!out.configured) { error = 'Ask the books isn’t configured on this server (OPENAI_API_KEY).'; return }
      answer = out.answer
      basedOn = out.basedOn
      href = out.href
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      asking = false
    }
  }
</script>

<section class="card ask">
  <div class="card-head"><h2><Icon name="spark" size={15} /> Ask the books</h2></div>
  <form
    class="ask-row"
    onsubmit={(e) => { e.preventDefault(); ask() }}
  >
    <input
      type="text"
      bind:value={question}
      placeholder={ai ? 'e.g. How much do we owe vendors right now?' : 'Needs OPENAI_API_KEY to be configured'}
      maxlength="300"
      disabled={!ai || asking}
      aria-label="Ask a question about the books"
    />
    <button class="btn-primary" type="submit" disabled={!ai || asking || question.trim().length < 3}>
      {asking ? 'Reading…' : 'Ask'}
    </button>
  </form>
  {#if !answer && !error}
    <div class="examples">
      {#each EXAMPLES as ex (ex)}
        <button class="chip ex" type="button" onclick={() => ask(ex)} disabled={!ai || asking}>{ex}</button>
      {/each}
    </div>
  {/if}
  {#if answer}
    <p class="answer">{answer}</p>
    {#if basedOn}
      <p class="based-on">
        Based on: <strong>{basedOn}</strong>
        {#if href}&nbsp;·&nbsp;<a href={href}>open the full report</a>{/if}
        — every figure above comes from that report, not the model.
      </p>
    {/if}
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
</section>

<style>
  .ask .card-head h2 { display: inline-flex; align-items: center; gap: 8px; }
  .ask-row { display: flex; gap: 10px; }
  .ask-row input { flex: 1; }
  .examples { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .ex { cursor: pointer; background: var(--bg); }
  .ex:hover:not(:disabled) { border-color: var(--primary); color: var(--primary-text); }
  .answer { font-size: var(--font-md); color: var(--text-body); line-height: 1.6; margin: 12px 0 0; max-width: 75ch; white-space: pre-line; }
  .based-on { font-size: var(--font-sm); color: var(--text-muted); margin: 8px 0 0; }
  .based-on a { color: var(--primary-text); font-weight: 600; }
</style>
