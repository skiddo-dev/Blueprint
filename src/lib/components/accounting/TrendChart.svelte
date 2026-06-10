<script lang="ts">
  // Monthly revenue-vs-expenses trend for the hub — the "how's the business
  // doing" view. Grouped bars via the project's Chart.svelte wrapper, fed the
  // monthlyActivity() rows (as plain numbers across the load boundary).
  import Chart from '$lib/components/Chart.svelte'
  import { usd, usdCompact } from '$lib/accounting/format'
  import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'

  let {
    months,
    title = 'Revenue vs expenses',
  }: {
    months: { month: string; revenue: number; expenses: number; net: number }[]
    title?: string
  } = $props()

  const MONTH = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  // Disambiguate years only when the window spans more than one.
  const spansYears = $derived(new Set(months.map((m) => m.month.slice(0, 4))).size > 1)
  const labels = $derived(months.map((m) => (spansYears ? `${MONTH(m.month)} ʼ${m.month.slice(2, 4)}` : MONTH(m.month))))

  const data = $derived<ChartData<'bar', number[], string>>({
    labels,
    datasets: [
      { label: 'Revenue', data: months.map((m) => m.revenue / 100), backgroundColor: '#10b981', borderRadius: 4, maxBarThickness: 72 },
      { label: 'Expenses', data: months.map((m) => m.expenses / 100), backgroundColor: '#f97316', borderRadius: 4, maxBarThickness: 72 },
    ],
  })

  const opts: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (c: TooltipItem<'bar'>) => ` ${c.dataset.label}: ${usd(Math.round((Number(c.parsed.y) || 0) * 100))}`,
          footer: (items: TooltipItem<'bar'>[]) => {
            const i = items[0]?.dataIndex
            return i == null ? '' : `Net: ${usd(months[i].net)}`
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: (v) => usdCompact(Math.round(Number(v) * 100)) } },
    },
  }
</script>

<article class="trend-card">
  <div class="head"><h3>{title}</h3></div>
  {#if months.length === 0}
    <p class="empty">No activity posted yet — the trend fills in as invoices, bills and payments hit the books.</p>
  {:else}
    <div class="canvas"><Chart type="bar" {data} options={opts} /></div>
  {/if}
</article>

<style>
  .trend-card {
    background: var(--card-bg); border: 1px solid var(--border-card); border-radius: 12px;
    padding: 14px 16px; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.05); margin-bottom: 18px;
  }
  .head h3 { font-size: 13px; font-weight: 600; color: var(--text-body); margin: 0 0 4px; }
  .canvas { position: relative; height: 230px; }
  .empty { color: var(--text-muted); font-size: 14px; padding: 14px 2px; }
</style>
