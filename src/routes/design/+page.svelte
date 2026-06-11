<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte'
  import Icon from '$lib/components/Icon.svelte'
  import StatusBadge from '$lib/components/accounting/StatusBadge.svelte'
  import { ICONS, type IconName } from '$lib/icons'
  import type { PageData } from './$types'
  import type { AppSession } from '$lib/types'
  // Reuses the shared `.acct` primitives (cards, tables, badges, pills) — this
  // page demonstrates the system, so it must not carry private copies of it.
  import '$lib/styles/accounting.css'

  let { data }: { data: PageData } = $props()
  // Session comes from the root layout load; this route is admin-only.
  const session = $derived(data.session as unknown as AppSession)
  const user = $derived({ name: session?.user?.displayName ?? 'Admin', role: session?.user?.role ?? 'admin' })

  // Everything below names tokens from app.css :root and renders THROUGH them,
  // so the page is wrong the moment the system drifts — that's the point.
  // Full rules + audit greps: docs/design-system.md.
  const textRamp: [string, string][] = [
    ['--text', 'headings / primary text'],
    ['--text-body', 'body text inside controls'],
    ['--text-muted', 'secondary text'],
    ['--text-soft', 'slate labels'],
    ['--text-faint', 'tertiary / placeholders'],
  ]
  const brand: [string, string][] = [
    ['--primary', 'brand / actions'],
    ['--primary-dark', 'gradient anchor'],
    ['--primary-bg', 'soft brand fill'],
    ['--primary-text', 'brand ink on light fills'],
  ]
  const surfaces: [string, string][] = [
    ['--bg', 'app background'],
    ['--card-bg', 'cards / inputs / popovers'],
    ['--border', 'control + card border'],
    ['--border-soft', 'hairline dividers'],
    ['--border-card', 'board / analytics cards'],
    ['--chip-bg', 'indigo chips / mentions'],
  ]
  const statusFamilies: [string, string][] = [
    ['success', 'positive · done · paid'],
    ['warning', 'caution · aging · owed'],
    ['danger', 'error · overdue · destructive'],
    ['info', 'informational · open · in-flight'],
  ]
  const typeScale: [string, string, string][] = [
    ['--font-2xs', '10px', 'micro badges, uppercase file tags'],
    ['--font-xs', '11px', 'chips, card meta'],
    ['--font-sm', '12px', 'secondary text, field labels, table heads'],
    ['--font-base', '13px', 'body, controls, tables'],
    ['--font-md', '14px', 'emphasized body · root default'],
    ['--font-lg', '16px', 'card titles, section headings'],
    ['--font-xl', '18px', 'sub-titles, empty-state headings'],
    ['--font-2xl', '22px', 'page titles'],
    ['--font-3xl', '28px', 'display numerals'],
  ]
  const radii: [string, string, string][] = [
    ['--radius-sm', '4px', 'micro controls'],
    ['--radius-md', '8px', 'buttons · inputs · chips'],
    ['--radius-lg', '12px', 'cards · popovers'],
    ['--radius-xl', '16px', 'modals · sheets'],
    ['--radius-pill', '999px', 'pills'],
  ]
  const shadows: [string, string][] = [
    ['--shadow', 'resting card'],
    ['--shadow-hover', 'lifted card'],
    ['--shadow-pop', 'popovers / dropdowns'],
    ['--shadow-modal', 'modals / sheets'],
    ['--shadow-drawer', 'nav drawer (directional)'],
    ['--shadow-sheet', 'detail sheet (directional)'],
  ]
  const zLayers: [string, string, string][] = [
    ['--z-topbar', '20', 'sticky toolbars / mobile top bar'],
    ['--z-popover', '30', 'dropdown panels (board filters)'],
    ['--z-drawer', '40', 'nav drawer'],
    ['--z-bar', '50', 'floating bulk-action bar'],
    ['--z-sheet', '60', 'detail sheet · search palette · page modals'],
    ['--z-modal', '70', 'top-level dialogs (new task)'],
  ]
  const speeds: [string, string, string][] = [
    ['--speed-fast', '0.12s', 'color / opacity ticks'],
    ['--speed', '0.15s', 'default control transitions'],
    ['--speed-slow', '0.4s', 'progress fills, larger movements'],
  ]
  const iconNames = Object.keys(ICONS) as IconName[]
</script>

