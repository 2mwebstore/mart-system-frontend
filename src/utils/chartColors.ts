// Chart series colors. Single-series charts use the brand primary (per
// design system §4: "Primary color ... buttons, charts, ..."). Multi-series
// (categorical) charts pull from the dataviz skill's validated default
// palette instead of inventing new hues — mixing brand orange with two of
// its slots (validated together, see below) keeps Cash visually tied to
// the brand while giving KHQR/Card genuinely distinct identity.
//
// Validated via `validate_palette.js "#FF6D29,#2a78d6,#1baf7a" --mode light`:
// all CVD/lightness/chroma checks PASS; contrast vs a white surface WARNs
// (2.81:1 / 2.82:1), so every chart using these colors ships a visible
// legend + direct value labels (never color alone) to satisfy the relief
// requirement.
export const CHART_PRIMARY = '#FF6D29'
export const CHART_PRIMARY_TINT = '#FFC4A8'

export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  Cash: '#FF6D29',
  KHQR: '#2a78d6',
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
