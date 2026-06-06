<svelte:head><title>Access Denied · Blueprint</title></svelte:head>

<div class="page">
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Access Pending</h1>
    <p>
      You're signed in, but your account hasn't been provisioned yet.
      Please contact an administrator to be added to Blueprint.
    </p>
    <form action="/auth/signout" method="POST">
      <button class="secondary" type="submit">Sign out</button>
    </form>
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
    max-width: 380px;
    width: 100%;
    box-shadow: var(--shadow-hover);
  }
  .icon { font-size: 40px; margin-bottom: 12px; }
  h1 { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 10px; }
  p { font-size: 14px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.6; }
</style>
