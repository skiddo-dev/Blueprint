<script lang="ts">
  import { enhance } from '$app/forms'
  import type { PageData, ActionData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()
  let submitting = $state(false)
</script>

<svelte:head><title>Access Pending · Blueprint</title></svelte:head>

<div class="page">
  <div class="card">
    {#if form?.success}
      <div class="icon">✅</div>
      <h1>Request sent</h1>
      <p>
        We've let the admins know you'd like access. You'll be able to sign in
        once someone approves you — no need to do anything else.
      </p>
      <form action="/auth/signout" method="POST">
        <button class="secondary full-w" type="submit">Sign out</button>
      </form>
    {:else}
      <div class="icon">🔒</div>
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
          {submitting ? 'Sending…' : '🙋 Request access'}
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
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px 36px;
    text-align: center;
    max-width: 400px;
    width: 100%;
    box-shadow: var(--shadow-hover);
  }
  .icon { font-size: 40px; margin-bottom: 12px; }
  h1 { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 10px; }
  p { font-size: 14px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.6; }
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 12px;
    background: var(--bg);
    color: var(--text);
  }
  .full-w { width: 100%; justify-content: center; padding: 12px; font-size: 14px; }
  .error {
    color: #b91c1c;
    font-size: 13px;
    text-align: left;
    margin-bottom: 12px;
  }
  .link {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 13px;
    margin-top: 14px;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
