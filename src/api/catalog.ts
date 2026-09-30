import { del, get, getPaged, post, put, uploadFile, type PageQuery, type RequestOptions } from './http'
import type { Category, Product, ProductInput, PurchaseOrder, PurchaseOrderInput, StockMovement, Supplier } from '@/types/domain'

// The result of a CSV import: how many rows were created, and why each
// skipped row was skipped (1-based, matching the row's line in the file
// including the header, so row 2 is the first data row).
export interface ImportResult {
  created: number
  skipped: { row: number; reason: string }[]
}

// list* fetch everything (pickers, the POS grid); page* fetch one server page
// for a table, with the server-side filters each list supports.
export const listCategories = () => get<Category[]>('/categories')
export const pageCategories = (q: PageQuery & { q?: string }) => getPaged<Category[]>('/categories', { ...q })
export const createCategory = (c: { nameEn: string; nameKm: string }) => post<Category>('/categories', c)
export const updateCategory = (id: number, c: { nameEn: string; nameKm: string }) => put<Category>(`/categories/${id}`, c)
export const deleteCategory = (id: number, opts?: RequestOptions) => del(`/categories/${id}`, undefined, opts)
export const importCategories = (file: File) => uploadFile<ImportResult>('/categories/import', file)

export type SupplierInput = Omit<Supplier, 'id' | 'productCount'>
export const listSuppliers = () => get<Supplier[]>('/suppliers')
export const pageSuppliers = (q: PageQuery & { q?: string }) => getPaged<Supplier[]>('/suppliers', { ...q })
export const createSupplier = (s: SupplierInput) => post<Supplier>('/suppliers', s)
export const updateSupplier = (id: number, s: SupplierInput) => put<Supplier>(`/suppliers/${id}`, s)
export const deleteSupplier = (id: number) => del(`/suppliers/${id}`)

export const listProducts = (branchId: number) => get<Product[]>('/products', { branchId })
export interface ProductSummary {
  stockValueCents: number
  activeProducts: number
  belowReorder: number
  outOfStock: number
}
export const pageProducts = (
  branchId: number,
  q: PageQuery & { q?: string; categoryId?: number | null; status?: string | null; type?: string | null },
) => getPaged<Product[], ProductSummary>('/products', { branchId, ...q })
export const createProduct = (branchId: number, p: ProductInput) => post<Product>('/products', p, { branchId })
export const updateProduct = (branchId: number, id: number, p: ProductInput) => put<Product>(`/products/${id}`, p, { branchId })
export const deleteProduct = (branchId: number, id: number, opts?: RequestOptions) => del(`/products/${id}`, { branchId }, opts)
export const importProducts = (file: File) => uploadFile<ImportResult>('/products/import', file)

export const pageStockMovements = (branchId: number, q: PageQuery & { q?: string; type?: string | null; productId?: number | null; dateFrom?: string | null; dateTo?: string | null }) =>
  getPaged<StockMovement[]>('/stock-movements', { branchId, ...q })

export interface PurchaseOrderSummary {
  openOrders: number // branch-wide, ignores this call's filters — see backend
  totalOrders: number
  receivedOrders: number
  totalCostCents: number
}
export const pagePurchaseOrders = (branchId: number, q: PageQuery & { q?: string; status?: string | null; supplierId?: number | null; dateFrom?: string | null; dateTo?: string | null }) =>
  getPaged<PurchaseOrder[], PurchaseOrderSummary>('/purchase-orders', { branchId, ...q })
export const createPurchaseOrder = (po: PurchaseOrderInput) => post<PurchaseOrder>('/purchase-orders', po)
export const updatePurchaseOrder = (id: number, po: PurchaseOrderInput) => put<PurchaseOrder>(`/purchase-orders/${id}`, po)
export const deletePurchaseOrder = (id: number) => del(`/purchase-orders/${id}`)
export const receivePurchaseOrder = (id: number) => post<PurchaseOrder>(`/purchase-orders/${id}/receive`)
