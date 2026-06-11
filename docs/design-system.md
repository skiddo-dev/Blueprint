# Blueprint Design System

The reference for how Blueprint's UI is built. Everything visual in the app is
expressed through the tokens and recipes below; if you're adding a page or a
component, you should not need to invent a color, size, radius, shadow,
z-index, or transition speed — only compose existing ones. The iOS app mirrors
the same values (`/api/config` serves the status palette; the SwiftUI color
set mirrors the chrome tokens).

**Living style guide:** `/design` (admin-only, in the nav drawer) renders this
entire language from the live tokens — palette, type ramp, radii, elevation,
buttons, chips/badges, z layers, motion, and the full icon set — in whichever
theme is active. If a token changes, that page shows it immediately.

**Sources of truth**

| What | Where |
|---|---|
| Chrome, brand + semantic color tokens, all scale tokens | `src/app.css` `:root` (+ dark block) |
| Status / quote / chart data colors | `src/lib/constants.ts` (served to iOS via `GET /api/config`) |
| Accounting + infra shared primitives (`.card`, tables, badges…) | `src/lib/styles/accounting.css` (scoped under `.acct`) |
| Icon set | `src/lib/icons.ts` + `Icon.svelte` |
| Chart theming | `src/lib/components/Chart.svelte` defaults |
| Theme switching | `src/lib/theme.ts` / `theme.svelte.ts`, boot script in `app.html` |

## Principles

1. **Tokens only.** Literal values live in `app.css` (and `constants.ts` for
   data colors); everywhere else references `var(--token)`. The audit greps at
   the bottom of this doc should come back clean.
2. **One treatment per intent.** One primary button, one input recipe, one
   card surface, one focus ring. A new variant needs a reason, then a token.
3. **Dark mode is free, not extra work.** Components never override colors for
   dark; only the token definitions branch on `[data-theme="dark"]`.
4. **Data colors are deliberate literals.** Vivid status dots, chart datasets,
   and quote-status colors stay literal in `constants.ts`/chart configs so
   they're identical across web, iOS, and exports — they read fine on both
   themes.

## Color tokens

Neutral chrome + brand (`--primary*`, `--text*`, `--bg`, `--card-bg`,
`--border*`, `--chip-bg`, `--store-chip*`) and semantic status families.
Status families come as: base = ink (text/icon on a tinted chip), `-bg` = soft
chip fill, `-border` = chip outline, `-subtle` = faint row tint,
`success-vivid` = progress fills.

| Intent | Tokens |
|---|---|
| Positive / done / paid | `--success`, `--success-bg`, `--success-border`, `--success-vivid` |
| Caution / aging / owed | `--warning`, `--warning-bg`, `--warning-border` |
| Error / overdue / destructive | `--danger`, `--danger-bg`, `--danger-bg-subtle`, `--danger-border` |
| Informational / open / in-flight | `--info`, `--info-bg` |
| Neutral / void / inactive | `--border-soft` fill + `--text-soft` ink |

Rule of thumb: a status chip is `color: var(--success); background:
var(--success-bg);` — never a hand-mixed hex pair.

**Link ink** — `--link` is the readable indigo for text: an alias of
`--primary-dark` in light and `--primary` in dark, because the fill anchor is
too dim to read on dark surfaces. Use it for links, link-buttons, and active
nav/toggle labels; keep `--primary-dark` for fills and gradients.

**Contrast is enforced, not hoped for** — `src/lib/contrast.test.ts` parses
the real token values out of `app.css` (both themes) and asserts WCAG ratios
on every designed ink-on-fill pair: 4.5:1 AA for the text ramp, brand inks,
link surfaces, and status chips; 3:1 for `--text-faint` (restricted to
placeholders, timestamps, and glyphs — never essential copy) and for white on
the primary-button gradient. A palette edit that breaks readability now fails
CI with the offending pair and its computed ratio.

## Radius scale

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | micro controls inside controls (select boxes, focus outline) |
| `--radius-md` | 8px | buttons, inputs, square-ish chips, nav pills |
| `--radius-lg` | 12px | cards, panels, popovers, maps |
| `--radius-xl` | 16px | modals, sheets (top corners on mobile), hero/login cards |
| `--radius-pill` | 999px | fully-round chips, filter pills, status pills |

Deliberate non-scale values: `50%` (circles/avatars), `3px` (scrollbar thumb,
5px-high progress bars), `0`.

## Type scale

Size-named tokens; the role is the contract.

