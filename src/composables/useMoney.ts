import { computed, type Ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { formatMoney } from '@/utils/format'
import { cashDue, otherFigure, toMajor, toMinor } from '@/utils/money'
import type { Currency } from '@/types/domain'

// Amounts in the company's main currency (the super admin's choice): every
// *Cents amount is in its minor unit, cents for dollars or whole riel. Pass a
// currency for a page that doesn't read the settings (the public menu, the
// customer display).
export function useMoney(fixed?: Ref<Currency | undefined>) {
  const settings = useSettingsStore()
  const currency = computed<Currency>(() => fixed?.value ?? settings.mainCurrency)
  const isRiel = computed(() => currency.value === 'KHR')
  return {
    currency,
    isRiel,
    // "$12.50" or "៛ 15,600".
    money: (minor: number) => formatMoney(minor, currency.value),
    // The same amount in the other currency at the rate (the company's
    // current one unless given): the second figure under a total.
    other: (minor: number, rate?: number) => {
      const o = otherFigure(minor, currency.value, rate ?? settings.rate)
      return formatMoney(o.amount, o.currency)
    },
    cashDue: (minor: number) => cashDue(minor, currency.value),
    // A typed amount (dollars, or riel) to the minor unit, and back.
    toMinor: (major: number) => toMinor(major, currency.value),
    toMajor: (minor: number) => toMajor(minor, currency.value),
    // "$" or "៛", for labels and the discount toggle.
    symbol: computed(() => (isRiel.value ? '៛' : '$')),
    // The step of a number input of the currency.
    step: computed(() => (isRiel.value ? '1' : '0.01')),
  }
}
