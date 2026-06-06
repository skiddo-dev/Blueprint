<script lang="ts">
  import { theme, cycleTheme } from '$lib/theme.svelte'
  import type { Theme } from '$lib/theme'

  const LABEL: Record<Theme, string> = {
    light: '☀️ Light',
    dark: '🌙 Dark',
    system: '🖥️ System',
  }
</script>

<button
  type="button"
  class="theme-toggle"
  onclick={cycleTheme}
  aria-label="Theme: {theme.pref}. Click to switch (light, dark, system)."
  title="Theme: {theme.pref} — click to switch"
>
  <span class="tt-label">{LABEL[theme.pref]}</span>
</button>

<style>
  .theme-toggle {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    color: var(--text-body);
    border-radius: 7px;
    padding: 7px 12px;
    font-size: 13px;
    font-weight: 600;
  }
  .theme-toggle:hover { background: var(--bg); border-color: var(--primary); color: var(--primary-text); }
</style>
