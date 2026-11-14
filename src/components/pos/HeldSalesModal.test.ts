import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale, t } from '@/i18n'
import { useShiftStore, type HeldSale } from '@/stores/shift'
import HeldSalesModal from './HeldSalesModal.vue'

const held: HeldSale = {
  id: 1,
  heldAt: '10:05',
  label: '',
  items: [{ productId: 3, nameEn: 'Iced tea', nameKm: '', sku: 'DRK-1', qty: 2, unitPriceCents: 150, discountType: 'amount', discountValue: 0, note: '' }],
  discountType: 'amount',
  discountValue: 0,
  customerId: null,
}

let app: App | null = null
let host: HTMLElement

beforeEach(async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  useShiftStore().heldSales = [structuredClone(held)]
  vi.spyOn(window, 'confirm')
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(HeldSalesModal) }).use(pinia).use(i18n)
  app.mount(host)
  await nextTick()
})

afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  setLocale('en')
})

const confirmDialog = () => document.querySelector('[data-confirm-dialog]')?.closest('[role="dialog"]') ?? null
const dialogButton = (text: string) => [...confirmDialog()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!
async function askToDiscard() {
  host.querySelector<HTMLButtonElement>(`[aria-label="${t('pos.discardAria')}"]`)!.click()
  await nextTick()
}

describe('discarding a held sale', () => {
  it('asks in a popup first, and Cancel keeps it', async () => {
    await askToDiscard()
    expect(window.confirm).not.toHaveBeenCalled()
    expect(confirmDialog()!.getAttribute('aria-label')).toBe(t('pos.discardTitle'))
    expect(confirmDialog()!.textContent).toContain('2 items · $3.00')

    dialogButton(t('common.cancel')).click()
    await nextTick()
    expect(confirmDialog()).toBeNull()
    expect(useShiftStore().heldSales).toHaveLength(1)
  })

  it('discards it on Discard', async () => {
    await askToDiscard()
    dialogButton('Discard').click()
    await nextTick()
    expect(confirmDialog()).toBeNull()
    expect(useShiftStore().heldSales).toEqual([])
    expect(host.textContent).toContain(t('pos.noHeld'))
  })

  it('in Khmer, Discard and Cancel read differently', async () => {
    setLocale('km')
    await nextTick()
    await askToDiscard()
    const labels = [...confirmDialog()!.querySelectorAll('form button')].map((b) => b.textContent?.trim())
    expect(labels).toEqual(['បោះបង់', 'លុបចោល'])
  })
})
