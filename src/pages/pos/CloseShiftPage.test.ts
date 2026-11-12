import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { i18n, t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useShiftStore } from '@/stores/shift'
import type { Shift } from '@/types/domain'
import CloseShiftPage from './CloseShiftPage.vue'

// The shift on Till 2 at Toul Kork, open and then as the server closes it.
const openShift = {
  id: 7,
  branchId: 1,
  deviceId: 2,
  deviceKey: 'TK-2',
  deviceName: 'Till 2',
  userId: 2,
  cashierName: 'Sok Dara',
  status: 'OPEN',
  openedAt: '2026-11-11T08:00:00+07:00',
  closedAt: null,
  exchangeRate: 4100,
  openingUsdCents: 0,
  openingKhrRiel: 0,
  transactions: 0,
  itemsSold: 0,
  grossSalesCents: 0,
  cashSalesCount: 0,
  cashUsdCents: 0,
  cashKhrRiel: 0,
  khqrCents: 0,
  cardCents: 0,
  voidedCount: 0,
  voidedCents: 0,
  payinUsdCents: 0,
  payinKhrRiel: 0,
  payoutUsdCents: 0,
  payoutKhrRiel: 0,
  expectedUsdCents: 0,
  expectedKhrRiel: 0,
  countedUsdCents: 0,
  countedKhrRiel: 0,
  diffUsdCents: 0,
  diffKhrRiel: 0,
  cashMovements: null,
} satisfies Shift
vi.mock('@/api/pos', () => ({
  closeShift: async () => ({ ...openShift, status: 'CLOSED', closedAt: '2026-11-11T17:00:00+07:00' }),
}))
const printed = vi.hoisted(() => ({ elements: [] as HTMLElement[] }))
vi.mock('@/utils/receiptPrint', () => ({ printReceipt: (el: HTMLElement) => void printed.elements.push(el) }))
vi.mock('@/api/settings', () => ({
  getBranding: async () => ({ companyName: 'CM Shop', hasLogo: false, logoLink: '', logoVersion: '' }),
}))

let app: App | null = null
let host: HTMLElement
let router: Router

async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement

beforeEach(async () => {
  localStorage.clear()
  printed.elements = []
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().selectTill('TK-2', 'Till 2 · Toul Kork', 1)
  const shift = useShiftStore()
  shift.deviceKey = 'TK-2'
  shift.shift = openShift

  router = createRouter({
    history: createMemoryHistory(),
    routes: ['pos', 'pos-login', 'pos-open-shift', 'pos-close-shift'].map((name) => ({ path: `/${name}`, name, component: { render: () => null } })),
  })
  await router.push('/pos-close-shift')
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(CloseShiftPage).use(pinia).use(router).use(i18n)
  app.mount(host)
  await settle()
})

afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
})

describe('after closing a shift', () => {
  it('"Open next shift" asks which till instead of reopening this one', async () => {
    button(t('shifts.confirmClose')).click()
    await settle()
    button(t('shifts.openNext')).click()
    await settle()

    expect(router.currentRoute.value.name).toBe('pos-login')
    const auth = useAuthStore()
    expect([auth.deviceKey, auth.tillName, auth.tillBranchId]).toEqual(['', '', null])
    expect(localStorage.getItem('com-mart-pos-device-key')).toBeNull()
  })

  it('prints the shift report on receipt paper', async () => {
    button(t('shifts.confirmClose')).click()
    await settle()
    button(t('common.print')).click()
    expect(printed.elements).toHaveLength(1)
    expect(printed.elements[0].id).toBe('pos-shift-report')
  })
})
