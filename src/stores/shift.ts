import { defineStore } from 'pinia'
import * as posApi from '@/api/pos'
import type { CreateSaleInput, Sale, Shift } from '@/types/domain'

// The till's shift and its sales live on the server (see backend
// internal/handlers/shifts.go + sales.go): opening float, cash movements, the
// expected-drawer maths and the Balanced/Short/Over result are all decided
// there, so a reload, a second browser, or the admin Shifts page all see the
// same shift. The only thing kept in this browser is *held* carts — a parked
// cart isn't a sale yet, so it isn't a server record; it's persisted to
// localStorage (per till) so a reload doesn't lose it.

export interface HeldItem {
  productId: number
  nameEn: string
  nameKm?: string
  sku: string
  qty: number
  unitPriceCents: number
  discountType?: 'percent' | 'amount'
  discountValue?: number
}

export interface HeldSale {
  id: number
  heldAt: string
  label: string
  items: HeldItem[]
  discountType: 'percent' | 'amount'
  discountValue: number
  customerId: number | null
}

const heldKey = (deviceKey: string) => `com-mart-pos-held-${deviceKey}`

function loadHeld(deviceKey: string): HeldSale[] {
  try {
    const raw = localStorage.getItem(heldKey(deviceKey))
    return raw ? (JSON.parse(raw) as HeldSale[]) : []
  } catch {
    return []
  }
}

export const useShiftStore = defineStore('shift', {
  state: () => ({
    deviceKey: '',
    shift: null as Shift | null,
    heldSales: [] as HeldSale[],
    loaded: false,
  }),

  getters: {
    isOpen: (state) => state.shift?.status === 'OPEN',
    branchId: (state) => state.shift?.branchId ?? 0,
  },

  actions: {
    // Loads the till's current shift from the server. The shift's sales list is
    // fetched a page at a time by the Sales modal, not held here.
    async refresh(deviceKey: string) {
      if (this.deviceKey !== deviceKey) {
        this.deviceKey = deviceKey
        this.heldSales = loadHeld(deviceKey)
        this.shift = null
      }
      this.shift = await posApi.getCurrentShift(deviceKey)
      this.loaded = true
    },

    async openShift(usdCents: number, khrRiel: number) {
      this.shift = await posApi.openShift({ deviceKey: this.deviceKey, openingUsdCents: usdCents, openingKhrRiel: khrRiel })
      this.heldSales = []
      this._persistHeld()
    },

    async addCashMovement(type: 'PAYOUT' | 'PAYIN', usdCents: number, khrRiel: number, reason: string) {
      if (!this.shift) return
      this.shift = await posApi.addCashMovement(this.shift.id, { type, amountUsdCents: usdCents, amountKhrRiel: khrRiel, reason })
    },

    // Rings up a sale on the server and returns it as stored (real receipt
    // number, prices, change). Refreshes the shift totals afterwards.
    async recordSale(input: CreateSaleInput): Promise<Sale> {
      const sale = await posApi.createSale(input)
      await this.refresh(this.deviceKey)
      return sale
    },

    async voidSale(id: number, reason: string) {
      await posApi.voidSale(id, reason)
      await this.refresh(this.deviceKey)
    },

    async closeShift(countedUsdCents: number, countedKhrRiel: number): Promise<Shift> {
      if (!this.shift) throw new Error('No open shift')
      const closed = await posApi.closeShift(this.shift.id, { countedUsdCents, countedKhrRiel })
      this.shift = null
      this.heldSales = []
      this._persistHeld()
      return closed
    },

    // ---- Held carts (browser-local) ---------------------------------------
    _persistHeld() {
      if (this.deviceKey) localStorage.setItem(heldKey(this.deviceKey), JSON.stringify(this.heldSales))
    },
    holdSale(hold: Omit<HeldSale, 'id' | 'heldAt'>) {
      const id = Math.max(0, ...this.heldSales.map((h) => h.id)) + 1
      this.heldSales.unshift({ id, heldAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), ...hold })
      this._persistHeld()
    },
    resumeHeldSale(id: number): HeldSale | undefined {
      const idx = this.heldSales.findIndex((h) => h.id === id)
      if (idx === -1) return undefined
      const [held] = this.heldSales.splice(idx, 1)
      this._persistHeld()
      return held
    },
    discardHeldSale(id: number) {
      const idx = this.heldSales.findIndex((h) => h.id === id)
      if (idx !== -1) this.heldSales.splice(idx, 1)
      this._persistHeld()
    },
  },
})
