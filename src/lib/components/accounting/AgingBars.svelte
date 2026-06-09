<script lang="ts">
  // A/R or A/P aging as a single horizontal stacked bar (one segment per bucket)
  // with a legend, via the project's Chart.svelte wrapper. Fed the bucket map
  // from getArAging()/getApAging(). Reused on the hub and the two aging pages.
  import Chart from '$lib/components/Chart.svelte'
  import { AGING_BUCKETS, type AgingBucket } from '$lib/accounting/invoicing'
  import { usd, usdCompact } from '$lib/accounting/format'
  import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'

  let {
    buckets,
    total,
    title,
    href,
  }: {
    buckets: Record<AgingBucket, number>
    total: number
    title: string
    href?: string // optional "view all" link on the header
  } = $props()

  const LABELS: Record<AgingBucket, string> = {
    current: 'Current', '1-30': '1–30d', '31-60': '31–60d', '61-90': '61–90d', '90+': '90+d',
  }
  // Green → escalating warm tones the further past due.
  const COLORS: Record<AgingBucket, string> = {
    current: '#10b981', '1-30': '#fbbf24', '31-60': '#f59e0b', '61-90': '#f97316', '90+': '#ef4444',
  }

  const data = $derived<ChartData<'bar', number[], string>>({
    labels: [''],
    datasets: AGING_BUCKETS.map((b) => ({
      label: LABELS[b],
      data: [(buckets[b] ?? 0) / 100],
      backgroundColor: COLORS[b],
      borderWidth: 0,
      barThickness: 30,
    })),
  })

  const opts: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (c: TooltipItem<'bar'>) => ` ${c.dataset.label}: ${usd(Math.round((Number(c.parsed.x) || 0) * 100))}`,
        },
      },
    },
    scales: {
      x: { stacked: true, beginAtZero: true, ticks: { font: { size: 10 }, callback: (v) => usdCompact(Math.round(Number(v) * 100)) } },
      y: { stacked: true, grid: { display: false }, ticks: { display: false } },
    },
  }
</script>

<article class="aging-card">
  <div class="head">
    <h3>{title}</h3>
    <span class="right">
      <span class="total">{usd(total)}</span>
      {#if href}<a class="more" {href}>View ›</a>{/if}
    </span>
  </div>
  {#if total === 0}
    <p class="empty">Nothing outstanding 🎉</p>
  {:else}
    <div class="canvas"><Chart type="bar" {data} options={opts} /></div>
  {/if}
</article>

<style>
  .aging-card {
    background: var(--card-bg); border: 1px solid var(--border-card); border-radius: 12px;
    padding: 14px 16px; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.05);
  }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .head h3 { font-size: 13px; font-weight: 600; color: var(--text-body); margin: 0; }
  .right { display: inline-flex; align-items: baseline; gap: 10px; }
  .total { font-size: 16px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .more { font-size: 12px; font-weight: 600; color: var(--primary-text); text-decoration: none; white-space: nowrap; }
  .more:hover { text-decoration: underline; }
  .canvas { position: relative; height: 150px; }
  .empty { color: var(--text-muted); font-size: 14px; padding: 18px 2px; }
</style>
