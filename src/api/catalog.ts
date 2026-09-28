import { del, get, getPaged, post, put, type PageQuery } from './http'
import type { Category, Product, ProductInput, PurchaseOrder, PurchaseOrderInput, StockMovement, Supplier } from '@/types/domain'

// list* fetch everything (pickers, the POS grid); page* fetch one server page
// for a table, with the server-side filters each list supports.
export const listCategories = () => get<Category[]>('/categories')
export const pageCategories = (q: PageQuery & { q?: string }) => getPaged<Category[]>('/categories', { ...q })
export const createCategory = (c: { nameEn: string; nameKm: string }) => post<Category>('/categories', c)
export const updateCategory = (id: number, c: { nameEn: string; nameKm: string }) => put<Category>(`/categories/${id}`, c)
export const deleteCategory = (id: number) => del(`/categories/${id}`)

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
export const pageProducts = (branchId: number, q: PageQuery & { q?: string; categoryId?: number | null; status?: string | null }) =>
  getPaged<Product[], ProductSummary>('/products', { branchId, ...q })
export const createProduct = (branchId: number, p: ProductInput) => post<Product>('/products', p, { branchId })
export const updateProduct = (branchId: number, id: number, p: ProductInput) => put<Product>(`/products/${id}`, p, { branchId })
export const deleteProduct = (branchId: number, id: number) => del(`/products/${id}`, { branchId })

export const pageStockMovements = (branchId: number, q: PageQuery & { q?: string; type?: string | null; productId?: number | null; dateFrom?: string | null; dateTo?: string | null }) =>
  getPaged<StockMovement[]>('/stock-movements', { branchId, ...q })

export const pagePurchaseOrders = (branchId: number, q: PageQuery & { q?: string; status?: string | null; supplierId?: number | null; dateFrom?: string | null; dateTo?: string | null }) =>
  getPaged<PurchaseOrder[], { openOrders: number }>('/purchase-orders', { branchId, ...q })
export const createPurchaseOrder = (po: PurchaseOrderInput) => post<PurchaseOrder>('/purchase-orders', po)
export const updatePurchaseOrder = (id: number, po: PurchaseOrderInput) => put<PurchaseOrder>(`/purchase-orders/${id}`, po)
export const deletePurchaseOrder = (id: number) => del(`/purchase-orders/${id}`)
export const receivePurchaseOrder = (id: number) => post<PurchaseOrder>(`/purchase-orders/${id}/receive`)
