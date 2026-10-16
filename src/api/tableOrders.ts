import { del, get, getPaged, post, put, type PageQuery } from './http'
import type { DiningTable, PublicTableOrder, TableBoardEntry, TableMenu, TableOrder } from '@/types/domain'

// ---- Tables (Settings > Tables & QR) ----------------------------------------
export const listDiningTables = (branchId: number) => get<DiningTable[]>('/dining-tables', { branchId })
export interface DiningTableInput {
  branchId: number
  name: string
  active: boolean
  rotateToken?: boolean
}
export const createDiningTable = (t: DiningTableInput) => post<DiningTable>('/dining-tables', t)
export const createDiningTablesBulk = (b: { branchId: number; prefix: string; from: number; to: number }) =>
  post<{ created: number }>('/dining-tables/bulk', b)
export const updateDiningTable = (id: number, t: DiningTableInput) => put<DiningTable>(`/dining-tables/${id}`, t)
export const deleteDiningTable = (id: number) => del(`/dining-tables/${id}`)

// ---- Orders (POS) -------------------------------------------------------------
export const getTableBoard = (branchId: number) => get<TableBoardEntry[]>('/table-board', { branchId }, { silent: true })
export interface TableOrderCounts {
  newOrders: number
  openOrders: number
}
// status: 'open' (NEW + ACCEPTED, oldest first), 'all', or one status.
export const pageTableOrders = (branchId: number, q: PageQuery & { status?: string }, silent = false) =>
  getPaged<TableOrder[], TableOrderCounts>('/table-orders', { branchId, ...q }, { silent })
export const acceptTableOrder = (id: number) => post<TableOrder>(`/table-orders/${id}/accept`)
export const cancelTableOrder = (id: number, reason: string) => post<TableOrder>(`/table-orders/${id}/cancel`, { reason })
// Moves open orders to another table in the same branch (the party changed seats).
export const moveTableOrders = (orderIds: number[], toTableId: number) =>
  post<{ moved: number; toTableId: number; toTableName: string }>('/table-orders/move', { orderIds, toTableId })

// ---- Public (the customer's phone; no sign-in) --------------------------------
export const getTableMenu = (token: string) => get<TableMenu>(`/public/tables/${token}/menu`, undefined, { silent: true })
export const placeTableOrder = (token: string, body: { items: { productId: number; qty: number; note: string }[]; note: string }) =>
  post<PublicTableOrder>(`/public/tables/${token}/orders`, body, undefined, { silent: true })
export const getPublicTableOrder = (orderToken: string) =>
  get<PublicTableOrder>(`/public/table-orders/${orderToken}`, undefined, { silent: true })
