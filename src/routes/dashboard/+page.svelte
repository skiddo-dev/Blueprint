<script lang="ts">
  import type { PageData } from './$types'
  import { STATUS_META, QUOTE_STATUSES, QUOTE_STATUS_META } from '$lib/constants'
  import type { Task, AppSession, Quote } from '$lib/types'
  import { extractStoreNumbers } from '$lib/storeNumbers'
  import { canonicalizeContact, canonicalizeWorkType } from '$lib/quoteCanonical'
  import Chart from '$lib/components/Chart.svelte'
  import PageShell from '$lib/components/PageShell.svelte'
  import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'
  import { page } from '$app/state'
  import { replaceState } from '$app/navigation'

  let { data }: { data: PageData } = $props()
  const tasks: Task[] = data.tasks

  // Session comes from the root layout load; this route is admin-only.
  const session = data.session as unknown as AppSession
  const user = { name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' }

  // ── Quote tracker (win/loss toggle) ───────────────────────────────────────
  const filterOptions = ['open', 'won', 'lost', 'all'] as const
  let quoteFilter = $state<(typeof filterOptions)[number]>('open')
  let savingId = $state<string | null>(null)
  let trackerError = $state('')
  async function setQuoteStatus(id: string, status: string) {
    const idx = genQuotes.findIndex(q => q._id === id)
    if (idx === -1) return
    const prev = genQuotes[idx].status
    savingId = id
    trackerError = ''
    // Optimistic: flip the status locally so the charts/metrics/tables update
    // instantly, then persist. Revert the row if the server write fails.
    genQuotes = genQuotes.map(q => (q._id === id ? { ...q, status: status as Quote['status'] } : q))
    try {
      const r = await fetch(`/api/quotes/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!r.ok) throw new Error(await r.text())
    } catch (e) {
      genQuotes = genQuotes.map(q => (q._id === id ? { ...q, status: prev } : q))
      trackerError = String(e)
    } finally {
      savingId = null
    }
  }

  // Copy the current filtered-view URL (the filters live in the query string).
  let copied = $state(false)
  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(location.href)
      copied = true
      setTimeout(() => (copied = false), 1500)
    } catch { /* clipboard unavailable — ignore */ }
  }

  // Export the currently-filtered quotes as CSV (matches the active sliders/selects).
  function csvCell(v: unknown): string {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  function exportCsv() {
    const header = ['Quote #', 'Year', 'Store', 'Point of Contact', 'Work Type', 'Amount', 'Date Sent', 'Status', 'PO']
    const rows = fq.map(q => [
      q.quote_number ?? '', q.year ?? '', q.store_number ?? '',
      canonicalizeContact(q.point_of_contact), canonicalizeWorkType(q.description),
      q.amount, q.date_sent ?? '', q.status ?? 'open', q.po ?? '',
    ])
    const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `quotes_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Palette & formatters ────────────────────────────────────────────────
  const PALETTE = [
    '#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899',
    '#8b5cf6', '#14b8a6', '#ef4444', '#f97316', '#06b6d4',
  ]
  const palette = (n: number) => Array.from({ length: n }, (_, i) => PALETTE[i % PALETTE.length])
  const TICK = '#94a3b8'
  const GRID = '#eef2f6'
  const WON = '#10b981'
  const LOST = '#ef4444'

  const money = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const moneyShort = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `$${Math.round(n)}`

  const parseQuote = (q: unknown): number => {
    if (typeof q !== 'string') return 0
    const n = parseFloat(q.replace(/[$,]/g, ''))
    return isNaN(n) ? 0 : n
  }

  type Valued = Task & { quote_value: number }
  const withValues: Valued[] = tasks.map(t => ({ ...t, quote_value: parseQuote(t.quote) }))

  // Tracked quotes (the `quotes` collection) drive the analytics below. Held as
  // $state so the win/loss toggle can update a row optimistically and have every
  // chart/metric/table react live — no full-page reload (mirrors the board's and
  // prospects' optimistic-persist pattern).
  let genQuotes = $state<Quote[]>(data.quotes ?? [])
  const totalQuotes = genQuotes.length

  // ── Interactive filters (sliders) ─────────────────────────────────────────
  // Every chart/metric below reacts to `fq`, the slider-filtered quote set.
  const allYears = [...new Set(genQuotes.map(q => q.year).filter(Boolean))].sort((a, b) => a - b)
  const yearMin = allYears[0] ?? new Date().getFullYear()
  const yearMax = allYears.at(-1) ?? yearMin
  const amtCeil = Math.max(10_000, Math.ceil(Math.max(0, ...genQuotes.map(q => Math.abs(q.amount))) / 10_000) * 10_000)
  // Initial filter values come from the URL → shareable/bookmarkable views.
  const sp = page.url.searchParams
  const numP = (k: string, d: number) => { const v = sp.get(k); const n = Number(v); return v !== null && Number.isFinite(n) ? n : d }
  let yearFrom = $state(numP('yf', yearMin))
  let yearTo = $state(numP('yt', yearMax))
  let amtLo = $state(numP('al', 0))
  let amtHi = $state(numP('ah', amtCeil))
  let monthFrom = $state(numP('mf', 1))
  let monthTo = $state(numP('mt', 12))
  let minSample = $state(numP('ms', 5)) // ≥N decided threshold for the win-rate charts
  let estimatorFilter = $state(sp.get('est') ?? 'All')
  let workTypeFilter = $state(sp.get('wt') ?? 'All')
  const estimatorOptions = $derived([...new Set(genQuotes.map(q => canonicalizeContact(q.point_of_contact)).filter(Boolean))].sort())
  const workTypeOptions = $derived([...new Set(genQuotes.map(q => canonicalizeWorkType(q.description)).filter(Boolean))].sort())

  const filtersActive = $derived(
    yearFrom !== yearMin || yearTo !== yearMax || amtLo !== 0 || amtHi !== amtCeil ||
    monthFrom !== 1 || monthTo !== 12 || minSample !== 5 ||
    estimatorFilter !== 'All' || workTypeFilter !== 'All',
  )
  function resetFilters() {
    yearFrom = yearMin; yearTo = yearMax; amtLo = 0; amtHi = amtCeil
    monthFrom = 1; monthTo = 12; minSample = 5
    estimatorFilter = 'All'; workTypeFilter = 'All'
  }

  // Persist active (non-default) filters to the URL — shallow replaceState, so
  // no load re-run or scroll jump. Makes the current view shareable.
  $effect(() => {
    const p = new URLSearchParams()
    if (yearFrom !== yearMin) p.set('yf', String(yearFrom))
    if (yearTo !== yearMax) p.set('yt', String(yearTo))
    if (amtLo !== 0) p.set('al', String(amtLo))
    if (amtHi !== amtCeil) p.set('ah', String(amtHi))
    if (monthFrom !== 1) p.set('mf', String(monthFrom))
    if (monthTo !== 12) p.set('mt', String(monthTo))
    if (minSample !== 5) p.set('ms', String(minSample))
    if (estimatorFilter !== 'All') p.set('est', estimatorFilter)
    if (workTypeFilter !== 'All') p.set('wt', workTypeFilter)
    const qs = p.toString()
    replaceState(qs ? `?${qs}` : page.url.pathname, {})
  })

  const fq = $derived.by(() => {
    const ylo = Math.min(yearFrom, yearTo), yhi = Math.max(yearFrom, yearTo)
    const alo = Math.min(amtLo, amtHi), ahi = Math.max(amtLo, amtHi)
    const mlo = Math.min(monthFrom, monthTo), mhi = Math.max(monthFrom, monthTo)
    const allMonths = mlo === 1 && mhi === 12
    return genQuotes.filter(q => {
      const yr = q.year ?? 0, a = Math.abs(q.amount)
      const mo = q.date_sent ? Number(q.date_sent.slice(5, 7)) : 0
      // Keep no-date quotes only when the month window is wide open.
      const monthOk = allMonths || (mo >= mlo && mo <= mhi)
      const estOk = estimatorFilter === 'All' || canonicalizeContact(q.point_of_contact) === estimatorFilter
      const wtOk = workTypeFilter === 'All' || canonicalizeWorkType(q.description) === workTypeFilter
      return yr >= ylo && yr <= yhi && a >= alo && a <= ahi && monthOk && estOk && wtOk
    })
  })

  // ── Helpers ───────────────────────────────────────────────────────────────
  const sumInto = (map: Map<string, number>, key: string, val: number) =>
    map.set(key, (map.get(key) ?? 0) + val)
  const winRateOf = (rs: Quote[]) => {
    const w = rs.filter(q => q.status === 'won').length
    const l = rs.filter(q => q.status === 'lost').length
    return { w, l, decided: w + l, rate: w + l ? w / (w + l) : 0 }
  }
  const groupQuotes = (rows: Quote[], key: (q: Quote) => string) => {
    const m = new Map<string, Quote[]>()
    for (const q of rows) {
      const k = key(q) || 'Unknown'
      const arr = m.get(k)
      if (arr) arr.push(q); else m.set(k, [q])
    }
    return m
  }
  const median = (xs: number[]) => {
    if (!xs.length) return 0
    const s = [...xs].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }

  // Task quotes (Kanban board) — always included in the value/pipeline totals.
  const taskQuoted = withValues.filter(t => t.quote_value > 0)
  const taskRecs = taskQuoted.map(t => ({
    value: t.quote_value, type: t.quote_type ?? 'Not Set',
    person: t.assigned_to || 'Unassigned', date: t.date,
  }))

  type QuoteRec = { value: number; type: string; person: string; date?: string }
  const quoteRecs = $derived<QuoteRec[]>([
    ...taskRecs,
    ...fq.map(q => ({
      value: q.amount,
      type: canonicalizeWorkType(q.description) || 'Not Set',
      person: canonicalizeContact(q.point_of_contact) || 'Unassigned',
      date: q.date_sent,
    })),
  ])

  // Quote tracker rows (newest first), filtered by the sliders + status chip.
  const shownQuotes = $derived(
    [...fq]
      .filter(q => quoteFilter === 'all' || (q.status ?? 'open') === quoteFilter)
      .sort((a, b) => (b.date_sent ?? '').localeCompare(a.date_sent ?? ''))
      .slice(0, 200),
  )

  // ── Pipeline + headline metrics ───────────────────────────────────────────
  const STATUS_TO_STAGE: Record<string, string> = { won: 'Won', lost: 'Lost', open: 'Sent' }
  const stages = $derived.by(() => {
    const value = new Map<string, number>(), count = new Map<string, number>()
    for (const t of taskQuoted) { const k = t.quote_status ?? 'Draft'; sumInto(value, k, t.quote_value); sumInto(count, k, 1) }
    for (const q of fq) { const k = STATUS_TO_STAGE[q.status ?? 'open'] ?? 'Sent'; sumInto(value, k, q.amount); sumInto(count, k, 1) }
    return { value, count }
  })
  const wonCount = $derived(stages.count.get('Won') ?? 0)
  const lostCount = $derived(stages.count.get('Lost') ?? 0)
  const winRate = $derived(wonCount + lostCount > 0 ? wonCount / (wonCount + lostCount) : null)
  const wonValue = $derived(stages.value.get('Won') ?? 0)
  const openPipeline = $derived((stages.value.get('Draft') ?? 0) + (stages.value.get('Sent') ?? 0))
  const expectedValue = $derived(openPipeline * (winRate ?? 0))
  const totalValue = $derived(quoteRecs.reduce((s, r) => s + r.value, 0))
  const quoteCount = $derived(quoteRecs.length)
  const pct = (n: number) => `${Math.round(n * 100)}%`

  const metrics = $derived([
    { label: 'Win Rate', value: winRate === null ? '—' : pct(winRate), accent: WON },
    { label: 'Won Value', value: money(wonValue), accent: '#059669' },
    { label: 'Open Pipeline', value: money(openPipeline), accent: '#6366f1' },
    { label: 'Expected (open × win)', value: money(expectedValue), accent: '#8b5cf6' },
    { label: 'Total Quoted', value: money(totalValue), accent: '#3b82f6' },
    { label: 'Quotes', value: String(quoteCount), accent: '#ec4899' },
  ])

  // ── Insight aggregations (all reactive to the sliders) ────────────────────
  const estWin = $derived(
    [...groupQuotes(fq, q => canonicalizeContact(q.point_of_contact)).entries()]
      .map(([name, rs]) => ({ name, ...winRateOf(rs) }))
      .filter(e => e.decided >= minSample)
      .sort((a, b) => b.rate - a.rate),
  )
  const typeWin = $derived(
    [...groupQuotes(fq, q => canonicalizeWorkType(q.description)).entries()]
      .map(([name, rs]) => ({ name, ...winRateOf(rs) }))
      .filter(e => e.decided >= minSample)
      .sort((a, b) => b.rate - a.rate),
  )

  const sizeBands: Array<[string, number, number]> = [
    ['<$10k', 0, 10_000], ['$10–50k', 10_000, 50_000], ['$50–150k', 50_000, 150_000],
    ['$150–300k', 150_000, 300_000], ['$300k+', 300_000, Infinity],
  ]
  const inBand = (q: Quote, lo: number, hi: number) => Math.abs(q.amount) >= lo && Math.abs(q.amount) < hi
  const sizeWon = $derived(sizeBands.map(([, lo, hi]) => fq.filter(q => q.status === 'won' && inBand(q, lo, hi)).length))
  const sizeLost = $derived(sizeBands.map(([, lo, hi]) => fq.filter(q => q.status === 'lost' && inBand(q, lo, hi)).length))

  const fYears = $derived([...new Set(fq.map(q => q.year).filter(Boolean))].sort((a, b) => a - b))
  const yoyQuoted = $derived(fYears.map(y => fq.filter(q => q.year === y).reduce((s, q) => s + q.amount, 0)))
  const yoyWon = $derived(fYears.map(y => fq.filter(q => q.year === y && q.status === 'won').reduce((s, q) => s + q.amount, 0)))
  const yoyWinRate = $derived(fYears.map(y => { const r = winRateOf(fq.filter(q => q.year === y)); return r.decided ? Math.round(r.rate * 100) : null }))

  const topStores = $derived(
    [...groupQuotes(fq, q => (q.store_number || '').trim()).entries()]
      .filter(([s]) => s && s.toUpperCase() !== 'N/A' && s !== 'Unknown')
      .map(([store, rs]) => ({ store, value: rs.reduce((a, q) => a + q.amount, 0), n: rs.length }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
  )

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthCounts = $derived.by(() => {
    const c = Array(12).fill(0) as number[]
    for (const q of fq) { const mo = q.date_sent ? Number(q.date_sent.slice(5, 7)) : NaN; if (mo >= 1 && mo <= 12) c[mo - 1]++ }
    return c
  })

  const medianWon = $derived(median(fq.filter(q => q.status === 'won').map(q => Math.abs(q.amount))))
  const medianLost = $derived(median(fq.filter(q => q.status === 'lost').map(q => Math.abs(q.amount))))

  const typeByValue = $derived.by(() => {
    const m = new Map<string, number>()
    for (const r of quoteRecs) sumInto(m, r.type, r.value)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  })

  const estimatorScores = $derived(
    [...groupQuotes(fq, q => canonicalizeContact(q.point_of_contact)).entries()]
      .map(([name, rs]) => {
        const { w, l, rate, decided } = winRateOf(rs)
        const dec = rs.filter(q => q.status === 'won' || q.status === 'lost')
        const avg = dec.length ? dec.reduce((s, q) => s + Math.abs(q.amount), 0) / dec.length : 0
        const types = new Map<string, number>()
        for (const q of rs) sumInto(types, canonicalizeWorkType(q.description), 1)
        const topType = [...types.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
        return { name, n: rs.length, w, l, decided, rate, avg, topType, value: rs.reduce((s, q) => s + q.amount, 0) }
      })
      .sort((a, b) => b.value - a.value),
  )

  const storeGroups = $derived(
    [...groupQuotes(fq, q => (q.store_number || '').trim()).entries()]
      .filter(([s]) => s && s.toUpperCase() !== 'N/A' && s !== 'Unknown'),
  )
  const accounts = $derived(
    storeGroups
      .map(([store, rs]) => { const { rate, decided } = winRateOf(rs); return { store, n: rs.length, value: rs.reduce((s, q) => s + q.amount, 0), rate, decided, atRisk: decided >= 3 && rate < 0.4, last: rs.map(q => q.date_sent ?? '').sort().at(-1) ?? '' } })
      .sort((a, b) => b.value - a.value),
  )
  const atRiskCount = $derived(accounts.filter(a => a.atRisk).length)
  const firstTimeWin = $derived(winRateOf(storeGroups.filter(([, rs]) => rs.length === 1).flatMap(([, rs]) => rs)))
  const repeatWin = $derived(winRateOf(storeGroups.filter(([, rs]) => rs.length >= 3).flatMap(([, rs]) => rs)))

  const paretoEst = $derived(estimatorScores.slice(0, 8))
  const paretoCum = $derived.by(() => {
    const total = estimatorScores.reduce((s, e) => s + e.value, 0)
    let cum = 0
    return paretoEst.map(e => { cum += e.value; return total ? Math.round((cum / total) * 100) : 0 })
  })

  // Forecast + PO hygiene use the FULL log (independent of the view sliders).
  const annualValue = (y: number) => genQuotes.filter(q => q.year === y).reduce((s, q) => s + q.amount, 0)
  const curYear = allYears.at(-1) ?? new Date().getFullYear()
  const curMonth = Math.max(0, ...genQuotes.filter(q => q.year === curYear && q.date_sent).map(q => Number(q.date_sent!.slice(5, 7))))
  const priorShares = allYears.filter(y => y < curYear).map(y => {
    const a = annualValue(y)
    const upto = genQuotes.filter(q => q.year === y && q.date_sent && Number(q.date_sent.slice(5, 7)) <= curMonth).reduce((s, q) => s + q.amount, 0)
    return a ? upto / a : 0
  }).filter(x => x > 0)
  const projectedFY = priorShares.length ? annualValue(curYear) / (priorShares.reduce((a, b) => a + b, 0) / priorShares.length) : null

  const poNeedsReview = $derived(
    genQuotes
      .filter(q => (q.po || '').trim() && q.status !== 'won')
      .sort((a, b) => (b.date_sent ?? '').localeCompare(a.date_sent ?? ''))
      .slice(0, 50),
  )

  // ── Chart datasets (reactive) ─────────────────────────────────────────────
  const bar = (data: number[], colors: string[]) =>
    [{ data, backgroundColor: colors, borderRadius: 6, borderSkipped: false as const, maxBarThickness: 56 }]
  // Colour win-rate bars green/amber/red by how strong the rate is.
  const rateColors = (rates: number[]) => rates.map(r => (r >= 0.66 ? WON : r >= 0.4 ? '#f59e0b' : LOST))

  const winByEstimatorData = $derived<ChartData<'bar', number[], string>>({
    labels: estWin.map(e => `${e.name} (${e.w}-${e.l})`),
    datasets: [{ data: estWin.map(e => Math.round(e.rate * 100)), backgroundColor: rateColors(estWin.map(e => e.rate)), borderRadius: 5, maxBarThickness: 22 }],
  })

  const winByTypeData = $derived<ChartData<'bar', number[], string>>({
    labels: typeWin.map(e => `${e.name} (${e.w}-${e.l})`),
    datasets: [{ data: typeWin.map(e => Math.round(e.rate * 100)), backgroundColor: rateColors(typeWin.map(e => e.rate)), borderRadius: 5, maxBarThickness: 22 }],
  })

  const dealSizeData = $derived<ChartData<'bar', number[], string>>({
    labels: sizeBands.map(([l]) => l),
    datasets: [
      { label: 'Won', data: sizeWon, backgroundColor: WON, borderRadius: 4, maxBarThickness: 46 },
      { label: 'Lost', data: sizeLost, backgroundColor: LOST, borderRadius: 4, maxBarThickness: 46 },
    ],
  })

  const yoyData = $derived<ChartData<'bar' | 'line', (number | null)[], string>>({
    labels: fYears.map(String),
    datasets: [
      { type: 'bar', label: 'Quoted', data: yoyQuoted, backgroundColor: '#c7d2fe', borderRadius: 4, order: 3 },
      { type: 'bar', label: 'Won', data: yoyWon, backgroundColor: WON, borderRadius: 4, order: 2 },
      { type: 'line', label: 'Win %', data: yoyWinRate, borderColor: '#f59e0b', backgroundColor: '#f59e0b', yAxisID: 'y1', tension: 0.3, borderWidth: 2, pointRadius: 3, spanGaps: true, order: 1 },
    ],
  })

  const topStoresData = $derived<ChartData<'bar', number[], string>>({
    labels: topStores.map(s => `#${s.store} (×${s.n})`),
    datasets: bar(topStores.map(s => s.value), palette(topStores.length)),
  })

  const seasonalityData = $derived<ChartData<'bar', number[], string>>({
    labels: MONTHS,
    datasets: bar(monthCounts, MONTHS.map(() => '#6366f1')),
  })

  const valueByTypeData = $derived<ChartData<'bar', number[], string>>({
    labels: typeByValue.map(([k]) => k),
    datasets: bar(typeByValue.map(([, v]) => v), palette(typeByValue.length)),
  })

  const pipelineData = $derived<ChartData<'doughnut', number[], string>>({
    labels: [...QUOTE_STATUSES],
    datasets: [{
      data: QUOTE_STATUSES.map(s => stages.value.get(s) ?? 0),
      backgroundColor: QUOTE_STATUSES.map(s => QUOTE_STATUS_META[s].color),
      borderColor: '#fff', borderWidth: 2,
    }],
  })

  const paretoData = $derived<ChartData<'bar' | 'line', (number | null)[], string>>({
    labels: paretoEst.map(e => e.name),
    datasets: [
      { type: 'bar', label: 'Value', data: paretoEst.map(e => e.value), backgroundColor: '#6366f1', borderRadius: 4, order: 2 },
      { type: 'line', label: 'Cumulative %', data: paretoCum, borderColor: '#f59e0b', backgroundColor: '#f59e0b', yAxisID: 'y1', tension: 0.3, borderWidth: 2, pointRadius: 3, order: 1 },
    ],
  })

  // ── Shared chart options (static) ─────────────────────────────────────────
  const moneyBarOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => ` ${money(c.parsed.y ?? 0)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
      y: {
        beginAtZero: true,
        grid: { color: GRID },
        ticks: { color: TICK, font: { size: 11 }, callback: v => moneyShort(Number(v)) },
      },
    },
  } satisfies ChartOptions<'bar'>

  // Horizontal money bars (top stores).
  const hMoneyBarOpts = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => ` ${money(c.parsed.x ?? 0)}` } },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: GRID },
        ticks: { color: TICK, font: { size: 11 }, callback: v => moneyShort(Number(v)) },
      },
      y: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
    },
  } satisfies ChartOptions<'bar'>

  // Horizontal win-rate (%) bars (estimator / work type).
  const winPctOpts = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => ` ${c.parsed.x}% win rate` } },
    },
    scales: {
      x: {
        beginAtZero: true, max: 100,
        grid: { color: GRID },
        ticks: { color: TICK, font: { size: 11 }, callback: v => `${v}%` },
      },
      y: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
    },
  } satisfies ChartOptions<'bar'>

  // Grouped count bars with a legend (won vs lost by deal size; seasonality).
  const countBarOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => ` ${c.parsed.y} quote${c.parsed.y === 1 ? '' : 's'}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 }, precision: 0 } },
    },
  } satisfies ChartOptions<'bar'>

  const dealSizeOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', align: 'end', labels: { color: '#475569', font: { size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: { callbacks: { label: (c: TooltipItem<'bar'>) => ` ${c.dataset.label}: ${c.parsed.y}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 }, precision: 0 } },
    },
  } satisfies ChartOptions<'bar'>

  // Dual-axis combo: quoted/won value bars (left) + win-rate line (right).
  const yoyOpts: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', align: 'end', labels: { color: '#475569', font: { size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (c: TooltipItem<'bar' | 'line'>) =>
            c.dataset.label === 'Win %'
              ? ` Win rate: ${c.parsed.y}%`
              : ` ${c.dataset.label}: ${money(Number(c.parsed.y) || 0)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 }, callback: v => moneyShort(Number(v)) } },
      y1: { position: 'right', beginAtZero: true, max: 100, grid: { display: false }, ticks: { color: '#f59e0b', font: { size: 11 }, callback: v => `${v}%` } },
    },
  }

  // Pareto: value bars (left) + cumulative-% line (right).
  const paretoOpts: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', align: 'end', labels: { color: '#475569', font: { size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (c: TooltipItem<'bar' | 'line'>) =>
            c.dataset.label === 'Cumulative %' ? ` Cumulative: ${c.parsed.y}%` : ` ${money(Number(c.parsed.y) || 0)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK, font: { size: 11 }, callback: v => moneyShort(Number(v)) } },
      y1: { position: 'right', beginAtZero: true, max: 100, grid: { display: false }, ticks: { color: '#f59e0b', font: { size: 11 }, callback: v => `${v}%` } },
    },
  }

  const doughnutOpts = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#475569', font: { size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 12 },
      },
      tooltip: { callbacks: { label: (c: TooltipItem<'doughnut'>) => ` ${c.label}: ${c.parsed}` } },
    },
  } satisfies ChartOptions<'doughnut'>

  // Like doughnutOpts but money-formatted tooltips (for value-by-stage).
  const moneyDoughnutOpts = {
    ...doughnutOpts,
    plugins: {
      ...doughnutOpts.plugins,
      tooltip: { callbacks: { label: (c: TooltipItem<'doughnut'>) => ` ${c.label}: ${money(c.parsed)}` } },
    },
  } satisfies ChartOptions<'doughnut'>
