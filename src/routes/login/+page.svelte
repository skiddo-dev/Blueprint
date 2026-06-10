<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import type { PageData } from './$types'
  let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Sign In · Blueprint</title></svelte:head>

<div class="page">
  <div class="card">
    <div class="logo"><Icon name="logo" size={32} /></div>
    <h1>Blueprint</h1>
    <p class="sub">Grocery Construction Task Management</p>

    <ul class="value-bullets">
      <li><span class="li-ico"><Icon name="mail" size={15} /></span>Flagged vendor emails become Kanban tasks automatically</li>
      <li><span class="li-ico"><Icon name="board" size={15} /></span>Track every project, quote, and prospect in one board</li>
      <li><span class="li-ico"><Icon name="search" size={15} /></span>Find any task, quote, or prospect instantly with ⌘K search</li>
    </ul>

    {#if data.error}
      <p class="error" role="alert">{data.error}</p>
    {/if}

    <form class="signin-form" action="/auth/signin/microsoft-entra-id" method="POST">
      <button class="primary full-w" type="submit">
        <Icon name="lock" size={15} /> Sign in with Microsoft
      </button>
    </form>

    <p class="footer-note">Sign in with your company Microsoft account.</p>
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
    max-width: 360px;
    width: 100%;
    box-shadow: var(--shadow-hover);
  }
  /* The brand mark, scaled up from NavDrawer's .brand-mark. */
  .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
    color: #fff;
    margin-bottom: 12px;
  }
  h1 { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 4px; }
  .sub { font-size: 13px; color: var(--text-faint); margin-bottom: 20px; }
  .value-bullets {
    list-style: none;
    margin: 0 0 24px;
    padding: 0;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .value-bullets li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.4;
  }
  .li-ico { display: inline-flex; flex-shrink: 0; margin-top: 1px; color: var(--primary); }
  .error {
    background: var(--danger-bg);
    color: var(--danger);
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 20px;
  }
  .signin-form { margin-bottom: 16px; }
  .full-w { width: 100%; justify-content: center; padding: 12px; font-size: 14px; }
  .footer-note { font-size: 12px; color: var(--text-faint); }
</style>
