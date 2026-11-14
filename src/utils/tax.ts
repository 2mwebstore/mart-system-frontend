// Tax added on top of a POS sale, invoice, purchase order or expense. The
// server works it out and keeps it; these show it before saving, with exactly
// the server's sums (backend handlers/tax_rates.go).
import type { TaxRate, TaxSnapshot } from '@/types/domain'

// percent of base, rounded half up to the cent, in whole numbers so it never
// drifts: the percent is taken to hundredths (basis points).
export function taxCents(baseCents: number, percent: number): number {
  if (baseCents <= 0 || percent <= 0) return 0
  const bp = Math.round(percent * 100)
  return Math.floor((baseCents * bp + 5000) / 10000)
}

// The rate a document keeps (its own, even if since changed or switched off).
export type KeptRate = Pick<TaxSnapshot, 'taxRateId' | 'taxName' | 'taxPercent'>

// The percent a picked rate comes to, as the server will take it: the
// document's own rate keeps its kept percent; any other is the rate's now; no
// rate (or one not there) is none.
export function percentFor(id: number | null, rates: TaxRate[], kept?: KeptRate | null): number {
  if (!id) return 0
  if (kept?.taxRateId === id) return kept.taxPercent
  return rates.find((r) => r.id === id && r.active)?.percent ?? 0
}

// The name a picked rate shows, the same way.
export function nameFor(id: number | null, rates: TaxRate[], kept?: KeptRate | null): string {
  if (!id) return ''
  if (kept?.taxRateId === id) return kept.taxName
  return rates.find((r) => r.id === id)?.name ?? ''
}

// "10%", "7.5%", "0.25%": no trailing zeros.
export function formatPercent(percent: number): string {
  return `${Number(percent.toFixed(2))}%`
}

// A rate as the tax line names it: "VAT 10%". A name that already says its
// percent ("VAT 10%") isn't given it a second time.
export function taxTitle(name: string, percent: number): string {
  const pct = formatPercent(percent)
  const said = new RegExp(`(^|[^\\d.])${pct.replace('.', '\\.')}`).test(name)
  return said ? name : `${name} ${pct}`.trim()
}

// The rate a new document starts with: its place's starting rate, when that is
// still an active rate.
export function startingRate(id: number | null | undefined, rates: TaxRate[]): number | null {
  return id && rates.some((r) => r.id === id && r.active) ? id : null
}
