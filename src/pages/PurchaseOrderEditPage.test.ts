/* eslint-disable vue/one-component-per-file -- a stand-in editor beside the test's own app */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { i18n, t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import type { Product, PurchaseOrder, PurchaseOrderInput } from '@/types/domain'
import PurchaseOrderEditPage from './PurchaseOrderEditPage.vue'

// The catalog API, recording what the page sends.
const server = vi.hoisted(() => ({
  creates: [] as unknown[],
  updates: [] as { id: number; body: unknown }[],
  po: null as unknown,
  products: [] as unknown[],
}))
vi.mock('@/api/catalog', () => ({
  listSuppliers: async () => [{ id: 7, name: 'Lucky Supply', phone: '012', contact: '', paymentTerms: '' }],
  listProducts: async () => server.products,
  getPurchaseOrder: async () => server.po,
  createPurchaseOrder: async (body: unknown) => {
    server.creates.push(body)
    return body
  },
  updatePurchaseOrder: async (id: number, body: unknown) => {
    server.updates.push({ id, body })
    return body
  },
}))
// The real editor is Tiptap, which needs a browser layout; a textarea stands in.
vi.mock('@/components/RichTextEditor.vue', () => ({
  default: defineComponent({
    props: { modelValue: { type: String, default: '' }, label: String, id: String, placeholder: String },
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

const product = (over: Partial<Product>): Product =>
  ({ id: 5, sku: 'RICE-1', nameEn: 'Rice', nameKm: '', productType: 'STANDARD', active: true, priceCents: 200, costCents: 125, ...over }) as Product
const order = (over: Partial<PurchaseOrder>): PurchaseOrder => ({
  id: 9,
  code: 'PO-000009',
  branchId: 1,
  supplierId: 7,
  supplierName: 'Lucky Supply',
  status: 'SENT',
  note: '<p>Friday</p>',
  shippingCents: 300,
  createdAt: '2026-11-14',
  taxRateId: null,
  taxName: '',
  taxPercent: 0,
  taxCents: 0,
  items: [
    { productId: 5, productName: 'Rice', productNameKm: '', sku: 'RICE-1', qtyOrdered: 3, qtyReceived: 0, unitCostCents: 100, discountCents: 50 },
  ],
  ...over,
})

let app: App | null = null
let host: HTMLElement
let router: Router
let pinia: Pinia

async function settle() {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

async function mount(path: string, mainCurrency: 'USD' | 'KHR' = 'USD') {
  pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    user: { id: 10, full_name: 'Me', username: 'me', role_id: 1, role_name: 'Owner' } as never,
    permissions: ['purchase_order.view', 'purchase_order.create', 'purchase_order.update', 'supplier.view', 'product.view'],
    branches: [{ id: 1, code: 'TK', name: 'Toul Kork' }] as never,
    activeBranchId: 1,
  })
  const settings = useSettingsStore()
  settings.app = { ...settings.app, mainCurrency, taxDefaults: { pos: null, invoice: null, purchase: null, expense: null } }
  settings.taxRates = []
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/inventory/purchase-orders', name: 'inventory-po', component: { render: () => h('p', { 'data-po-list': '' }) } },
      { path: '/inventory/purchase-orders/new', name: 'po-new', component: PurchaseOrderEditPage },
      { path: '/inventory/purchase-orders/:id/edit', name: 'po-edit', component: PurchaseOrderEditPage },
    ],
  })
  await router.push(path)
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ template: '<RouterView />' }).use(pinia).use(router).use(i18n)
  app.mount(host)
  await settle()
}

// Types into the "add an item" box and takes the first match.
async function addItem(text: string) {
  const box = host.querySelector<HTMLInputElement>(`input[placeholder="${t('inventory.itemsSearchHint')}"]`)!
  box.value = text
  box.dispatchEvent(new Event('input'))
  await settle()
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  await settle()
}
// Opens the picker with this label and picks an option by its text.
async function pick(fieldLabel: string, optionLabel: string) {
  const wrapper = [...host.querySelectorAll<HTMLElement>('div.relative')].find((d) => d.querySelector('span')?.textContent?.trim().startsWith(fieldLabel))!
  wrapper.querySelector<HTMLButtonElement>('button')!.click()
  await settle()
  const option = [...document.querySelectorAll<HTMLButtonElement>('[data-searchable-drop] button')].find((b) => b.textContent?.includes(optionLabel))!
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  await settle()
}
function type(el: HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input'))
}
const items = () => [...host.querySelectorAll<HTMLElement>('[data-po-item]')]
const moneyBoxes = (el: ParentNode) => [...el.querySelectorAll<HTMLInputElement>('[data-money-sign]')].map((s) => s.parentElement!.querySelector('input')!)
const shippingBox = () => moneyBoxes(host.querySelector('[data-po-total]')!.closest('.card')!)[0]
const total = () => host.querySelector('[data-po-total]')!.textContent!.trim()
async function submit() {
  host.querySelector('form')!.dispatchEvent(new Event('submit'))
  await settle()
}