<PageShell {user} title="Design System" maxWidth="1080px">
  {#snippet head()}
    <h1 class="page-title">Design System</h1>
    <p class="page-sub">
      The living style guide — every sample renders from the live tokens, so flipping the
      theme re-themes this page too. Rules &amp; audit greps: docs/design-system.md
    </p>
    <hr style="margin: 12px 0 20px" />
  {/snippet}

  <div class="acct">
    <!-- ── Color ─────────────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-head"><h2><Icon name="palette" size={16} /> Color</h2><span class="muted src">app.css :root · dark values under [data-theme="dark"]</span></div>

      <p class="section-title">Brand</p>
      <div class="swatches">
        {#each brand as [token, role]}
          <div class="swatch">
            <span class="well" style="background: var({token})"></span>
            <code>{token}</code><span class="role">{role}</span>
          </div>
        {/each}
      </div>

      <p class="section-title">Text ramp</p>
      <div class="swatches">
        {#each textRamp as [token, role]}
          <div class="swatch">
            <span class="well ag" style="color: var({token})">Ag</span>
            <code>{token}</code><span class="role">{role}</span>
          </div>
        {/each}
      </div>

      <p class="section-title">Surfaces &amp; borders</p>
      <div class="swatches">
        {#each surfaces as [token, role]}
          <div class="swatch">
            <span class="well outlined" style="background: var({token})"></span>
            <code>{token}</code><span class="role">{role}</span>
          </div>
        {/each}
      </div>

      <p class="section-title">Semantic status families</p>
      <div class="fam-grid">
        {#each statusFamilies as [fam, role]}
          <div class="fam">
            <span class="fam-chip" style="background: var(--{fam}-bg); color: var(--{fam}); border: 1px solid var(--{fam}-border, var(--{fam}-bg))">{fam}</span>
            <span class="role">{role}</span>
            <code>--{fam} · --{fam}-bg{fam === 'info' ? '' : ' · --' + fam + '-border'}</code>
          </div>
        {/each}
      </div>
      <p class="foot">
        Plus <code>--success-vivid</code> (progress fills), <code>--danger-bg-subtle</code> (overdue row tint),
        and the theme-fixed <code>--store-chip</code> navy. Vivid chart/data colors stay literal in
        <code>constants.ts</code> by design.
      </p>
    </section>

    <!-- ── Type ──────────────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-head"><h2>Type scale</h2><span class="muted src">size-named · 16px also exists as the iOS no-zoom input floor (literal, mobile only)</span></div>
      <div class="ramp">
        {#each typeScale as [token, px, role]}
          <div class="ramp-row">
            <code>{token} · {px}</code>
            <span class="sample" style="font-size: var({token})">Raves quote #451006 — Sterling Heights</span>
            <span class="role">{role}</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- ── Radius & elevation ───────────────────────────────────────── -->
    <section class="card">
      <div class="card-head"><h2>Radius &amp; elevation</h2></div>
      <div class="radius-row">
        {#each radii as [token, px, role]}
          <div class="radius-demo">
            <span class="radius-box" class:pill={token === '--radius-pill'} style="border-radius: var({token})"></span>
            <code>{token}</code><span class="role">{px} · {role}</span>
          </div>
        {/each}
      </div>
      <div class="shadow-row">
        {#each shadows as [token, role]}
          <div class="shadow-demo">
            <span class="shadow-box" style="box-shadow: var({token})"></span>
            <code>{token}</code><span class="role">{role}</span>
          </div>
        {/each}
      </div>
      <div class="focus-row">
        <label class="focus-demo">
          <code>--focus-halo</code> — focused input
          <input type="text" placeholder="…" readonly class="halo" />
        </label>
        <div class="focus-demo">
          <code>--focus-ring</code> — selected element
          <span class="chip ring">selected chip</span>
        </div>
      </div>
    </section>

    <!-- ── Buttons & controls ───────────────────────────────────────── -->
    <section class="card">
      <div class="card-head"><h2>Buttons &amp; controls</h2><span class="muted src">one recipe app-wide — button.primary / .btn-primary on anchors</span></div>
      <div class="btn-row">
        <button class="primary" type="button"><Icon name="pencil" size={14} /> Primary</button>
        <button class="secondary" type="button">Secondary</button>
        <button class="ghost" type="button">Ghost</button>
        <button class="primary" type="button" disabled>Disabled</button>
        <button class="secondary" type="button" disabled>Disabled</button>
      </div>
      <div class="ctl-grid">
        <label>Text<input type="text" placeholder="What needs to get done?" /></label>
        <label>Select<select><option>All estimators</option><option>Ben</option></select></label>
        <label>Date<input type="date" /></label>
        <label>Notes<textarea rows="2" placeholder="Any additional context…"></textarea></label>
      </div>
    </section>

    <!-- ── Chips & badges ───────────────────────────────────────────── -->
    <section class="card">
      <div class="card-head"><h2>Chips &amp; badges</h2></div>
      <div class="chip-row">
        <span class="chip">indigo chip</span>
        <span class="tag">tag</span>
        <span class="badge ok">ok</span>
        <span class="badge bad">bad</span>
        <span class="store-demo">#380</span>
        {#each ['open', 'partial', 'paid', 'overdue', 'void'] as s}
          <StatusBadge status={s} />
        {/each}
      </div>
      <div class="filter-pills demo-pills">
        <button class="active" type="button">Active <span class="count">12</span></button>
        <button type="button">Draft <span class="count">3</span></button>
        <button type="button">Won <span class="count">9</span></button>
      </div>
      <p class="foot">
        Status pills are ink-on-soft-fill pairs from one family — never hand-mixed hex. The board's
        calm aging-chip inks are the documented exception (quieter than the danger/warning tokens).
      </p>
    </section>

    <!-- ── Layers & motion ──────────────────────────────────────────── -->
    <section class="card">
      <div class="card-head"><h2>Z layers &amp; motion</h2><span class="muted src">backdrops sit at calc(layer − 1)</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Token</th><th class="num">Value</th><th>Layer</th></tr></thead>
          <tbody>
            {#each zLayers as [token, value, layer]}
              <tr><td><code>{token}</code></td><td class="num">{value}</td><td>{layer}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="section-title">Motion</p>
      <div class="speed-row">
        {#each speeds as [token, value, role]}
          <div class="speed-demo">
            <span class="speed-box" style="transition: transform var({token}) ease, background var({token}) ease" title="hover me"></span>
            <code>{token}</code><span class="role">{value} · {role}</span>
          </div>
        {/each}
      </div>
      <p class="foot">All of it collapses under <code>prefers-reduced-motion</code> — the flash keyframes too.</p>
    </section>

    <!-- ── Iconography ──────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-head"><h2>Iconography</h2><span class="muted src">$lib/icons.ts · 24×24 · 1.75 stroke · currentColor</span></div>
      <div class="icon-grid">
        {#each iconNames as name}
          <div class="icon-cell"><Icon {name} size={20} /><span>{name}</span></div>
        {/each}
      </div>
      <p class="foot">
        Hand-drawn, stroke-only, semantically named (a native client maps the same names to SF
        Symbols). Card-level chips and celebratory empty states stay emoji by design.
      </p>
    </section>
  </div>
</PageShell>

<style>
  .page-title { font-size: var(--font-2xl); font-weight: 800; color: var(--text); }
  .page-sub { font-size: var(--font-sm); color: var(--text-faint); margin-top: 2px; }

  .card-head h2 { display: inline-flex; align-items: center; gap: 8px; }
  .src { font-size: var(--font-sm); font-weight: 400; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--font-xs);
    color: var(--text-soft);
  }
  .role { font-size: var(--font-xs); color: var(--text-muted); }
  .foot { font-size: var(--font-sm); color: var(--text-muted); margin-top: 12px; max-width: 75ch; }

  /* Swatches */
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-bottom: 6px; }
  .swatch { display: grid; grid-template-columns: 44px 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; }
  .well {
    grid-row: 1 / 3; width: 44px; height: 44px; border-radius: var(--radius-md);
    border: 1px solid var(--border-soft);
  }
  .well.outlined { border-color: var(--border); }
  .well.ag {
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--card-bg); border-color: var(--border);
    font-size: var(--font-xl); font-weight: 700;
  }
  .fam-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .fam { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .fam-chip {
    font-size: var(--font-sm); font-weight: 600; border-radius: var(--radius-pill);
    padding: 3px 12px; text-transform: capitalize;
  }

  /* Type ramp */
  .ramp { display: flex; flex-direction: column; gap: 2px; }
  .ramp-row {
    display: grid; grid-template-columns: 150px 1fr 200px; gap: 14px; align-items: baseline;
    padding: 7px 0; border-bottom: 1px solid var(--border-soft);
  }
  .ramp-row:last-child { border-bottom: none; }
  .sample { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (max-width: 768px) { .ramp-row { grid-template-columns: 1fr; gap: 2px; } }

  /* Radius / elevation / focus */
  .radius-row, .shadow-row, .speed-row { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 16px; }
  .radius-demo, .shadow-demo, .speed-demo { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .radius-box {
    width: 56px; height: 56px; display: block;
    background: var(--primary-bg); border: 1.5px solid var(--primary);
  }
  .radius-box.pill { width: 72px; height: 32px; }
  .shadow-box {
    width: 88px; height: 56px; display: block;
    background: var(--card-bg); border: 1px solid var(--border-card); border-radius: var(--radius-lg);
  }
  .focus-row { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end; }
  .focus-demo { display: flex; flex-direction: column; gap: 6px; font-size: var(--font-sm); color: var(--text-body); }
  .focus-demo input.halo { width: 200px; border-color: var(--primary); box-shadow: var(--focus-halo); }
  .chip.ring { box-shadow: var(--focus-ring); }

  /* Buttons & controls */
  .btn-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
  .ctl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; max-width: 880px; }
  .ctl-grid label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-sm); font-weight: 600; color: var(--text-body); }

  /* Chips & badges */
  .chip-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  .chip-row .tag { margin-left: 0; }
  .store-demo {
    background: var(--store-chip); color: #fff; border-radius: var(--radius-pill);
    padding: 2px 10px; font-size: var(--font-xs); font-weight: 700;
  }
  .demo-pills { margin-bottom: 0; }

  /* Motion */
  .speed-box {
    width: 56px; height: 32px; display: block; cursor: default;
    background: var(--primary-bg); border: 1px solid var(--primary); border-radius: var(--radius-md);
  }
  .speed-box:hover { transform: translateY(-6px); background: var(--chip-bg); }

  /* Icons */
  .icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 8px; }
  .icon-cell {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 10px 4px 8px; border: 1px solid var(--border-soft); border-radius: var(--radius-md);
    color: var(--text-soft);
  }
  .icon-cell span { font-size: var(--font-2xs); color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