</script>

<svelte:head><title>Dashboard · Blueprint</title></svelte:head>

<PageShell {user} title="📊 Dashboard">
  {#snippet head()}
    <h1 class="page-title">📊 Dashboard</h1>
    <p class="page-sub">Quote insights from the RAVES quote log · Admin only</p>
    <hr style="margin: 12px 0 20px" />
  {/snippet}

    {#if tasks.length === 0 && genQuotes.length === 0}
      <p class="empty">No tasks or generated quotes found yet.</p>
    {:else}
      <!-- Interactive filters (sliders) — every chart/metric below reacts live -->
      <div class="filter-bar">
        <div class="filter-group">
          <span class="filter-label">Years <strong>{Math.min(yearFrom, yearTo)}–{Math.max(yearFrom, yearTo)}</strong></span>
          <input type="range" min={yearMin} max={yearMax} step="1" bind:value={yearFrom} aria-label="Year from" />
          <input type="range" min={yearMin} max={yearMax} step="1" bind:value={yearTo} aria-label="Year to" />
        </div>
        <div class="filter-group">
          <span class="filter-label">
            Deal size <strong>{money(Math.min(amtLo, amtHi))} – {Math.max(amtLo, amtHi) >= amtCeil ? money(amtCeil) + '+' : money(Math.max(amtLo, amtHi))}</strong>
          </span>
          <input type="range" min="0" max={amtCeil} step="5000" bind:value={amtLo} aria-label="Minimum deal size" />
          <input type="range" min="0" max={amtCeil} step="5000" bind:value={amtHi} aria-label="Maximum deal size" />
        </div>
        <div class="filter-group">
          <span class="filter-label">Months <strong>{MONTHS[Math.min(monthFrom, monthTo) - 1]}–{MONTHS[Math.max(monthFrom, monthTo) - 1]}</strong></span>
          <input type="range" min="1" max="12" step="1" bind:value={monthFrom} aria-label="Month from" />
          <input type="range" min="1" max="12" step="1" bind:value={monthTo} aria-label="Month to" />
        </div>
        <div class="filter-group">
          <span class="filter-label">Min decided <span class="muted">(win-rate charts)</span> <strong>≥{minSample}</strong></span>
          <input type="range" min="1" max="15" step="1" bind:value={minSample} aria-label="Minimum decided sample" />
        </div>
        <div class="filter-group">
          <span class="filter-label">Estimator</span>
          <select bind:value={estimatorFilter} aria-label="Filter by estimator">
            <option value="All">All estimators</option>
            {#each estimatorOptions as e}<option value={e}>{e}</option>{/each}
          </select>
        </div>
        <div class="filter-group">
          <span class="filter-label">Work type</span>
          <select bind:value={workTypeFilter} aria-label="Filter by work type">
            <option value="All">All work types</option>
            {#each workTypeOptions as w}<option value={w}>{w}</option>{/each}
          </select>
        </div>
        <div class="filter-meta">
          <span>{fq.length} of {totalQuotes} quotes</span>
          {#if filtersActive}<button class="chip" onclick={resetFilters}>Reset</button>{/if}
          <button class="chip" onclick={copyShareLink}>{copied ? '✓ Copied' : '🔗 Copy link'}</button>
          <button class="chip" onclick={exportCsv}>⬇ Export CSV</button>
        </div>
      </div>

      <!-- Metrics -->
      <h2 class="section-heading">💰 Quote Summary</h2>
      <div class="metrics-grid">
        {#each metrics as m}
          <div class="metric" style:border-top-color={m.accent}>
            <div class="metric-val">{m.value}</div>
            <div class="metric-lbl">{m.label}</div>
          </div>
        {/each}
        <div class="metric" style:border-top-color="#14b8a6">
          <div class="metric-val">{projectedFY ? money(projectedFY) : '—'}</div>
          <div class="metric-lbl">{curYear} Projected (FY)</div>
        </div>
      </div>

      <hr style="margin: 22px 0 18px" />
      <h2 class="section-heading">📈 Insights</h2>

      <section class="charts-grid">
        <article class="chart-card">
          <h3>🏆 Win Rate by Estimator <span class="muted">(≥{minSample} decided)</span></h3>
          <div class="canvas-wrap"><Chart type="bar" data={winByEstimatorData} options={winPctOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>🎯 Win Rate by Work Type <span class="muted">(≥{minSample} decided)</span></h3>
          <div class="canvas-wrap"><Chart type="bar" data={winByTypeData} options={winPctOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>📐 Won vs Lost by Deal Size</h3>
          <div class="canvas-wrap"><Chart type="bar" data={dealSizeData} options={dealSizeOpts} /></div>
          <p class="chart-note">Median won {money(medianWon)} · lost {money(medianLost)} — larger bids convert worse</p>
        </article>

        <article class="chart-card">
          <h3>💰 Quote Pipeline by Stage</h3>
          <div class="canvas-wrap"><Chart type="doughnut" data={pipelineData} options={moneyDoughnutOpts} /></div>
        </article>

        <article class="chart-card span-all">
          <h3>📈 Growth: Quoted vs Won by Year <span class="muted">(win-rate line)</span></h3>
          <div class="canvas-wrap tall"><Chart type="bar" data={yoyData} options={yoyOpts} /></div>
        </article>

        <article class="chart-card span-all">
          <h3>📊 Value Concentration by Estimator <span class="muted">(Pareto — cumulative %)</span></h3>
          <div class="canvas-wrap tall"><Chart type="bar" data={paretoData} options={paretoOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>🏬 Top Stores by Value <span class="muted">(repeat accounts)</span></h3>
          <div class="canvas-wrap"><Chart type="bar" data={topStoresData} options={hMoneyBarOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>🗓️ Quotes by Month <span class="muted">(seasonality)</span></h3>
          <div class="canvas-wrap"><Chart type="bar" data={seasonalityData} options={countBarOpts} /></div>
        </article>

        <article class="chart-card">
          <h3>💵 Total Quote Value by Type</h3>
          <div class="canvas-wrap"><Chart type="bar" data={valueByTypeData} options={moneyBarOpts} /></div>
        </article>
      </section>

      <!-- Estimator scorecards -->
      <hr style="margin: 24px 0 16px" />
      <h2 class="section-heading">🥇 Estimator Scorecards</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Estimator</th><th>Quotes</th><th>Win %</th><th>Avg Deal</th><th>Top Type</th><th>Value</th></tr></thead>
          <tbody>
            {#each estimatorScores as e}
              <tr>
                <td>{e.name}</td>
                <td>{e.n}</td>
                <td>{e.decided ? `${Math.round(e.rate)}% (${e.w}-${e.l})` : '—'}</td>
                <td>{e.avg ? money(e.avg) : '—'}</td>
                <td>{e.topType}</td>
                <td>{money(e.value)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Account intelligence -->
      <hr style="margin: 24px 0 16px" />
      <div class="tracker-head">
        <h2 class="section-heading" style="margin: 0">🏬 Account Intelligence</h2>
        <span class="muted-note" style="margin: 0">
          Repeat (3+) win {repeatWin.decided ? Math.round(repeatWin.rate * 100) + '%' : '—'} ·
          first-time {firstTimeWin.decided ? Math.round(firstTimeWin.rate * 100) + '%' : '—'}
          {#if atRiskCount} · <span class="risk-text">⚠ {atRiskCount} at-risk</span>{/if}
        </span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Store</th><th>Quotes</th><th>Value</th><th>Win %</th><th>Last Quoted</th></tr></thead>
          <tbody>
            {#each accounts.slice(0, 15) as a}
              <tr>
                <td>#{a.store}{#if a.atRisk} <span class="risk-badge" title="≥3 decided, win rate under 40%">⚠</span>{/if}</td>
                <td>{a.n}</td>
                <td>{money(a.value)}</td>
                <td class:risk-text={a.atRisk}>{a.decided ? `${Math.round(a.rate * 100)}%` : '—'}</td>
                <td>{a.last || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if poNeedsReview.length}
        <!-- PO-based data hygiene -->
        <hr style="margin: 24px 0 16px" />
        <h2 class="section-heading">🧾 Needs Review <span class="muted">(PO present, not marked Won)</span></h2>
        {#if trackerError}<p class="error">❌ {trackerError}</p>{/if}
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Store</th><th>Work Type</th><th>Amount</th><th>PO</th><th></th></tr></thead>
            <tbody>
              {#each poNeedsReview as q (q._id)}
                <tr>
                  <td>{q.date_sent ?? '—'}</td>
                  <td>{q.store_number || '—'}</td>
                  <td>{q.description || '—'}</td>
                  <td>{money(q.amount)}</td>
                  <td>{q.po}</td>
                  <td><button class="mark-won" disabled={savingId === q._id} onclick={() => setQuoteStatus(q._id, 'won')}>Mark Won</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- Quote tracker (win/loss toggle) -->
      <hr style="margin: 24px 0 16px" />
      <div class="tracker-head">
        <h2 class="section-heading" style="margin: 0">🧾 Quote Tracker</h2>
        <div class="filter-row">
          {#each filterOptions as f}
            <button class="chip" class:active={quoteFilter === f} onclick={() => (quoteFilter = f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          {/each}
        </div>
      </div>
      {#if trackerError}<p class="error">❌ {trackerError}</p>{/if}
      <p class="muted-note">
        Mark a quote Won/Lost to feed the win-rate. Showing {shownQuotes.length}
        {quoteFilter === 'all' ? '' : quoteFilter} quote{shownQuotes.length === 1 ? '' : 's'} (newest first, max 200).
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Store</th><th>Point of Contact</th><th>Work Type</th><th>Amount</th><th>Status</th></tr>
          </thead>
          <tbody>
            {#each shownQuotes as q (q._id)}
              <tr>
                <td>{q.date_sent ?? '—'}</td>
                <td>{q.store_number || '—'}</td>
                <td>{q.point_of_contact || '—'}</td>
                <td>{q.description || '—'}</td>
                <td>{money(q.amount)}</td>
                <td>
                  <select
                    class="status-select status-{q.status ?? 'open'}"
                    value={q.status ?? 'open'}
                    disabled={savingId === q._id}
                    onchange={(e) => setQuoteStatus(q._id, e.currentTarget.value)}
                  >
                    <option value="open">Open</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </td>
              </tr>
            {/each}
            {#if shownQuotes.length === 0}
              <tr><td colspan="6" class="muted-note">No {quoteFilter} quotes match the filters.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Raw table -->
      <hr style="margin: 24px 0 16px" />
      <h2 class="section-heading">📋 Raw Task Data</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th><th>Status</th><th>Assigned To</th>
              <th>Quote</th><th>Quote Type</th><th>Stores</th><th>Due Date</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {#each tasks as t}
              {@const stores = t.store_numbers ?? extractStoreNumbers(t.title)}
              <tr>
                <td class="title-cell">{t.title}</td>
                <td><span class="status-pill" style:background={STATUS_META[t.status]?.bg} style:color={STATUS_META[t.status]?.text}>{t.status}</span></td>
                <td>{t.assigned_to}</td>
                <td>{t.quote ?? '—'}</td>
                <td>{t.quote_type ?? '—'}</td>
                <td class="store-cell">
                  {#if stores.length}
                    {#each stores as s}<span class="store-mini">#{s}</span>{/each}
                  {:else}—{/if}
                </td>
                <td>{t.date ?? '—'}</td>
                <td>{t.created_at?.slice(0, 10) ?? '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <form action="/api/tasks/export" method="GET" style="margin-top: 12px">
        <button class="secondary" type="submit">📥 Download CSV</button>
      </form>
    {/if}
</PageShell>

<style>
  hr { border: none; border-top: 1px solid #f1f5f9; }
  .page-title { font-size: 22px; font-weight: 800; color: #1e293b; }
  .page-sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .section-heading { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 12px; }
  .empty { color: #94a3b8; font-size: 14px; }

  .filter-bar {
    display: flex; flex-wrap: wrap; gap: 16px 28px; align-items: flex-end;
    background: #fff; border: 1px solid #e8ecf1; border-radius: 10px;
    padding: 12px 16px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(15,23,42,0.05);
  }
  .filter-group { display: flex; flex-direction: column; gap: 3px; min-width: 220px; flex: 1; }
  .filter-label { font-size: 12px; color: #64748b; }
  .filter-label strong { color: #1e293b; font-weight: 700; }
  .filter-group input[type="range"] { width: 100%; accent-color: #4f46e5; margin: 0; height: 18px; }
  .filter-group select { width: 100%; font-size: 12px; padding: 5px 7px; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; color: #1e293b; }
  .filter-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #94a3b8; flex-wrap: wrap; }
  .risk-badge { color: #b91c1c; font-weight: 700; }
  .risk-text { color: #b91c1c; font-weight: 600; }

  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .metric {
    background: #fff; border: 1px solid #e8ecf1; border-top: 3px solid #6366f1;
    border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(15,23,42,0.05);
  }
  .metric-val { font-size: 20px; font-weight: 700; color: #1e293b; }
  .metric-lbl { font-size: 12px; color: #94a3b8; margin-top: 2px; }

  .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
  .chart-card {
    background: #fff; border: 1px solid #e8ecf1; border-radius: 12px; padding: 16px 16px 8px;
    box-shadow: 0 1px 4px rgba(15,23,42,0.05);
  }
  .chart-card.span-all { grid-column: 1 / -1; }
  .chart-card h3 { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 12px; }
  .chart-card h3 .muted { color: #94a3b8; font-weight: 400; }
  .canvas-wrap { position: relative; height: 260px; }
  .canvas-wrap.tall { height: 300px; }
  .chart-note { font-size: 11px; color: #64748b; margin: 6px 2px 2px; }

  .tracker-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
  .filter-row { display: flex; gap: 6px; }
  .chip { font-size: 12px; padding: 4px 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #475569; border-radius: 999px; cursor: pointer; }
  .chip.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
  .muted-note { font-size: 11px; color: #94a3b8; margin: 4px 2px 10px; }
  .error { color: #dc2626; font-size: 13px; margin: 6px 2px; }
  .status-select { font-size: 12px; padding: 3px 6px; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; }
  .status-select.status-won { color: #047857; border-color: #a7f3d0; background: #ecfdf5; }
  .status-select.status-lost { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
  .status-select:disabled { opacity: 0.5; cursor: wait; }
  .mark-won { font-size: 12px; padding: 3px 10px; border: 1px solid #a7f3d0; background: #ecfdf5; color: #047857; border-radius: 6px; cursor: pointer; }
  .mark-won:hover { background: #a7f3d0; }
  .mark-won:disabled { opacity: 0.5; cursor: wait; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f8fafc; color: #64748b; font-weight: 600; padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #374151; }
  tr:hover td { background: #fafafa; }
  .title-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-pill { border-radius: 20px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
  .store-cell { white-space: nowrap; }
  .store-mini {
    display: inline-block;
    background: #1e3a8a; color: #fff;
    border-radius: 4px; padding: 1px 6px; margin-right: 3px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.03em;
  }
</style>
