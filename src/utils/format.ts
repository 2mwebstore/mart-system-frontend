// Money is always integer cents (USD) / integer riel (KHR) on the wire —
// these are the only place the admin app turns that into display strings.

// Collapses -0 (e.g. -totalCents when totalCents is 0) to a plain 0 —
// `(-0).toLocaleString()` prints "-0" in V8, which read as a real bug
// ("-0" next to a P&L line) when spotted in a browser check.
function clearNegativeZero(n: number): number {
  return n === 0 ? 0 : n
}

export function formatUSD(cents: number): string {
  const n = clearNegativeZero(cents)
  return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toFixed(2)}`
}

export function formatKHR(riel: number): string {
  // A space after the riel sign (unlike formatUSD's "$"): tested in the
  // browser, ៛ set flush against a digit in the mono/Kantumruy Pro stack
  // visually fuses into a shape that reads as "$" — easy to misread by a
  // full order of magnitude in a money app. The space keeps it legible.
  return `៛ ${clearNegativeZero(riel).toLocaleString('en-US')}`
}

// The API returns ISO timestamps in the server's timezone (Asia/Phnom_Penh).
// Slicing the string (rather than `new Date()`) shows that wall-clock time
// no matter what timezone the browser is in.
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '—'
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '—'
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  )
}
