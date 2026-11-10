/* eslint-disable vue/one-component-per-file -- a stand-in editor beside the test's own app */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, t } from '@/i18n'
import type { EditSaleInput } from '@/api/pos'
import type { Sale } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import { formatUSD } from '@/utils/format'
import SaleEditor from './SaleEditor.vue'

vi.mock('@/api/settings', () => ({
  listPaymentMethods: async () => [{ id: 1, name: 'Cash', type: 'CASH', enabled: true }],
}))
// Tiptap needs a browser layout; a textarea stands in with the same v-model.
vi.mock('@/components/RichTextEditor.vue', () => ({
  default: defineComponent({
    props: { modelValue: { type: String, default: '' }, label: String, id: String },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('textarea', {
          'data-rich-note': '',
          value: props.modelValue,
          onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLTextAreaElement).value),
        })
    },
  }),
}))

// A $20 sale with $1 off the cart, VAT kept at 10% (the rate may be 20% now).
const sale = (): Sale => ({
  id: 5,
  receiptNo: 'SALE-000005',
  shiftId: 1,
  branchId: 1,
  cashier: 'Dara',
  customerId: null,
  customerName: '',
  status: 'PAID',
  shiftStatus: 'OPEN',
  subtotalCents: 2000,
  discountCents: 100,
  totalCents: 2090,
  totalRiel: 0,
  exchangeRate: 4000,
  pointsEarned: 0,
  soldAt: '2026-11-10T09:00:00Z',
  note: '<p>deliver</p>',
  items: [{ productId: 3, name: 'Tea', nameKm: '', sku: 'DRI-003', qty: 2, unitPriceCents: 1000, discountCents: 0, note: '', lineTotalCents: 2000 }],
  payment: { method: 'CASH', receivedUsdCents: 2100, receivedKhrRiel: 0, changeUsdCents: 0, changeKhrRiel: 400, reference: '' },
  taxRateId: 1,
  taxName: 'VAT',
  taxPercent: 10,
  taxCents: 190,
})

let app: App | null = null
let host: HTMLElement
let saved: EditSaleInput[] = []

async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}
async function mount(s: Sale) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({ permissions: ['pos.discount'] })
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(SaleEditor, { sale: s, products: [], onSave: (b: EditSaleInput) => saved.push(b) }) })
    .use(pinia)
    .use(i18n)
  app.mount(host)
  await settle()
}
const saveButton = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === t('common.save'))!

beforeEach(() => {
  saved = []
})
afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
  document.body.innerHTML = ''
})

describe('editing a sale', () => {
  it('works the tax out at the sale’s own percent, after the discount', async () => {
    await mount(sale())
    expect(host.querySelector('[data-tax-line]')?.textContent).toContain(formatUSD(190))
    expect(host.textContent).toContain(formatUSD(2090))
  })

  it('a bigger sale owes more with the tax, and the cash must cover it', async () => {
    await mount(sale())
    const qty = host.querySelector<HTMLInputElement>('input[type="number"][min="1"]')!
    qty.value = '3'
    qty.dispatchEvent(new Event('input'))
    await settle()

    // $30 − $1 = $29, + 10% = $31.90; $21 tendered is short.
    expect(host.querySelector('[data-tax-line]')?.textContent).toContain(formatUSD(290))
    expect(host.textContent).toContain(formatUSD(3190))
    expect(host.textContent).toContain(t('inventory.saleStillOwed'))
    expect(saveButton().disabled).toBe(true)
  })

  it('sends the edited note', async () => {
    await mount(sale())
    const note = host.querySelector<HTMLTextAreaElement>('[data-rich-note]')!
    expect(note.value).toBe('<p>deliver</p>')
    note.value = '<p>deliver at <strong>5</strong></p>'
    note.dispatchEvent(new Event('input'))
    await settle()
    saveButton().click()
    await settle()
    expect(saved[0]).toMatchObject({ note: '<p>deliver at <strong>5</strong></p>', discountCents: 100 })
  })

  it('shows no tax line on a sale without tax', async () => {
    await mount({ ...sale(), taxRateId: null, taxName: '', taxPercent: 0, taxCents: 0, totalCents: 1900 })
    expect(host.querySelector('[data-tax-line]')).toBeNull()
    expect(host.textContent).toContain(formatUSD(1900))
  })
})
