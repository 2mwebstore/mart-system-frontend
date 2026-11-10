import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, t } from '@/i18n'
import type { TaxDefaults, TaxRate } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import TaxRatesPanel from './TaxRatesPanel.vue'

// The tax-rate API, recording what the panel sends.
const server = vi.hoisted(() => ({
  rates: [] as unknown[],
  defaults: { pos: null, invoice: null, purchase: null, expense: null } as Record<string, number | null>,
  defaultsSent: [] as unknown[],
  creates: [] as unknown[],
  updates: [] as unknown[],
  deletes: [] as number[],
}))
vi.mock('@/api/settings', () => ({
  listTaxRates: async () => server.rates,
  getSettings: async () => ({ receiptHeader: '', taxDefaults: { ...server.defaults } }),
  updateTaxDefaults: async (d: TaxDefaults) => {
    server.defaultsSent.push(d)
    server.defaults = { ...d }
    return d
  },
  createTaxRate: async (body: Record<string, unknown>) => {
    server.creates.push(body)
    return { id: 9, ...body }
  },
  updateTaxRate: async (id: number, body: Record<string, unknown>) => {
    server.updates.push({ id, ...body })
    return { id, ...body }
  },
  deleteTaxRate: async (id: number) => {
    server.deletes.push(id)
  },
}))

let app: App | null = null
let host: HTMLElement

async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

async function mount(permissions: string[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({ permissions })
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(TaxRatesPanel).use(pinia).use(i18n)
  app.mount(host)
  await settle()
}

const place = (key: string) => host.querySelector<HTMLElement>(`[data-place="${key}"]`)!
async function pickStarting(key: string, optionLabel: string) {
  place(key).querySelector<HTMLButtonElement>('button')!.click()
  await settle()
  const option = [...document.querySelectorAll<HTMLButtonElement>('[data-searchable-drop] button')].find((b) => b.textContent?.includes(optionLabel))!
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  await settle()
}
const saveStarting = () => host.querySelector<HTMLButtonElement>('[data-action="save-starting"]')

beforeEach(() => {
  server.rates = [{ id: 1, name: 'VAT 10%', percent: 10, active: true } as TaxRate, { id: 2, name: 'Old', percent: 5, active: false } as TaxRate]
  server.defaults = { pos: null, invoice: 1, purchase: null, expense: null }
  server.defaultsSent = []
  server.creates = []
  server.updates = []
  server.deletes = []
})
afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
  document.body.innerHTML = ''
})

describe('Settings › Tax rates', () => {
  it('lists every rate, switched off too', async () => {
    await mount(['tax_rate.update'])
    expect(host.querySelector('[data-rate="1"]')?.textContent).toContain('10%')
    expect(host.querySelector('[data-rate="2"] [role="switch"]')?.getAttribute('aria-checked')).toBe('false')
  })

  it('saves where each place starts, once something changed', async () => {
    await mount(['tax_rate.update'])
    expect(place('invoice').textContent).toContain('VAT 10%')
    expect(saveStarting()!.disabled).toBe(true)

    await pickStarting('pos', 'VAT 10%')
    expect(saveStarting()!.disabled).toBe(false)
    saveStarting()!.click()
    await settle()

    expect(server.defaultsSent).toEqual([{ pos: 1, invoice: 1, purchase: null, expense: null }])
    expect(saveStarting()!.disabled).toBe(true)
  })

  it('offers only active rates as a starting rate', async () => {
    await mount(['tax_rate.update'])
    place('pos').querySelector<HTMLButtonElement>('button')!.click()
    await settle()
    const options = [...document.querySelectorAll('[data-searchable-drop] button')].map((b) => b.textContent ?? '')
    expect(options.some((o) => o.includes('VAT 10%'))).toBe(true)
    expect(options.some((o) => o.includes('Old'))).toBe(false)
    expect(options.some((o) => o.includes(t('tax.none')))).toBe(true)
  })

  it('adds a rate', async () => {
    await mount(['tax_rate.create'])
    host.querySelector<HTMLButtonElement>('[data-action="new-rate"]')!.click()
    await settle()
    const name = document.querySelector<HTMLInputElement>('#tax-name')!
    name.value = ' GST '
    name.dispatchEvent(new Event('input'))
    const percent = document.querySelector<HTMLInputElement>('#tax-percent')!
    percent.value = '7.5'
    percent.dispatchEvent(new Event('input'))
    document.querySelector<HTMLInputElement>('#tax-name')!.form!.dispatchEvent(new Event('submit'))
    await settle()

    expect(server.creates).toEqual([{ name: 'GST', percent: 7.5, active: true }])
  })

  it('switches a rate off', async () => {
    await mount(['tax_rate.update'])
    host.querySelector<HTMLButtonElement>('[data-rate="1"] [role="switch"]')!.click()
    await settle()
    expect(server.updates).toEqual([{ id: 1, name: 'VAT 10%', percent: 10, active: false }])
  })

  it('only shows the rates without the tax-rate permissions', async () => {
    await mount([])
    expect(host.querySelector('[data-action="new-rate"]')).toBeNull()
    expect(saveStarting()).toBeNull()
    expect(host.querySelector('[data-rate="1"] [role="switch"]')!.hasAttribute('disabled')).toBe(true)
    expect(host.querySelector(`[data-rate="1"] button[aria-label="${t('tax.editAria', { name: 'VAT 10%' })}"]`)).toBeNull()
    expect(place('pos').querySelector('button')!.disabled).toBe(true)
  })
})
