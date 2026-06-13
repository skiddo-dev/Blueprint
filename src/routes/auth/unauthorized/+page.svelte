<script lang="ts">
  import { enhance } from '$app/forms'
  import Icon from '$lib/components/Icon.svelte'
  import type { PageData, ActionData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()
  let submitting = $state(false)
</script>

<svelte:head><title>Access Pending · Blueprint</title></svelte:head>

<div class="page">
  <div class="card">
    {#if form?.success}
      <div class="icon ok"><Icon name="check" size={24} /></div>
      <h1>Request sent</h1>
      <p>
        We've let the admins know you'd like access. You'll be able to sign in
        once someone approves you — no need to do anything else.
      </p>
      <form action="/auth/signout" method="POST">
        <button class="secondary full-w" type="submit">Sign out</button>
      </form>
    {:else}
      <div class="icon"><Icon name="lock" size={24} /></div>
      <h1>Access Pending</h1>
      <p>
        You're signed in as <strong>{data.email || 'your account'}</strong>, but it
        hasn't been provisioned yet. Request access and an admin will be notified.
      </p>

      <form
        method="POST"
        action="?/requestAccess"
        use:enhance={() => {
          submitting = true
          return async ({ update }) => { await update(); submitting = false }
        }}
      >
        <textarea
          name="note"
          rows="2"
          maxlength="500"
          placeholder="Optional: who you are / which team (helps the admin)"
        ></textarea>
        {#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
        <button class="primary full-w" type="submit" disabled={submitting}>
          {#if !submitting}<Icon name="unlock" size={15} />{/if} {submitting ? 'Sending…' : 'Request access'}
        </button>
      </form>

      <form action="/auth/signout" method="POST">
        <button class="link" type="submit">Sign out</button>
      </form>
    {/if}
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
    max-width: 400px;
    width: 100%;
    box-shadow: var(--shadow-hover);
  }
  /* Tinted circle around the state glyph (lock = pending, check = sent). */
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--primary-bg);
    color: var(--primary);
    margin-bottom: 12px;
  }
  .icon.ok { background: var(--success-bg); color: var(--success); }
  h1 { font-size: var(--font-2xl); font-weight: 700; color: var(--text); margin-bottom: 10px; }
  p { font-size: var(--font-md); color: var(--text-muted); margin-bottom: 20px; line-height: 1.6; }
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    font-size: var(--font-base);
    font-family: inherit;
    resize: vertical;
    margin-bottom: 12px;
    background: var(--bg);
    color: var(--text);
  }
  .full-w { width: 100%; justify-content: center; padding: 12px; font-size: var(--font-md); }
  .error {
    color: var(--danger);
    font-size: var(--font-base);
    text-align: left;
    margin-bottom: 12px;
  }
  .link {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: var(--font-base);
    margin-top: 14px;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
