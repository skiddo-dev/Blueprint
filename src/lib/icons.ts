// Blueprint's custom icon set — hand-drawn SVG glyphs, no icon-font or
// third-party pack. Rendered by $lib/components/Icon.svelte.
//
// Drawing rules (keep new glyphs consistent):
//   • 24×24 grid, ~3.5px safe margin (small overshoot OK for round caps)
//   • stroke-only geometry: the <svg> wrapper applies stroke=currentColor,
//     width 1.75, round caps/joins, fill none — entries are bare shapes with
//     NO fill/stroke/style attributes of their own
//   • corner radii ≈ 1.5–2 on rectangles, soft round joins everywhere
//   • semantic names (board, ledger, …) so a native client can map each name
//     to an SF Symbol instead of parsing the web glyph
//
// Only static markup defined in this file may ever go through these strings —
// Icon.svelte injects them with {@html}.
const ICONS = {
  /* ── Brand ──────────────────────────────────────────────────────── */
  // Drafting set-square: the Blueprint logomark.
  logo: '<path d="M4.5 19.5v-15l15 15Z"/><path d="M8.75 15.25v-4.4l4.4 4.4Z"/>',

  /* ── Main navigation ────────────────────────────────────────────── */
  board: '<rect x="3.5" y="3.5" width="4.6" height="17" rx="1.6"/><rect x="9.7" y="3.5" width="4.6" height="10" rx="1.6"/><rect x="15.9" y="3.5" width="4.6" height="13.5" rx="1.6"/>',
  dashboard: '<path d="M4 17a8 8 0 0 1 16 0"/><path d="M4 17h16"/><path d="m12 17 2.7-5"/><path d="M12 8.95v1.8"/><path d="m6.65 11.65 1.27 1.27"/><path d="m17.35 11.65-1.27 1.27"/>',
  quote: '<path d="M13.1 3.5H19A1.5 1.5 0 0 1 20.5 5v5.9a1.5 1.5 0 0 1-.44 1.06l-8.1 8.1a1.5 1.5 0 0 1-2.12 0l-5.9-5.9a1.5 1.5 0 0 1 0-2.12l8.1-8.1a1.5 1.5 0 0 1 1.06-.44Z"/><circle cx="16.25" cy="7.75" r="1.1"/>',
  ledger: '<rect x="4.75" y="3.5" width="14.5" height="17" rx="1.75"/><path d="M8.5 3.5v17"/><path d="M11.9 9h4.4"/><path d="M11.9 12.5h2.6"/>',
  // Coin stack ∕ database cylinder — infra spend is both.
  spend: '<ellipse cx="12" cy="5.75" rx="7.5" ry="2.75"/><path d="M4.5 5.75v12.5c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75V5.75"/><path d="M4.5 9.9c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75"/><path d="M4.5 14.05c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75"/>',
  // Storefront with a scalloped awning (Raves installs in retail stores).
  prospects: '<path d="M3.75 9.25 5.1 4.5h13.8l1.35 4.75a2.75 2.75 0 0 1-5.5 0 2.75 2.75 0 0 1-5.5 0 2.75 2.75 0 0 1-5.5 0Z"/><path d="M5.5 11.9v8.6h13v-8.6"/><path d="M10 20.5v-4.25h4v4.25"/>',
  map: '<path d="M3.5 6.4 9.17 4.5l5.66 1.9 5.67-1.9v13.1l-5.67 1.9-5.66-1.9-5.67 1.9Z"/><path d="M9.17 4.5v13.1"/><path d="M14.83 6.4v13.1"/>',
  search: '<circle cx="11" cy="11" r="5.75"/><path d="m15.45 15.45 4.05 4.05"/>',
  guide: '<path d="M12 6.6C10.9 5.05 8.95 4.25 6.4 4.25c-1.05 0-2.02.14-2.9.43V18.3c.88-.29 1.85-.43 2.9-.43 2.55 0 4.5.8 5.6 2.35 1.1-1.55 3.05-2.35 5.6-2.35 1.05 0 2.02.14 2.9.43V4.68c-.88-.29-1.85-.43-2.9-.43-2.55 0-4.5.8-5.6 2.35Z"/><path d="M12 6.6v13.6"/>',

  /* ── Accounting sections ────────────────────────────────────────── */
  invoice: '<path d="M13.6 3.5H7.25A1.75 1.75 0 0 0 5.5 5.25v13.5a1.75 1.75 0 0 0 1.75 1.75h9.5a1.75 1.75 0 0 0 1.75-1.75V8.4Z"/><path d="M13.6 3.5v4.9h4.9"/><path d="M9 13h6"/><path d="M9 16.25h3.5"/>',
  users: '<circle cx="9.25" cy="8" r="3.4"/><path d="M3.5 20c0-3.18 2.57-5.75 5.75-5.75S15 16.82 15 20"/><path d="M15.7 4.9a3.4 3.4 0 0 1 0 6.2"/><path d="M17.2 14.6c2 .85 3.3 2.9 3.3 5.4"/>',
  'trend-up': '<path d="m3.5 17.5 5.75-5.75 3.25 3.25L20.5 7"/><path d="M15.4 7h5.1v5.1"/>',
  'trend-down': '<path d="m3.5 6.5 5.75 5.75 3.25-3.25L20.5 17"/><path d="M20.5 11.9V17h-5.1"/>',
  bill: '<path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5Z"/><path d="M9.25 8.25h5.5"/><path d="M9.25 11.75h3"/>',
  // Hard hat: dome split by the centre ridge channel, over a wide brim.
  vendors: '<path d="M3.5 16.25h17"/><path d="M4.9 16.25a7.1 7.1 0 0 1 4.85-6.73"/><path d="M19.1 16.25a7.1 7.1 0 0 0-4.85-6.73"/><path d="M9.75 9.52V6.4A1.4 1.4 0 0 1 11.15 5h1.7a1.4 1.4 0 0 1 1.4 1.4v3.12"/>',
  reports: '<path d="M4.5 3.5v15.25a1.75 1.75 0 0 0 1.75 1.75H20.5"/><path d="M9 16.5v-4.25"/><path d="M13 16.5V7.75"/><path d="M17 16.5V10"/>',
  tax: '<path d="m12 3.25 8.75 4.5H3.25Z"/><path d="M5.4 11v6"/><path d="M9.8 11v6"/><path d="M14.2 11v6"/><path d="M18.6 11v6"/><path d="M4 20.5h16"/>',
  audit: '<path d="M12 3.25c2.25 1.33 4.58 2.1 7 2.4v5.4c0 4.3-2.8 7.85-7 9.7-4.2-1.85-7-5.4-7-9.7v-5.4c2.42-.3 4.75-1.07 7-2.4Z"/><path d="m8.9 11.9 2.2 2.2 4-4.3"/>',
  // Clipboard: purchase orders.
  po: '<rect x="5" y="4.5" width="14" height="16" rx="1.75"/><path d="M9.25 3.5h5.5a1 1 0 0 1 1 1v1.25h-7.5V4.5a1 1 0 0 1 1-1Z"/><path d="M9 11h6"/><path d="M9 14.5h4"/>',
  budget: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.9"/><circle cx="12" cy="12" r="1.3"/>',
  // Vault with a dial: bank deposits.
  deposit: '<rect x="3.75" y="4.25" width="16.5" height="14.5" rx="2"/><circle cx="12" cy="11.5" r="3.1"/><path d="M12 6.5v1.9"/><path d="M12 14.6v1.9"/><path d="M7 11.5h1.9"/><path d="M15.1 11.5h1.9"/>',
  // Delivery truck: vehicles & equipment (fixed assets).
  asset: '<path d="M14 17.4V6.9a1.6 1.6 0 0 0-1.6-1.6H4.85a1.6 1.6 0 0 0-1.6 1.6v9.6a.9.9 0 0 0 .9.9h1.2"/><path d="M14.9 17.4H9.35"/><path d="M18.7 17.4h1.45a.9.9 0 0 0 .9-.9v-3.3a.9.9 0 0 0-.2-.56l-3.1-3.88a.9.9 0 0 0-.7-.34H14"/><circle cx="7.25" cy="17.4" r="1.9"/><circle cx="16.8" cy="17.4" r="1.9"/>',
  // Two opposing arrows: statements matched against the books.
  reconcile: '<path d="M20 8.25H4"/><path d="m6.9 5.35-2.9 2.9 2.9 2.9"/><path d="M4 15.75h16"/><path d="m17.1 12.85 2.9 2.9-2.9 2.9"/>',
  recurring: '<path d="M20 7.25H8.25A4.25 4.25 0 0 0 4 11.5v.5"/><path d="m17.25 4.5 2.75 2.75-2.75 2.75"/><path d="M4 16.75h11.75A4.25 4.25 0 0 0 20 12.5v-.5"/><path d="m6.75 19.5-2.75-2.75 2.75-2.75"/>',

  /* ── Board toolbar ──────────────────────────────────────────────── */
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/>',
  list: '<path d="M4.4 6.75h.01"/><path d="M8.75 6.75H20"/><path d="M4.4 12h.01"/><path d="M8.75 12H20"/><path d="M4.4 17.25h.01"/><path d="M8.75 17.25H20"/>',
  sliders: '<path d="M4 7.25h9.5"/><circle cx="15.4" cy="7.25" r="1.85"/><path d="M17.3 7.25H20"/><path d="M4 12h2.85"/><circle cx="8.65" cy="12" r="1.85"/><path d="M10.55 12H20"/><path d="M4 16.75h7.6"/><circle cx="13.5" cy="16.75" r="1.85"/><path d="M15.4 16.75H20"/>',
  refresh: '<path d="M4.5 12a7.5 7.5 0 0 1 7.5-7.5 8.1 8.1 0 0 1 5.6 2.3l2.65 2.45"/><path d="M20.25 4.5v4.75H15.5"/><path d="M19.5 12a7.5 7.5 0 0 1-7.5 7.5 8.1 8.1 0 0 1-5.6-2.3l-2.65-2.45"/><path d="M3.75 19.5v-4.75H8.5"/>',
  pencil: '<path d="m4 20 .9-3.6L16.55 4.75a1.65 1.65 0 0 1 2.33 0l.37.37a1.65 1.65 0 0 1 0 2.33L7.6 19.1 4 20Z"/><path d="m14.8 6.5 2.7 2.7"/>',

  /* ── Theme toggle ───────────────────────────────────────────────── */
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v2"/><path d="M12 18.5v2"/><path d="M3.5 12h2"/><path d="M18.5 12h2"/><path d="m5.99 5.99 1.42 1.42"/><path d="m16.59 16.59 1.42 1.42"/><path d="m18.01 5.99-1.42 1.42"/><path d="m7.41 16.59-1.42 1.42"/>',
  moon: '<path d="M11.9 3.5a6.1 6.1 0 0 0 8.6 8.6 8.6 8.6 0 1 1-8.6-8.6Z"/>',
  monitor: '<rect x="3.5" y="4.75" width="17" height="11.5" rx="1.75"/><path d="M12 16.25v3.25"/><path d="M8.5 19.5h7"/>',

  /* ── Drawer controls & admin ────────────────────────────────────── */
  menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  x: '<path d="m6.5 6.5 11 11"/><path d="m17.5 6.5-11 11"/>',
  check: '<path d="m5 12.75 4.4 4.4L19 7.4"/>',
  plus: '<path d="M12 5.25v13.5"/><path d="M5.25 12h13.5"/>',
  bell: '<path d="M6.4 9.9a5.6 5.6 0 0 1 11.2 0c0 3.05.8 4.8 1.7 5.8H4.7c.9-1 1.7-2.75 1.7-5.8Z"/><path d="M10.05 18.9a1.95 1.95 0 0 0 3.9 0"/>',
  eye: '<path d="M3.5 12s3.1-6.1 8.5-6.1 8.5 6.1 8.5 6.1-3.1 6.1-8.5 6.1S3.5 12 3.5 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  import: '<path d="M12 3.75v9.5"/><path d="m8.25 9.75 3.75 3.75 3.75-3.75"/><path d="M4.25 14.75v3.5a2 2 0 0 0 2 2h11.5a2 2 0 0 0 2-2v-3.5"/>',
  warning: '<path d="M10.42 4.85 3.7 16.6a1.82 1.82 0 0 0 1.58 2.73h13.44a1.82 1.82 0 0 0 1.58-2.73L13.58 4.85a1.82 1.82 0 0 0-3.16 0Z"/><path d="M12 9.5v4.25"/><path d="M12 16.85h.01"/>',
  trash: '<path d="M4 6.5h16"/><path d="M9.4 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2.2a1.5 1.5 0 0 1 1.5 1.5v1.5"/><path d="M18.5 6.5l-.85 12.07a2.1 2.1 0 0 1-2.1 1.93H8.45a2.1 2.1 0 0 1-2.1-1.93L5.5 6.5"/><path d="M10.1 10.5v6"/><path d="M13.9 10.5v6"/>',
} satisfies Record<string, string>

export type IconName = keyof typeof ICONS
export { ICONS }