beforeEach(() => {
  server.creates = []
  server.updates = []
  server.po = null
  server.products = [product({}), product({ id: 6, sku: 'SVC', nameEn: 'Delivery fee', productType: 'SERVICE' })]
})
afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  document.body.innerHTML = ''
})

describe('the new purchase order page', () => {
  it('builds the order on a page of its own and goes back to the list', async () => {
    await mount('/inventory/purchase-orders/new')
    expect(host.querySelector('h1')?.textContent).toBe(t('inventory.newPo'))
    expect(host.querySelector('[data-po-form]')).not.toBeNull()

    await addItem('Rice')
    expect(items()).toHaveLength(1)
    // The unit cost starts at the product's cost, as money.
    expect(moneyBoxes(items()[0])[0].value).toBe('1.25')
    await addItem('Rice')
    expect(items()).toHaveLength(1)
    expect(items()[0].querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('2')
    // A service holds no stock: it isn't offered.
    await addItem('Delivery')
    expect(items()).toHaveLength(1)

    type(shippingBox(), '2')
    await settle()
    expect(total()).toBe(t('inventory.totalLine', { amount: '$4.50' }))

    // Nothing is sent without a supplier.
    await submit()
    expect(server.creates).toHaveLength(0)
    expect(router.currentRoute.value.name).toBe('po-new')

    await pick(t('common.supplier'), 'Lucky Supply')
    await submit()
    expect(server.creates).toEqual([
      {
        supplierId: 7,
        branchId: 1,
        status: 'DRAFT',
        note: '',
        shippingCents: 200,
        taxRateId: null,
        items: [{ productId: 5, qty: 2, unitCostCents: 125, discountCents: 0 }],
      } satisfies PurchaseOrderInput,
    ])
    expect(router.currentRoute.value.name).toBe('inventory-po')
  })

  it('takes a riel company’s costs in whole riel', async () => {
    server.products = [product({ costCents: 15600 })]
    await mount('/inventory/purchase-orders/new', 'KHR')
    await addItem('Rice')
    const cost = moneyBoxes(items()[0])[0]
    expect(cost.value).toBe('15,600')
    expect(cost.parentElement!.querySelector('[data-money-sign]')!.textContent).toBe('៛')
    await pick(t('common.supplier'), 'Lucky Supply')
    await submit()
    expect((server.creates[0] as PurchaseOrderInput).items).toEqual([{ productId: 5, qty: 1, unitCostCents: 15600, discountCents: 0 }])
  })

  it('goes back without sending anything on Cancel', async () => {
    await mount('/inventory/purchase-orders/new')
    ;[...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === t('common.cancel'))!.click()
    await settle()
    expect(router.currentRoute.value.name).toBe('inventory-po')
    expect(server.creates).toHaveLength(0)
  })
})

describe('the edit purchase order page', () => {
  it('opens the order as it is and saves the changes to it', async () => {
    server.po = order({})
    await mount('/inventory/purchase-orders/9/edit')
    expect(host.querySelector('h1')?.textContent).toBe(t('inventory.editPo', { code: 'PO-000009' }))
    expect(items()).toHaveLength(1)
    // 3 × $1.00, less $0.50 off the line.
    expect(items()[0].querySelector('[data-po-line-total]')!.textContent).toContain('$3.00')
    expect(items()[0].querySelector('[data-po-line-total]')!.textContent).toContain('$2.50')
    expect(total()).toBe(t('inventory.totalLine', { amount: '$5.50' }))

    type(items()[0].querySelector<HTMLInputElement>('input[type="number"]')!, '4')
    await settle()
    await submit()
    expect(server.updates).toEqual([
      {
        id: 9,
        body: {
          supplierId: 7,
          branchId: 1,
          status: 'SENT',
          note: '<p>Friday</p>',
          shippingCents: 300,
          taxRateId: null,
          items: [{ productId: 5, qty: 4, unitCostCents: 100, discountCents: 50 }],
        },
      },
    ])
    expect(server.creates).toHaveLength(0)
    expect(router.currentRoute.value.name).toBe('inventory-po')
  })

  it('won’t open a received order for changes', async () => {
    server.po = order({ status: 'RECEIVED' })
    await mount('/inventory/purchase-orders/9/edit')
    expect(host.textContent).toContain(t('apiErrors.poLockedEdit'))
    expect(host.querySelector('[data-po-form]')).toBeNull()
  })
})
