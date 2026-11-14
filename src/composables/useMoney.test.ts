import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { Currency } from '@/types/domain'
import { useSettingsStore } from '@/stores/settings'
import { useMoney } from './useMoney'

function company(mainCurrency: Currency) {
  const settings = useSettingsStore()
  settings.rate = 4100
  settings.app = { ...settings.app, mainCurrency }
}

beforeEach(() => setActivePinia(createPinia()))

describe('money in the main currency', () => {
  it('is dollars for a company that never chose', () => {
    useSettingsStore().rate = 4100
    const m = useMoney()
    expect(m.currency.value).toBe('USD')
    expect(m.money(1250)).toBe('$12.50')
    expect(m.other(315)).toBe('៛ 12,900')
    expect([m.symbol.value, m.step.value]).toEqual(['$', '0.01'])
    expect([m.toMinor(2.5), m.toMajor(250)]).toEqual([250, 2.5])
  })

  it('is whole riel for a riel company, with dollars as the second figure', () => {
    company('KHR')
    const m = useMoney()
    expect(m.isRiel.value).toBe(true)
    expect(m.money(15600)).toBe('៛ 15,600')
    expect(m.other(12915)).toBe('$3.15')
    // At a sale's own rate.
    expect(m.other(8000, 4000)).toBe('$2.00')
    expect(m.cashDue(17050)).toBe(17100)
    expect([m.symbol.value, m.step.value]).toEqual(['៛', '1'])
    expect([m.toMinor(1500), m.toMajor(1500)]).toEqual([1500, 1500])
  })

  it('follows the company when its settings change', () => {
    const m = useMoney()
    expect(m.money(100)).toBe('$1.00')
    company('KHR')
    expect(m.money(100)).toBe('៛ 100')
  })

  it("takes a page's own currency over the settings", () => {
    company('USD')
    const fixed = ref<Currency | undefined>('KHR')
    const m = useMoney(fixed)
    expect(m.money(15600)).toBe('៛ 15,600')
    fixed.value = undefined
    expect(m.money(1560)).toBe('$15.60')
  })
})
