<script lang="ts">
  // Dashboard-style KPI tile (mirrors the dashboard's `.metric`): a big value, a
  // label, an accent top-border, and an optional colored sub-line (e.g. overdue
  // amount in red). Becomes a link when `href` is set.
  let {
    value,
    label,
    accent = '#6366f1',
    sub,
    tone = 'muted',
    href,
  }: {
    value: string
    label: string
    accent?: string
    sub?: string
    tone?: 'muted' | 'good' | 'bad' | 'warn'
    href?: string
  } = $props()
</script>

<svelte:element
  this={href ? 'a' : 'div'}
  class="tile"
  class:link={!!href}
  href={href}
  style:border-top-color={accent}
>
  <div class="val">{value}</div>
  <div class="lbl">{label}</div>
  {#if sub}<div class="sub {tone}">{sub}</div>{/if}
</svelte:element>

<style>
  .tile {
    display: block; text-decoration: none;
    background: var(--card-bg); border: 1px solid var(--border-card); border-top: 3px solid #6366f1;
    border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.05);
  }
  .tile.link { transition: box-shadow 0.12s, transform 0.12s; }
  .tile.link:hover { box-shadow: var(--shadow-hover); transform: translateY(-1px); }
  .val { font-size: 22px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; line-height: 1.15; }
  .lbl { font-size: 12px; color: var(--text-faint); margin-top: 3px; }
  .sub { font-size: 12px; font-weight: 600; margin-top: 6px; }
  .sub.muted { color: var(--text-muted); }
  .sub.good { color: #047857; }
  .sub.bad { color: #dc2626; }
  .sub.warn { color: #b45309; }
</style>
