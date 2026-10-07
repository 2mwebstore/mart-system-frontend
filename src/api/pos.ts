import { get, getPaged, post, put, type PageQuery } from './http'
import type { CreateSaleInput, Sale, Shift } from '@/types/domain'

// ---- Shifts ---------------------------------------------------------------
export const getCurrentShift = (deviceKey: string) => get<Shift | null>('/shifts/current', { deviceKey })
export const openShift = (input: { deviceKey: string; openingUsdCents: number; openingKhrRiel: number }) => post<Shift>('/shifts/open', input)
export const closeShift = (id: number, input: { countedUsdCents: number; countedKhrRiel: number; note?: string }) => post<Shift>(`/shifts/${id}/close`, input)
export const addCashMovement = (
  shiftId: number,
  input: { type: 'PAYOUT' | 'PAYIN'; amountUsdCents: number; amountKhrRiel: number; reason: string },
) => post<Shift>(`/shifts/${shiftId}/cash-movements`, input)
export const pageShifts = (
  branchId: number,
  q: PageQuery & { status?: string | null; deviceKey?: string | null; userId?: number | null; dateFrom?: string | null; dateTo?: string | null },
) => getPaged<Shift[], { cashiers: { id: number; name: string }[] }>('/shifts', { branchId, ...q })

// ---- Sales ------------------------------------------------------------------
export const createSale = (input: CreateSaleInput) => post<Sale>('/sales', input)
export const pageShiftSales = (branchId: number, shiftId: number, q: PageQuery) => getPaged<Sale[]>('/sales', { branchId, shiftId, ...q })
// Branch-wide sales history (Inventory's Sales tab) — same endpoint, without
// shift_id, so it takes a date range and a receipt-no search instead.
// branchId 'all' = every branch the caller can access (backend scopes it).
export const pageSales = (branchId: number | 'all', q: PageQuery & { q?: string; status?: string | null; dateFrom?: string | null; dateTo?: string | null }) =>
  getPaged<Sale[]>('/sales', { branchId, ...q })
export const getSale = (branchId: number, id: number) => get<Sale>(`/sales/${id}`, { branchId })
// Edits a still-open-shift paid sale. The body is the sale's full desired
// state (lines with discounts and notes, the cart discount, and the payment);
// the server re-prices it and returns the authoritative sale. See
// docs/DECISIONS.md for the scope and the permission rules.
export interface EditSaleInput {
  items: { productId: number; qty: number; discountCents: number; note: string }[]
  discountCents: number
  payment: { method: 'CASH' | 'KHQR' | 'CARD'; receivedUsdCents: number; receivedKhrRiel: number; reference: string }
}
export const editSale = (id: number, input: EditSaleInput) => put<Sale>(`/sales/${id}`, input)
export const voidSale = (id: number, reason: string) => post<Sale>(`/sales/${id}/void`, { reason })
