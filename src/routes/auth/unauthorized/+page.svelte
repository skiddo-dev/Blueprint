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
    max-width: 380px;
    width: 100%;
    box-shadow: 0 4px 24px rgba(15,23,42,0.08);
  }
  .icon { font-size: 40px; margin-bottom: 12px; }
  h1 { font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 10px; }
  p { font-size: 14px; color: #64748b; margin-bottom: 20px; line-height: 1.6; }
</style>
