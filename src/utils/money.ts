// Mirrors backend/internal/utils/money.go's rounding rule so mock data and
// (later) real API values that need client-side derivation stay consistent
// with the server. USD stays integer cents, KHR integer riel — never float.
const RIEL_NOTE_UNIT = 100

import { t } from '@/i18n'

export function roundRielTo100(riel: number): number {
  return Math.round(riel / RIEL_NOTE_UNIT) * RIEL_NOTE_UNIT
}

export function usdCentsToRiel(cents: number, rateRielPerUsd: number): number {
  return roundRielTo100((cents * rateRielPerUsd) / 100)
}

export function rielToUsdCents(riel: number, rateRielPerUsd: number): number {
  if (rateRielPerUsd <= 0) return 0
  return Math.floor((riel * 100) / rateRielPerUsd)
}

export interface Change {
  usdCents: number
  khrRiel: number
  shortCents: number
}

// Same rule as backend utils.CalculateChange (build spec §3): tender can be
// any USD + KHR mix; the shortfall/change is worked out in USD, then change is
// given as whole dollars in USD plus the remainder in riel rounded to ៛100.
// The server recomputes this — the till only uses it to show the cashier what
// to hand back before the sale is submitted.
export function calculateChange(dueCents: number, receivedUsdCents: number, receivedKhrRiel: number, rateRielPerUsd: number): Change {
  const received = receivedUsdCents + rielToUsdCents(receivedKhrRiel, rateRielPerUsd)
  const change = received - dueCents
  if (change < 0) return { usdCents: 0, khrRiel: 0, shortCents: -change }
  const wholeDollars = Math.floor(change / 100) * 100
  return { usdCents: wholeDollars, khrRiel: usdCentsToRiel(change - wholeDollars, rateRielPerUsd), shortCents: 0 }
}

// Balanced / Short / Over for a closed drawer count. USD and KHR differences
// are combined at the shift's rate, so being $1 over and ៛4,100 short is
// Balanced rather than Short.
export function drawerStatus(diffUsdCents: number, diffKhrRiel: number, rateRielPerUsd: number): { tone: 'success' | 'warning' | 'danger'; label: string } {
  const combined = diffUsdCents + Math.round((diffKhrRiel * 100) / (rateRielPerUsd || 1))
  if (combined === 0) return { tone: 'success', label: t('drawer.Balanced') }
  return combined < 0 ? { tone: 'danger', label: t('drawer.Short') } : { tone: 'warning', label: t('drawer.Over') }
}
