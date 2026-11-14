import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale, t } from '@/i18n'
import type { Currency, Sale } from '@/types/domain'
import { useSettingsStore } from '@/stores/settings'
import { formatKHR } from '@/utils/format'
import ReceiptModal from './ReceiptModal.vue'

const printed = vi.hoisted(() => ({ elements: [] as HTMLElement[], cleared: 0 }))
vi.mock('@/utils/receiptPrint', () => ({
  printReceipt: (el: HTMLElement) => void printed.elements.push(el),
  clearReceiptPrint: () => void printed.cleared++,
}))
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

// 2 rice at 10% off, toothpaste $0.20 off, dish soap at full price, and $0.50
// off the whole sale: the server's discount is the three together ($2.00).
const discounted: Sale = {
  ...sale,
  subtotalCents: 1635,
  discountCents: 200,
  totalCents: 1435,
  totalRiel: 58800,
  items: [
    { productId: 6, name: 'Jasmine rice 5kg', nameKm: 'អង្ករម្លិះ 5kg', sku: 'PAN-002', qty: 2, unitPriceCents: 650, discountCents: 130, note: '', lineTotalCents: 1170 },
    { productId: 12, name: 'Toothpaste 150g', nameKm: '', sku: 'PSC-001', qty: 1, unitPriceCents: 140, discountCents: 20, note: '', lineTotalCents: 120 },
    { productId: 11, name: 'Dish soap 750ml', nameKm: '', sku: 'HHD-001', qty: 1, unitPriceCents: 195, discountCents: 0, note: 'no box', lineTotalCents: 195 },
  ],
}

let app: App | null = null
let host: HTMLElement
afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
  printed.elements = []
  printed.cleared = 0
  setLocale('en')
})

async function showReceipt(of: Sale, mainCurrency: Currency = 'USD') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSettingsStore().app.mainCurrency = mainCurrency
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(ReceiptModal, { sale: of }) }).use(pinia).use(i18n)
  app.mount(host)
  await nextTick()
}
const cells = (el: Element) => [...el.children].map((c) => c.textContent?.replace(/\s+/g, ' ').trim())
const head = () => cells(host.querySelector('[data-receipt-head]')!)
const lines = () => [...host.querySelectorAll('[data-receipt-line]')].map(cells)
// The totals under the items, as "label value".
const totals = () =>
  [...host.querySelectorAll('[data-receipt-items] + div > div')].map((d) => [...d.children].map((c) => c.textContent?.trim()).join(' ').trim())
// The cash lines under the totals, as "label value".
const cashLines = () =>
  [...host.querySelectorAll('[data-receipt-items] + div + div > div')].map((d) => [...d.children].map((c) => c.textContent?.trim()).join(' ').trim())

// A riel company's sale: ៛13,500 at ៛4,100, paid with a $5 note.
const rielSale: Sale = {
  ...sale,
  subtotalCents: 13500,
  totalCents: 13500,
  totalRiel: 13500,
  items: [
    { productId: 3, name: 'Dish soap 750ml', nameKm: '', sku: 'HHD-001', qty: 1, unitPriceCents: 7800, discountCents: 0, note: '', lineTotalCents: 7800 },
    { productId: 2, name: 'Toothpaste 150g', nameKm: '', sku: 'PSC-001', qty: 1, unitPriceCents: 5700, discountCents: 0, note: '', lineTotalCents: 5700 },
  ],
  payment: { method: 'CASH', receivedUsdCents: 500, receivedKhrRiel: 0, changeUsdCents: 0, changeKhrRiel: 7000, reference: '' },
}

