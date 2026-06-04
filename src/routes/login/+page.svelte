<script lang="ts">
  import type { PageData } from './$types'
  let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Sign In · Blueprint</title></svelte:head>

<div class="page">
  <div class="card">
    <div class="logo">🏗️</div>
    <h1>Blueprint</h1>
    <p class="sub">Grocery Construction Task Management</p>

    {#if data.error}
      <p class="error" role="alert">{data.error}</p>
    {/if}

    <form class="signin-form" action="/auth/signin/microsoft-entra-id" method="POST">
      <button class="primary full-w" type="submit">
        🔐 Sign in with Microsoft
      </button>
    </form>

    <p class="footer-note">Sign in with your company Microsoft account.</p>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 40px 36px;
    text-align: center;
    max-width: 360px;
    width: 100%;
    box-shadow: 0 4px 24px rgba(15,23,42,0.08);
  }
  .logo { font-size: 48px; margin-bottom: 8px; }
  h1 { font-size: 24px; font-weight: 800; color: #1e293b; margin-bottom: 4px; }
  .sub { font-size: 13px; color: #94a3b8; margin-bottom: 28px; }
  .error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #b91c1c;
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 20px;
  }
  .signin-form { margin-bottom: 16px; }
  .full-w { width: 100%; justify-content: center; padding: 12px; font-size: 14px; }
  .footer-note { font-size: 12px; color: #94a3b8; }
</style>