| Token | Value | Role |
|---|---|---|
| `--font-2xs` | 10px | micro badges, uppercase file-type tags |
| `--font-xs` | 11px | chips, card meta, table fine print |
| `--font-sm` | 12px | secondary text, field labels, uppercase table heads |
| `--font-base` | 13px | body, controls, tables, nav pills |
| `--font-md` | 14px | emphasized body; the root (`html, body`) default |
| `--font-lg` | 16px | card titles, section headings, statement totals |
| `--font-xl` | 18px | sub-titles, empty-state headings, drawer glyphs |
| `--font-2xl` | 22px | page titles (the `h1` convention), KPI values |
| `--font-3xl` | 28px | display numerals (infra spend hero, tax stats) |

**The one allowed literal:** `font-size: 16px` inside `@media (max-width:
768px)` on inputs — the iOS Safari no-zoom-on-focus floor. That's a platform
threshold, not a design choice; it must not follow the scale if the scale ever
changes.

## Z layers

Every positioned layer in the app, lowest to highest. Backdrops sit at
`calc(layer - 1)`. Local stacking inside one component (0/2/5) stays literal.

| Token | Value | Layer |
|---|---|---|
| `--z-topbar` | 20 | sticky toolbars / mobile top bar |
| `--z-popover` | 30 | dropdown panels (board filter bar) |
| `--z-drawer` | 40 | nav drawer |
| `--z-bar` | 50 | floating bulk-action bar |
| `--z-sheet` | 60 | card detail sheet, search palette, page modals |
| `--z-modal` | 70 | top-level dialogs (new task) |
| `--z-toast` | 80 | toast stack + nav progress bar — above everything |

## Elevation & focus

| Token | Use |
|---|---|
| `--shadow` | resting card |
| `--shadow-hover` | lifted/hovered card |
| `--shadow-pop` | popovers, dropdowns, autocomplete |
| `--shadow-modal` | centered modals / bottom sheets |
| `--shadow-drawer` | left nav drawer (directional) |
| `--shadow-sheet` | right-side detail sheet (directional) |
| `--focus-halo` | focused input (soft 3px halo) |
| `--focus-ring` | selected element (solid 2px ring — selected card, active chip) |
| `--glow-primary` / `--glow-primary-hover` | primary button elevation (indigo reads on both themes; no dark override) |

All shadows and both focus treatments strengthen/recolor automatically in dark
via the `[data-theme="dark"]` block.

## Motion

| Token | Value | Use |
|---|---|---|
| `--speed-fast` | 0.12s | color/opacity ticks, small hovers |
| `--speed` | 0.15s | default control + card transitions |
| `--speed-slow` | 0.4s | progress fills, larger movements |

Easing defaults to `ease`. The global `prefers-reduced-motion` rule
neutralizes everything. Deliberate non-scale timings: the search/remote flash,
toast-in, skeleton-shimmer, and nav-sweep keyframes (attention cues, not
interaction feedback).

Page navigations crossfade at `--speed` through the View Transitions API —
wired once in the root layout's `onNavigate`, which also skips it under
reduced motion and on browsers without the API (they hard-cut as before). A
navigation slower than 150ms shows the indeterminate top progress bar
(`.nav-progress`, root layout); fast hops never flash it.

## Spacing

Spacing is **not** tokenized — it doesn't theme, and `gap: 8px` reads better
than a variable. The rule is the **2px grid**: every `gap`/`padding`/`margin`
value is even (1px is allowed only for hairline alignment). Layout rhythm
conventions: 4–8px inside controls and chip rows, 10–12px between related
elements, 16–18px card padding and section gaps, 24px+ between page regions.

## Component language

- **Buttons** — `button.primary` / `.btn-primary` (anchors) is *the* primary
  action: indigo gradient + `--glow-primary`. `button.secondary` /
  `.btn-secondary` is the bordered card-surface button. `button.ghost` for
  low-emphasis inline actions. One primary action per view region.
- **Inputs** — styled globally in `app.css`; focus = `--primary` border +
  `--focus-halo`. Don't restyle per page (accounting tweaks live once in
  `accounting.css`).
- **Cards** — `--card-bg` surface, `--border-card` hairline, `--radius-lg`,
  `--shadow`; hover lift uses `--shadow-hover`.
- **Chips / badges** — pills (`--radius-pill`) at `--font-xs`/`--font-sm`,
  weight 500–600, tinted with a status or chip token pair. Board card chips
  keep their emoji glyphs by design.
- **Modals & sheets** — backdrop `var(--backdrop)` at `calc(z - 1)`; panel at
  the layer token with `--shadow-modal` (or the directional `--shadow-sheet`
  / `--shadow-drawer`); `--radius-xl` (top corners only for bottom sheets).
  Every dialog carries `role="dialog" aria-modal="true"` **and**
  `use:trapFocus` (`$lib/actions/trapFocus`): Tab cycles inside, Escape
  closes, and focus returns to whatever opened it.
