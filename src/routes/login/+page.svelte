<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import type { PageData } from './$types'
  let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Sign In · Blueprint</title></svelte:head>

<div class="page">
  <div class="login-shell">
    <section class="auth-card" aria-labelledby="login-title">
      <div class="logo"><Icon name="logo" size={32} /></div>
      <h1 id="login-title">Blueprint</h1>
      <p class="sub">Grocery construction command center</p>

      {#if data.error}
        <p class="error" role="alert">{data.error}</p>
      {/if}

      <form class="signin-form" action="/auth/signin/microsoft-entra-id" method="POST">
        <button class="primary full-w" type="submit">
          <Icon name="lock" size={15} /> Sign in with Microsoft
        </button>
      </form>

      <div class="trust-row" aria-label="Workspace highlights">
        <span><Icon name="mail" size={14} /> Inbox</span>
        <span><Icon name="board" size={14} /> Board</span>
        <span><Icon name="quote" size={14} /> Quotes</span>
      </div>
    </section>

    <section class="preview-panel" aria-label="Blueprint board preview">
      <div class="preview-top">
        <div>
          <p class="preview-kicker">Live workspace</p>
          <h2>Raves grocery work</h2>
        </div>
        <span class="preview-badge"><Icon name="signal" size={13} /> Synced</span>
      </div>

      <div class="preview-metrics" aria-hidden="true">
        <div><strong>18</strong><span>open</span></div>
        <div><strong>4</strong><span>review</span></div>
        <div><strong>12</strong><span>stores</span></div>
      </div>

      <div class="mini-board" aria-hidden="true">
        <div class="mini-col todo">
          <div class="mini-head"><span>To Do</span><b>7</b></div>
          <div class="mini-card">
            <span class="store-chip">#417</span>
            <strong>Produce case electrical walk</strong>
            <p><Icon name="mail" size={11} /> Vendor inbox</p>
          </div>
          <div class="mini-card muted">
            <strong>Finalize freezer punch list</strong>
            <p><Icon name="person" size={11} /> Ben</p>
          </div>
        </div>
        <div class="mini-col progress">
          <div class="mini-head"><span>In Progress</span><b>5</b></div>
          <div class="mini-card">
            <span class="store-chip">#203</span>
            <strong>Pharmacy cabinet install</strong>
            <p><Icon name="calendar" size={11} /> Jun 14</p>
          </div>
        </div>
        <div class="mini-col review">
          <div class="mini-head"><span>Review</span><b>4</b></div>
          <div class="mini-card quote">
            <span class="store-chip">#918</span>
            <strong>Quote 2486 ready</strong>
            <p><Icon name="quote" size={11} /> Sent</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--primary-bg) 42%, var(--bg)) 0%, var(--bg) 46%, var(--card-bg) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .login-shell {
    width: min(980px, 100%);
    display: grid;
    grid-template-columns: minmax(320px, 0.85fr) minmax(420px, 1.15fr);
    gap: 18px;
    align-items: stretch;
  }
  .auth-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 40px 36px 28px;
    text-align: center;
    width: 100%;
    box-shadow: var(--shadow-pop);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  /* The brand mark, scaled up from NavDrawer's .brand-mark. */
  .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: var(--radius-xl);
    background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
    color: #fff;
    margin-bottom: 12px;
  }
  h1 { font-size: var(--font-2xl); font-weight: 800; color: var(--text); margin-bottom: 4px; letter-spacing: 0; }
  .sub { font-size: var(--font-base); color: var(--text-muted); margin-bottom: 24px; }
  .trust-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 18px;
  }
  .trust-row span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-muted);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 5px 9px;
    font-size: var(--font-xs);
    font-weight: 700;
  }
  .error {
    background: var(--danger-bg);
    color: var(--danger);
    font-size: var(--font-base);
    line-height: 1.4;
    text-align: left;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    margin-bottom: 20px;
  }
  .signin-form { margin-bottom: 16px; }
  .full-w { width: 100%; justify-content: center; padding: 12px; font-size: var(--font-md); }
  .preview-panel {
    min-height: 460px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 18px;
    box-shadow: var(--shadow-hover);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .preview-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .preview-kicker {
    color: var(--text-faint);
    font-size: var(--font-xs);
    font-weight: 800;
    text-transform: uppercase;
  }
  .preview-top h2 {
    color: var(--text);
    font-size: var(--font-xl);
    font-weight: 800;
    letter-spacing: 0;
    margin-top: 2px;
  }
  .preview-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--success);
    background: var(--success-bg);
    border: 1px solid var(--success-border);
    border-radius: var(--radius-pill);
    padding: 5px 9px;
    font-size: var(--font-xs);
    font-weight: 800;
  }
  .preview-metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .preview-metrics div {
    min-height: 66px;
    background: var(--bg);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-lg);
    padding: 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .preview-metrics strong {
    color: var(--text);
    font-size: var(--font-2xl);
    line-height: 1;
    letter-spacing: 0;
  }
  .preview-metrics span {
    color: var(--text-muted);
    font-size: var(--font-xs);
    font-weight: 700;
  }
  .mini-board {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .mini-col {
    min-width: 0;
    background: var(--bg);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-lg);
    padding: 9px;
  }
  .mini-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    color: var(--text-soft);
    font-size: var(--font-xs);
    font-weight: 800;
  }
  .mini-head b {
    color: #fff;
    border-radius: var(--radius-pill);
    min-width: 22px;
    text-align: center;
    padding: 1px 6px;
  }
  .todo .mini-head b { background: var(--primary); }
  .progress .mini-head b { background: #f59e0b; }
  .review .mini-head b { background: #3b82f6; }
  .mini-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--card-bg);
    border: 1px solid var(--border-card);
    border-top: 3px solid var(--primary);
    border-radius: var(--radius-md);
    padding: 10px;
    margin-bottom: 8px;
    box-shadow: var(--shadow);
  }
  .progress .mini-card { border-top-color: #f59e0b; }
  .review .mini-card { border-top-color: #3b82f6; }
  .mini-card.quote { border-top-color: var(--success-vivid); }
  .mini-card.muted { opacity: 0.78; }
  .mini-card strong {
    color: var(--text);
    font-size: var(--font-sm);
    line-height: 1.35;
  }
  .mini-card p {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-faint);
    font-size: var(--font-xs);
    font-weight: 600;
  }
  .store-chip {
    align-self: flex-start;
    color: #fff;
    background: var(--store-chip);
    border-radius: var(--radius-sm);
    padding: 2px 7px;
    font-size: var(--font-2xs);
    font-weight: 800;
  }

  @media (max-width: 820px) {
    .page {
      align-items: flex-start;
      padding: 0.75rem;
    }
    .login-shell {
      grid-template-columns: 1fr;
    }
    .auth-card {
      padding: 32px 24px 24px;
    }
    .preview-panel {
      min-height: 360px;
      padding: 14px;
    }
    .mini-board {
      grid-template-columns: 1fr;
    }
    .mini-col:nth-child(n + 2) {
      display: none;
    }
  }
</style>
