import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '@/i18n'
import type { DiscountType } from '@/composables/useCart'
import { useSettingsStore } from '@/stores/settings'
import DiscountInput from './DiscountInput.vue'

let app: App | null = null
let host: HTMLElement
const type = ref<DiscountType>('amount')
const value = ref(0)

async function mount(start: { type: DiscountType; value: number }, mainCurrency: 'USD' | 'KHR' = 'USD') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const settings = useSettingsStore()
  settings.app = { ...settings.app, mainCurrency }
  type.value = start.type
  value.value = start.value
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({
    render: () =>
      h(DiscountInput, {
        label: 'Discount',
        type: type.value,
        value: value.value,
        'onUpdate:type': (v: DiscountType) => (type.value = v),
        'onUpdate:value': (v: number) => (value.value = v),
      }),
  })
    .use(pinia)
    .use(i18n)
  app.mount(host)
  await nextTick()
}

const box = () => host.querySelector<HTMLInputElement>('[data-discount-input]')!
const sign = () => box().parentElement!.querySelector('[data-money-sign]')
const toggle = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!

async function typeIn(text: string) {
  box().value = text
  box().dispatchEvent(new Event('input'))
  await nextTick()
}

afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
})

describe('a discount box', () => {
  it('takes an amount as money, with the sign beside it', async () => {
    await mount({ type: 'amount', value: 1250.5 })
    expect(box().type).toBe('text')
    expect(box().value).toBe('1,250.50')
    expect(sign()!.textContent).toBe('$')
    await typeIn('2000')
    expect(box().value).toBe('2,000')
    expect(value.value).toBe(2000)
  })

  it('takes a riel company’s amount in whole riel', async () => {
    await mount({ type: 'amount', value: 0 }, 'KHR')
    expect(toggle('៛').getAttribute('aria-pressed')).toBe('true')
    await typeIn('15600')
    expect(box().value).toBe('15,600')
    expect(sign()!.textContent).toBe('៛')
    expect(value.value).toBe(15600)
  })

  it('keeps a percent as a plain number from 0 to 100', async () => {
    await mount({ type: 'amount', value: 0 })
    toggle('%').click()
    await nextTick()
    expect(type.value).toBe('percent')
    expect(box().type).toBe('number')
    expect(box().max).toBe('100')
    expect(sign()).toBeNull()
    await typeIn('15')
    expect(value.value).toBe(15)
  })
})
