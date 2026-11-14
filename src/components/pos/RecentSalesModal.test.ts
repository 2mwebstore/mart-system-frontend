import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, t } from '@/i18n'
import type { Sale, Shift } from '@/types/domain'
import { useAuthStore } from '@/stores/auth'
import { useShiftStore } from '@/stores/shift'
import { useSettingsStore } from '@/stores/settings'
import RecentSalesModal from './RecentSalesModal.vue'

const api = vi.hoisted(() => ({
  voided: [] as [number, string][],
  refuse: false,
  pages: 0,
  empty: false,
}))
const sale = {
  id: 41,
  receiptNo: 'INV-000041',
  status: 'PAID',
  soldAt: '2026-11-14T09:30:00+07:00',
  totalCents: 300,
  taxCents: 0,
  taxName: '',
  items: [{ qty: 2 }],
  payment: { method: 'CASH' },
} as unknown as Sale
vi.mock('@/api/pos', () => ({
  pageShiftSales: async () => {
    api.pages++
    if (api.empty) return { data: [], meta: { page: 1, perPage: 8, total: 0, totalPages: 0, summary: undefined } }
    return { data: [sale], meta: { page: 1, perPage: 8, total: 1, totalPages: 1, summary: undefined } }
  },
  voidSale: async (id: number, reason: string) => {
    if (api.refuse) throw new Error('refused')
    api.voided.push([id, reason])
    return sale
  },
  getCurrentShift: async () => ({ id: 7, branchId: 1 }),
}))

let app: App | null = null
let host: HTMLElement
let voidedEvents = 0

async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

async function open(permissions = ['pos.void'], shiftMode: 'REQUIRED' | 'SKIP' = 'REQUIRED') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({ permissions })
  const settings = useSettingsStore()
  settings.app = { ...settings.app, shiftMode }
  const shift = useShiftStore()
  shift.shift = { id: 7, branchId: 1 } as Shift
  shift.deviceKey = 'TK-1'
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(RecentSalesModal, { onVoided: () => voidedEvents++ }) }).use(pinia).use(i18n)
  app.mount(host)
  await settle()
}

beforeEach(() => {
  api.voided = []
  api.refuse = false
  api.pages = 0
  api.empty = false
  voidedEvents = 0
  vi.spyOn(window, 'prompt')
})
afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const voidButton = () => host.querySelector<HTMLButtonElement>(`[aria-label="${t('pos.voidSaleAria')}"]`)
const confirmDialog = () => document.querySelector('[data-confirm-dialog]')?.closest('[role="dialog"]') ?? null
const dialogButton = (text: string) => [...confirmDialog()!.querySelectorAll<HTMLButtonElement>('form button')].find((b) => b.textContent?.trim() === text)!
function giveReason(text: string) {
  const box = confirmDialog()!.querySelector<HTMLTextAreaElement>('textarea')!
  box.value = text
  box.dispatchEvent(new Event('input'))
}
async function askToVoid() {
  voidButton()!.click()
  await nextTick()
}

describe('voiding a sale from this shift’s sales', () => {
  it('asks in a popup, with the reason, then voids it', async () => {
    await open()
    await askToVoid()
    expect(window.prompt).not.toHaveBeenCalled()
    expect(confirmDialog()!.getAttribute('aria-label')).toBe('Void INV-000041?')
    expect(confirmDialog()!.textContent).toContain(t('pos.voidMessage'))
    expect(api.voided).toEqual([])

    giveReason('wrong item')
    dialogButton(t('pos.voidSaleAria')).click()
    await settle()
    expect(api.voided).toEqual([[41, 'wrong item']])
    expect(confirmDialog()).toBeNull()
    expect(voidedEvents).toBe(1)
    expect(api.pages).toBe(2) // the list reloaded
  })

  it('says no reason was given when the box is left empty', async () => {
    await open()
    await askToVoid()
    dialogButton(t('pos.voidSaleAria')).click()
    await settle()
    expect(api.voided).toEqual([[41, t('pos.noReason')]])
  })

  it('voids nothing on Cancel', async () => {
    await open()
    await askToVoid()
    dialogButton(t('common.cancel')).click()
    await settle()
    expect(confirmDialog()).toBeNull()
    expect(api.voided).toEqual([])
    expect(voidedEvents).toBe(0)
  })

  it('stays open to try again when the server refuses', async () => {
    await open()
    await askToVoid()
    api.refuse = true
    dialogButton(t('pos.voidSaleAria')).click()
    await settle()
    expect(confirmDialog()).not.toBeNull()
    expect(dialogButton(t('pos.voidSaleAria')).disabled).toBe(false)
    expect(voidedEvents).toBe(0)
  })

  it('offers no void to a cashier who may not void', async () => {
    await open([])
    expect(host.textContent).toContain('INV-000041')
    expect(voidButton()).toBeNull()
  })
})

describe('the title', () => {
  it("is this shift's sales, or the till's for a company without shifts", async () => {
    await open()
    expect(document.body.textContent).toContain(t('pos.salesThisShift'))
    app?.unmount()
    document.body.innerHTML = ''
    await open(['pos.void'], 'SKIP')
    expect(document.body.textContent).toContain(t('pos.salesThisTill'))
    expect(document.body.textContent).not.toContain(t('pos.salesThisShift'))
  })

  it("says no sale yet on the shift, or on the till for a company without shifts", async () => {
    api.empty = true
    await open()
    expect(host.ownerDocument.querySelector('[data-no-sales]')!.textContent!.trim()).toBe(t('pos.noSalesYet'))
    app?.unmount()
    document.body.innerHTML = ''
    await open(['pos.void'], 'SKIP')
    expect(host.ownerDocument.querySelector('[data-no-sales]')!.textContent!.trim()).toBe(t('pos.noSalesYetTill'))
  })
})