describe('the receipt after a sale', () => {
  it('lists the items under Item, Qty and Total when nothing is discounted', async () => {
    await showReceipt(sale)
    expect(head()).toEqual(['Item', 'Qty', 'Total'])
    expect(lines()).toEqual([
      ['Dish soap 750ml', '1', '$1.95'],
      ['Toothpaste 150g', '1', '$1.40'],
    ])
    expect(host.querySelector('[data-receipt-items]')!.classList).toContain('grid-cols-[minmax(0,1fr)_auto_auto]')
    expect(totals()).toEqual(['Subtotal $3.35', 'Total $3.35', formatKHR(13700)])
  })

  it('adds the Disc column when an item has a discount', async () => {
    await showReceipt(discounted)
    expect(head()).toEqual(['Item', 'Qty', 'Disc', 'Total'])
    expect(host.querySelector('[data-receipt-items]')!.classList).toContain('grid-cols-[minmax(0,1fr)_auto_auto_auto]')
  })

  it('leaves the Disc column out when only the whole sale is discounted', async () => {
    await showReceipt({ ...sale, discountCents: 50, totalCents: 285, totalRiel: 11700 })
    expect(head()).toEqual(['Item', 'Qty', 'Total'])
    expect(lines()).toEqual([
      ['Dish soap 750ml', '1', '$1.95'],
      ['Toothpaste 150g', '1', '$1.40'],
    ])
    expect(totals()).toEqual(['Subtotal $3.35', 'Discount -$0.50', 'Total $2.85', formatKHR(11700)])
  })

  it('prints product names smaller than the amounts', async () => {
    await showReceipt(discounted)
    const names = [...host.querySelectorAll('[data-receipt-name]')]
    expect(names).toHaveLength(3)
    for (const name of names) expect(name.classList).toContain('text-[12px]')
    expect(host.querySelector('#pos-receipt')!.classList).toContain('text-sm')
  })

  it("shows each item's own discount and its total after it", async () => {
    await showReceipt(discounted)
    expect(lines()).toEqual([
      // The price of one, when there's more than one.
      ['Jasmine rice 5kg $6.50 each', '2', '-$1.30', '$11.70'],
      ['Toothpaste 150g', '1', '-$0.20', '$1.20'],
      ['Dish soap 750ml ↳ no box', '1', '', '$1.95'],
    ])
  })

  it('adds the line totals up, then takes off the discount on the whole sale', async () => {
    await showReceipt(discounted)
    // $11.70 + $1.20 + $1.95 = $14.85, less $0.50 = $14.35.
    expect(totals()).toEqual(['Subtotal $14.85', 'Discount -$0.50', 'Total $14.35', formatKHR(58800)])
  })

  it('shows no discount under the items when only items were discounted', async () => {
    await showReceipt({ ...discounted, discountCents: 150, totalCents: 1485, totalRiel: 60900 })
    expect(totals()).toEqual(['Subtotal $14.85', 'Total $14.85', formatKHR(60900)])
  })

  it('says it in Khmer', async () => {
    setLocale('km')
    await showReceipt(discounted)
    expect(head()).toEqual([t('col.item'), t('col.qty'), t('pos.receiptDisc'), t('col.total')])
    expect(head()).toEqual(['មុខទំនិញ', 'ចំនួន', 'បញ្ចុះ', 'សរុប'])
    expect(lines()[0][0]).toContain('អង្ករម្លិះ 5kg')
  })

  it('prints the receipt alone, on receipt paper', async () => {
    await showReceipt(sale)

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

  it('keeps the receipt ready for the printer until it is closed', async () => {
    await showReceipt(sale)
    const print = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === t('common.print'))!
    print.click()
    expect(printed.cleared).toBe(0)
    app!.unmount()
    app = null
    expect(printed.cleared).toBe(1)
  })
})

describe('the receipt of a riel company', () => {
  it('shows riel, with dollars as the second figure', async () => {
    await showReceipt(rielSale, 'KHR')
    expect(lines()).toEqual([
      ['Dish soap 750ml', '1', '៛ 7,800'],
      ['Toothpaste 150g', '1', '៛ 5,700'],
    ])
    // ៛13,500 at the sale's ៛4,100.
    expect(totals()).toEqual(['Subtotal ៛ 13,500', 'Total ៛ 13,500', '$3.29'])
  })

  it('shows the notes handed over, and all the change in riel', async () => {
    await showReceipt(rielSale, 'KHR')
    expect(cashLines()).toEqual(['Paid by Cash', 'Tendered $5.00', 'Change ៛ 7,000'])
    await showReceipt({ ...rielSale, payment: { ...rielSale.payment, receivedUsdCents: 200, receivedKhrRiel: 5000, changeKhrRiel: 0 } }, 'KHR')
    expect(cashLines()).toEqual(['Paid by Cash', 'Tendered $2.00 + ៛ 5,000', 'Change ៛ 0'])
  })

  it('keeps dollars and riel change for a dollar company', async () => {
    await showReceipt({ ...sale, payment: { ...sale.payment, receivedUsdCents: 500, changeUsdCents: 100, changeKhrRiel: 2700 } })
    expect(cashLines()).toEqual(['Paid by Cash', 'Tendered $5.00', 'Change $1.00 + ៛ 2,700'])
  })
})
