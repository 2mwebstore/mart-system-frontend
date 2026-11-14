// Mirrors backend/internal/utils/money.go's rounding rule so mock data and
// (later) real API values that need client-side derivation stay consistent
// with the server. USD stays integer cents, KHR integer riel — never float.
const RIEL_NOTE_UNIT = 100

import { t } from '@/i18n'
import type { Currency } from '@/types/domain'

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
// A payment with riel in it is checked in riel too, as the server does:
// handing over exactly the riel amount due (rounded to ៛100), e.g. ៛12,900
// for $3.15 at ៛4,100, pays the sale with no change, although it comes to a
// cent or two under the dollars. All-dollar payments are checked to the cent.
export function calculateChange(dueCents: number, receivedUsdCents: number, receivedKhrRiel: number, rateRielPerUsd: number): Change {
  const received = receivedUsdCents + rielToUsdCents(receivedKhrRiel, rateRielPerUsd)
  const change = received - dueCents
  if (change < 0 && receivedKhrRiel > 0 && coversRielDue(dueCents, receivedUsdCents, receivedKhrRiel, rateRielPerUsd)) {
    return { usdCents: 0, khrRiel: 0, shortCents: 0 }
  }
  if (change < 0) return { usdCents: 0, khrRiel: 0, shortCents: -change }
  const wholeDollars = Math.floor(change / 100) * 100
  return { usdCents: wholeDollars, khrRiel: usdCentsToRiel(change - wholeDollars, rateRielPerUsd), shortCents: 0 }
}

// Whether a tender is worth at least the riel amount due, as the till shows
// it (rounded to ៛100). Compared in hundredths of a riel, as the server does.
export function coversRielDue(dueCents: number, receivedUsdCents: number, receivedKhrRiel: number, rateRielPerUsd: number): boolean {
  return receivedKhrRiel * 100 + receivedUsdCents * rateRielPerUsd >= usdCentsToRiel(dueCents, rateRielPerUsd) * 100
}

// The change rule for a company that sells in riel, as the server's
// CalculateChangeKHR: the cash due is the amount rounded to ៛100, dollars
// handed over count at the rate, and all change is given in riel, rounded to
// ៛100. shortCents is the riel still owed.
export function calculateChangeKHR(dueRiel: number, receivedUsdCents: number, receivedKhrRiel: number, rateRielPerUsd: number): Change {
  const cashDue = roundRielTo100(dueRiel)
  const received = receivedKhrRiel + Math.floor((receivedUsdCents * rateRielPerUsd) / 100)
  if (received < cashDue) return { usdCents: 0, khrRiel: 0, shortCents: cashDue - received }
  return { usdCents: 0, khrRiel: roundRielTo100(received - cashDue), shortCents: 0 }
}

// The change rule for a company's main currency: due is in its minor unit.
export function calculateChangeIn(currency: Currency, due: number, receivedUsdCents: number, receivedKhrRiel: number, rateRielPerUsd: number): Change {
  return currency === 'KHR'
    ? calculateChangeKHR(due, receivedUsdCents, receivedKhrRiel, rateRielPerUsd)
    : calculateChange(due, receivedUsdCents, receivedKhrRiel, rateRielPerUsd)
}

// What the cash payment of an amount comes to: riel is rounded to the ៛100
// note, dollars are paid to the cent.
export function cashDue(amount: number, currency: Currency): number {
  return currency === 'KHR' ? roundRielTo100(amount) : amount
}

// Typed amounts to and from a main currency's minor unit: dollars to cents,
// riel as it is (whole riel, nothing smaller).
export function toMinor(major: number, currency: Currency): number {
  return currency === 'KHR' ? Math.round(major || 0) : Math.round((major || 0) * 100)
}
export function toMajor(minor: number, currency: Currency): number {
  return currency === 'KHR' ? minor : minor / 100
}

// An amount of the main currency in the other one, for the second figure
// under a total: dollars as riel rounded to ៛100, riel as dollars to the cent.
export function otherFigure(minor: number, currency: Currency, rateRielPerUsd: number): { currency: Currency; amount: number } {
  if (currency === 'KHR') return { currency: 'USD', amount: rateRielPerUsd > 0 ? Math.round((minor * 100) / rateRielPerUsd) : 0 }
  return { currency: 'KHR', amount: usdCentsToRiel(minor, rateRielPerUsd) }
}

// Balanced / Short / Over for a closed drawer count. USD and KHR differences
// are combined at the shift's rate, in the company's main currency, so being
// $1 over and ៛4,100 short is Balanced rather than Short.
export function drawerStatus(
  diffUsdCents: number,
  diffKhrRiel: number,
  rateRielPerUsd: number,
  currency: Currency = 'USD',
): { tone: 'success' | 'warning' | 'danger'; label: string } {
  const combined =
    currency === 'KHR'
      ? diffKhrRiel + Math.round((diffUsdCents * rateRielPerUsd) / 100)
      : diffUsdCents + Math.round((diffKhrRiel * 100) / (rateRielPerUsd || 1))
  if (combined === 0) return { tone: 'success', label: t('drawer.Balanced') }
  return combined < 0 ? { tone: 'danger', label: t('drawer.Short') } : { tone: 'warning', label: t('drawer.Over') }
}