- **Toasts** — `$lib/toast` is the one event-feedback channel, rendered by
  `Toasts.svelte` in the root layout (bottom-center, `--z-toast`). Inline
  `role="alert"` text next to the field stays the pattern for form
  validation; persistent conditions (offline) stay banners. Destructive
  actions use the **staged-undo** pattern: rows leave the screen at once and
  the server write runs only when the toast expires — Undo means it never
  happened (see the board's `stageRemoval`).
- **Skeletons** — `Skeleton.svelte`, for client-side fetches only; shape the
  bars to the content they replace. Server-loaded pages block navigation
  instead — the nav progress bar covers those, never a skeleton.
- **Empty states** — `EmptyState.svelte`: hand-drawn icon + headline + one
  line of help + the first action. Page-level voids get the full treatment;
  accounting's in-card table placeholders stay compact `.empty` one-liners
  by design. `size="sm"` inside palettes/cards, `framed={false}` when the
  host already draws the card.
- **⌘K palette** — `SearchPalette.svelte` is search *and* the command bar:
  an empty query lists every command (navigation, theme, new task, guide,
  shortcuts), typing filters them alongside search hits. Commands are
  role-aware; "New task" deep-links the board with `?new=1` so it works from
  any page.
- **Shortcuts overlay** — `ShortcutsHelp.svelte`, opened by `?` outside text
  fields (and from the palette). `<kbd>` chips at `--font-xs` on `--bg` with
  a 2px bottom border — reuse that recipe for any keyboard hint.
- **Page titles** — `h1` at `--font-2xl`, weight 700–800; 22px is the
  page-title convention everywhere (PageShell, `.acct-head`, login).
- **Tables** — see `.acct table`: `--font-base` cells, `--font-sm` uppercase
  heads, `--border-soft` row hairlines, `tabular-nums` for figures (`.num`).

## Iconography

Hand-drawn SVG set in `src/lib/icons.ts`, rendered by `Icon.svelte`: 24×24
viewBox, 1.75 stroke, `currentColor` (inherits text color, themes for free).
Card-level chips and celebratory empty states intentionally stay emoji.

## Charts

Chart.js through the local `Chart.svelte` wrapper only — it themes
axes/legends/tooltips from the tokens (`chartInk`); pages must not override
legend/tick colors. Dataset colors stay literal by design (see Principles #4).

## Theming, motion, a11y

- Light/Dark/System; the boot script in `app.html` sets `data-theme` to the
  *resolved* value pre-paint (no flash), key `blueprint:theme`.
- `prefers-reduced-motion` neutralizes all animations/transitions and hover
  lifts globally.
- Keyboard focus: global `:focus-visible` outline in `--primary`; mouse/touch
  focus stays clean.
- Mobile (≤768px): 44px tap targets, 16px input floor, `.mobile-topbar` shell
  convention, safe-area insets.
- Tablet band (769–1100px): desktop layout, but `--sidebar-width` narrows to
  200px so content keeps a workable share of the width.
- Dialog focus is trapped (`use:trapFocus`), and contrast is regression-tested
  (see Color tokens).

## Auditing drift

Run these before a UI PR lands; each should return nothing (or only the
documented exceptions above). Contrast has its own gate — `npx vitest run
src/lib/contrast.test.ts` — which runs with the normal suite in CI:

```sh
# fonts: only the iOS 16px input floor may remain
grep -rn 'font-size: [0-9.]*px' src --include='*.svelte' --include='*.css'
# radii: only 3px micro bars
grep -rn 'border-radius: [0-9.]*px' src --include='*.svelte' --include='*.css'
# shadows: only the search-flash keyframe + topbar hairline + switch knob
grep -rn 'box-shadow:' src --include='*.svelte' --include='*.css' | grep -v 'var(--' | grep -v none
# z-index: only local stacking (0/2/5)
grep -rn 'z-index' src --include='*.svelte' --include='*.css' | grep -v 'var(--z\|calc(var'
# transitions: durations come from the speed tokens (flash keyframes exempt)
grep -rn 'transition:' src --include='*.svelte' --include='*.css' | grep -E '0\.[0-9]+s' | grep -v 'var(--speed'
# spacing: the 2px grid — no odd gap values
grep -rn 'gap: [0-9]*[13579]px' src --include='*.svelte' --include='*.css' | grep -v 'gap: 1px'
# color fills/borders: no raw hex chrome in components. Allowed leftovers:
#   chart/data-viz literals (Principle #4), the quotes paper-white PDF preview,
#   the competitive-landscape blueprint field. `color: #fff` on solid indigo/
#   navy fills and the aging chips' calm inks are sanctioned theme-invariants.
grep -rn 'background: #\|background-color: #\|solid #' src --include='*.svelte' | grep -vi chart
```
