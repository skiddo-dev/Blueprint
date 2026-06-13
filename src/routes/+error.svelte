<script lang="ts">
  // Root error boundary — before this, a failed load or a stale link rendered
  // SvelteKit's unstyled default page. Same card language as /login.
  import Icon from '$lib/components/Icon.svelte'
  import { page } from '$app/state'

  const notFound = $derived(page.status === 404)
  const title = $derived(notFound ? 'Page not found' : 'Something went wrong')
  const detail = $derived(
    notFound
      ? 'That link doesn’t go anywhere — the page may have moved, or the id in the URL may be stale.'
      : (page.error?.message && page.error.message !== 'Internal Error' ? page.error.message : 'An unexpected error interrupted this page. Your data is fine — try again.'),
  )
</script>

<svelte:head><title>{page.status} · {title} · Blueprint</title></svelte:head>

<div class="page">
  <div class="card">
    <div class="logo"><Icon name="logo" size={32} /></div>
    <p class="status">{page.status}</p>
    <h1>{title}</h1>
    <p class="detail">{detail}</p>
    <div class="actions">
      <a class="btn-primary" href="/">Go to the board</a>
      {#if !notFound}
        <button class="secondary" onclick={() => location.reload()}>Reload</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    min-height: 100dvh; /* track the visible viewport so the card centres true on mobile (matches app shell) */
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 40px 36px;
    text-align: center;
    max-width: 380px;
    width: 100%;
    box-shadow: var(--shadow-hover);
  }
  .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: var(--radius-xl);
    background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
    color: #fff;
    margin-bottom: 16px;
  }
  .status {
    font-size: var(--font-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 2px;
  }
  h1 { font-size: var(--font-2xl); font-weight: 800; color: var(--text); margin-bottom: 8px; }
  .detail { font-size: var(--font-base); line-height: 1.5; color: var(--text-muted); margin-bottom: 24px; }
  .actions { display: flex; justify-content: center; gap: 10px; }
</style>
