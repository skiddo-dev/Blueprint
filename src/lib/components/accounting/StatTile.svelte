<script lang="ts">
  // Dashboard-style KPI tile (mirrors the dashboard's `.metric`): a big value, a
  // label, an accent top-border, an optional colored pill chip (delta / urgency),
  // and an optional sparkline so the number carries direction. Becomes a link
  // when `href` is set.
  let {
    value,
    label,
    accent,
    sub,
    tone = 'muted',
    spark,
    href,
  }: {
    value: string
    label: string
    accent?: string // defaults to the brand primary (CSS) when unset
    sub?: string
    tone?: 'muted' | 'good' | 'bad' | 'warn'
    spark?: number[] // sampled series, oldest → newest; scaled to fit
    href?: string
  } = $props()

  // Normalize the series into polyline points for a 64×22 viewBox. A flat or
  // single-point series draws a midline rather than dividing by zero.
  const points = $derived.by(() => {
    if (!spark || spark.length < 2) return ''
    const min = Math.min(...spark)
    const max = Math.max(...spark)
    const span = max - min || 1
    const step = 64 / (spark.length - 1)
    return spark.map((v, i) => `${(i * step).toFixed(1)},${(19 - ((v - min) / span) * 16 + 1.5).toFixed(1)}`).join(' ')
  })
</script>

<svelte:element
  this={href ? 'a' : 'div'}
  class="tile"
  class:link={!!href}
  href={href}
  style:border-top-color={accent ?? null}
>
  <div class="val">{value}</div>
  <div class="lbl">{label}</div>
  {#if sub || points}
    <div class="foot">
      {#if sub}<span class="chip {tone}">{sub}</span>{/if}
      {#if points}
        <svg class="spark" width="64" height="22" viewBox="0 0 64 22" aria-hidden="true">
          <polyline {points} fill="none" stroke={accent ?? 'var(--primary)'} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
      {/if}
    </div>
  {/if}
</svelte:element>

<style>
  .tile {
    display: block; text-decoration: none;
    background: var(--card-bg); border: 1px solid var(--border-card); border-top: 3px solid var(--primary);
    border-radius: var(--radius-lg); padding: 14px 16px; box-shadow: var(--shadow);
  }
  .tile.link { transition: box-shadow 0.12s, transform 0.12s; }
  .tile.link:hover { box-shadow: var(--shadow-hover); transform: translateY(-1px); }
  .val { font-size: var(--font-2xl); font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; line-height: 1.15; }
  .lbl { font-size: var(--font-sm); color: var(--text-faint); margin-top: 3px; }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; min-height: 22px; }
  .spark { flex-shrink: 0; opacity: 0.9; }
  .chip {
    font-size: var(--font-xs); font-weight: 600; border-radius: var(--radius-pill); padding: 2px 8px; white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .chip.muted { background: var(--bg); color: var(--text-muted); border: 1px solid var(--border-soft); }
  .chip.good { background: var(--success-bg); color: var(--success); }
  .chip.bad { background: var(--danger-bg); color: var(--danger); }
  .chip.warn { background: var(--warning-bg); color: var(--warning); }
</style>
