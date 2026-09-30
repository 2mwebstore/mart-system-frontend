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
export const pageSales = (branchId: number, q: PageQuery & { q?: string; status?: string | null; dateFrom?: string | null; dateTo?: string | null }) =>
  getPaged<Sale[]>('/sales', { branchId, ...q })
export const getSale = (branchId: number, id: number) => get<Sale>(`/sales/${id}`, { branchId })
// Corrects a still-open-shift sale's items/quantities only — see
// docs/DECISIONS.md for why payment and discounts are deliberately not
// editable here (use Void + re-ring for anything bigger than a qty fix).
export const editSale = (id: number, items: { productId: number; qty: number; note: string }[]) => put<Sale>(`/sales/${id}`, { items })
export const voidSale = (id: number, reason: string) => post<Sale>(`/sales/${id}/void`, { reason })
