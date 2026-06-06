<script lang="ts">
  // Minimal Chart.js wrapper for Svelte 5. Instantiates on the client in
  // onMount (SSR-safe — the canvas renders on the server, the chart hydrates),
  // and updates in place when `data`/`options` change. Unlike svelte-chartjs it
  // does NOT run $state.snapshot on the config, so function options (tick /
  // tooltip formatters) don't trigger `state_snapshot_uncloneable` warnings.
  import { onMount } from 'svelte'
  import {
    Chart as ChartJS,
    registerables,
    type ChartType,
    type ChartData,
    type ChartOptions,
    type ChartConfiguration,
  } from 'chart.js'
  import { theme } from '$lib/theme.svelte'
  import { chartInk } from '$lib/theme'

  // Register controllers, scales, elements and default plugins once.
  ChartJS.register(...registerables)

  let { type, data, options = {} }: {
    type: ChartType
    data: ChartData
    options?: ChartOptions
  } = $props()

  let canvas: HTMLCanvasElement
  let instance: ChartJS | undefined

  onMount(() => {
    instance = new ChartJS(canvas, { type, data, options } as ChartConfiguration)
    return () => instance?.destroy()
  })

  // Keep the chart in sync if the inputs OR the theme change. Charts draw to a
  // canvas and can't read CSS vars, so axis text + gridlines come from Chart.js
  // global defaults, set here from the resolved theme; reading theme.resolved
  // makes this effect re-run (and re-resolve colors) on a light/dark toggle.
  $effect(() => {
    const ink = chartInk(theme.resolved)
    ChartJS.defaults.color = ink.tick
    ChartJS.defaults.borderColor = ink.grid
    if (!instance) return
    instance.data = data
    instance.options = options
    instance.update()
  })
</script>

<canvas bind:this={canvas}></canvas>
