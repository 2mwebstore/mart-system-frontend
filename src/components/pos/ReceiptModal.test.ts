import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'
import { i18n, t } from '@/i18n'
import type { Sale } from '@/types/domain'
import ReceiptModal from './ReceiptModal.vue'

const printed = vi.hoisted(() => ({ elements: [] as HTMLElement[] }))
vi.mock('@/utils/receiptPrint', () => ({ printReceipt: (el: HTMLElement) => void printed.elements.push(el) }))
vi.mock('@/api/settings', () => ({
  getBranding: async () => ({ companyName: 'CM Shop', hasLogo: false, logoLink: '', logoVersion: '' }),
}))

const sale: Sale = {
  id: 1,
  receiptNo: 'INV-000001',
  shiftId: 7,
  branchId: 1,
  cashier: 'Sok Dara',
  customerId: null,
  customerName: '',
  status: 'PAID',
  shiftStatus: 'OPEN',
  subtotalCents: 335,
  discountCents: 0,
  totalCents: 335,
  totalRiel: 13700,
  exchangeRate: 4100,
  pointsEarned: 0,
  soldAt: '2026-11-12T18:03:00+07:00',
  note: '',
  items: [
    { productId: 3, name: 'Dish soap 750ml', nameKm: '', sku: 'HHD-001', qty: 1, unitPriceCents: 195, discountCents: 0, note: '', lineTotalCents: 195 },
    { productId: 2, name: 'Toothpaste 150g', nameKm: '', sku: 'PSC-001', qty: 1, unitPriceCents: 140, discountCents: 0, note: '', lineTotalCents: 140 },
  ],
  payment: { method: 'CASH', receivedUsdCents: 335, receivedKhrRiel: 0, changeUsdCents: 0, changeKhrRiel: 0, reference: '' },
  taxRateId: null,
  taxName: '',
  taxPercent: 0,
  taxCents: 0,
}

let app: App | null = null
afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
  printed.elements = []
})

describe('the receipt after a sale', () => {
  it('prints the receipt alone, on receipt paper', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp({ render: () => h(ReceiptModal, { sale }) }).use(createPinia()).use(i18n)
    app.mount(host)
    await nextTick()

    const print = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === t('common.print'))!
    print.click()
    expect(printed.elements).toHaveLength(1)
    const [receipt] = printed.elements
    expect(receipt.id).toBe('pos-receipt')
    expect(receipt.textContent).toContain('Dish soap 750ml')
    // The dialog's title and buttons stay on screen.
    expect(receipt.textContent).not.toContain(t('pos.paymentComplete'))
    expect(receipt.textContent).not.toContain(t('pos.newSale'))
  })
})
