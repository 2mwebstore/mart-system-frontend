import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import type { Shift } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useShiftStore } from '@/stores/shift'
import PosPage from './PosPage.vue'

// The company's choice (the super admin's): with shifts, or without.
const company = vi.hoisted(() => ({ shiftMode: 'REQUIRED' as 'REQUIRED' | 'SKIP' }))

vi.mock('@/api/catalog', () => ({ listCategories: async () => [], listProducts: async () => [] }))
vi.mock('@/api/people', () => ({ listCustomers: async () => [] }))
vi.mock('@/api/tableOrders', () => ({ getTableBoard: async () => [] }))
vi.mock('@/api/settings', () => ({
  getSettings: async () => ({ ...useSettingsStore().app, shiftMode: company.shiftMode }),
  listTaxRates: async () => [],
}))
vi.mock('@/composables/useTableOrders', () => ({
  useTableOrders: () => ({ newCount: ref(0), orders: ref([]), refresh: async () => {}, accept: async () => {}, move: async () => {} }),
}))
vi.mock('@/composables/useCustomerDisplay', () => ({
  openCustomerDisplay: () => {},
  useCustomerDisplaySender: () => ({ supported: false, send: () => {}, close: () => {} }),
}))

let app: App | null = null
let host: HTMLElement

async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

async function openTill(shiftMode: 'REQUIRED' | 'SKIP') {
  company.shiftMode = shiftMode
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({ permissions: ['pos.sell', 'pos.cash_movement'] })
  const settings = useSettingsStore()
  settings.app = { ...settings.app, shiftMode }
  const shift = useShiftStore()
  shift.shift = { id: 7, branchId: 1, status: 'OPEN' } as Shift
  shift.deviceKey = 'TK-1'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['pos', 'pos-close-shift', 'dashboard'].map((name) => ({ path: `/${name}`, name, component: { render: () => null } })),
  })
  await router.push('/pos')
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(PosPage) }).use(pinia).use(router).use(i18n)
  app.mount(host)
  await settle()
}

afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
})

const shown = (selector: string) => host.querySelector(selector) !== null
async function openMenu() {
  host.querySelector<HTMLButtonElement>('[aria-expanded]')!.click()
  await nextTick()
}

describe("the till's shift buttons", () => {
  it('offers closing the shift and moving cash to a company with shifts', async () => {
    await openTill('REQUIRED')
    expect(shown('[data-pos-close-shift]')).toBe(true)
    expect(shown('[data-pos-cash-movement]')).toBe(true)
    await openMenu()
    expect(shown('[data-pos-close-shift-menu]')).toBe(true)
    expect(shown('[data-pos-cash-movement-menu]')).toBe(true)
  })

  it('offers neither to a company without shifts', async () => {
    await openTill('SKIP')
    expect(shown('[data-pos-close-shift]')).toBe(false)
    expect(shown('[data-pos-cash-movement]')).toBe(false)
    await openMenu()
    expect(shown('[role="menu"]')).toBe(true)
    expect(shown('[data-pos-close-shift-menu]')).toBe(false)
    expect(shown('[data-pos-cash-movement-menu]')).toBe(false)
  })
})
