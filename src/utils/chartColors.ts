// Chart series colors. Single-series charts use the brand primary (per
// design system §4: "Primary color ... buttons, charts, ..."). Multi-series
// (categorical) charts pull from the dataviz skill's validated default
// palette instead of inventing new hues.
//
// Payment methods: brand blue for Cash, with violet and aqua from the
// validated palette so no other blue sits next to the brand one. Validated via
// `validate_palette.js "#2593d2,#6250d6,#1baf7a" --mode light` (adjacent and
// --pairs all): lightness, chroma, CVD (worst ΔE 12.4) and normal-vision
// (17.2) checks PASS; contrast vs a white surface WARNs for Card (2.74:1), so
// every chart using these colors ships a visible legend + direct value labels
// (never color alone) to satisfy the relief requirement.
export const CHART_PRIMARY = '#2593D2'
export const CHART_PRIMARY_TINT = '#A9D6F0'
// Area under the line chart: the brand blue at low opacity.
export const CHART_PRIMARY_FILL = 'rgba(37,147,210,0.12)'

// Chart chrome, matching the Tailwind tokens: navy tooltip, `line` grid,
// `muted` ticks and the fallback for a series with no assigned color.
export const CHART_TOOLTIP_BG = '#091434'
export const CHART_GRID = '#DFE5EE'
export const CHART_MUTED = '#5B6577'

export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  Cash: '#2593D2',
  KHQR: '#6250d6',
  Card: '#1baf7a',
}

// First 5 slots of the dataviz skill's validated 8-hue categorical order
// (references/palette.md) — a prefix of a validated adjacent-pair order
// keeps the same (already-passing) adjacent pairs.
export const CATEGORY_COLORS: Record<string, string> = {
  Drinks: '#2a78d6',
  Pantry: '#eb6834',
  Snacks: '#1baf7a',
  Household: '#eda100',
  'Personal care': '#e87ba4',
}
