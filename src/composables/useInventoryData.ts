import { computed, onMounted, reactive, ref, type Ref } from 'vue'
import * as catalogApi from '@/api/catalog'
import type { Category, Product, ProductInput, PurchaseOrder, PurchaseOrderInput, Supplier } from '@/types/domain'
import { initialsOf } from '@/utils/format'
import { useDebounced, usePagedList } from '@/composables/usePagedList'

export type StockStatus = 'in_stock' | 'low' | 'out'

export function stockStatusOf(qty: number, reorderPoint: number): StockStatus {
  if (qty <= 0) return 'out'
  if (qty <= reorderPoint) return 'low'
  return 'in_stock'
}

// Inventory screen state, loaded from and written to the API. Each tab's table
// is one server page (products also filter server-side); categories and
// suppliers are additionally loaded whole because forms and filters pick from
// them. Every write helper resolves to true on success and false on failure
// (the API client has already shown the reason in a toast), so callers can
// decide whether to close their modal.
export function useInventoryData(branchId: Ref<number>) {
  const search = ref('')
  const categoryFilter = ref<number | 'all'>('all')
  const statusFilter = ref<'all' | StockStatus>('all')
  const debouncedSearch = useDebounced(search)
  // Stock moves filters. A null range means "all dates".
  type DateRange = { from: string; to: string } | null
  const moveType = ref<'all' | string>('all')
  const moveProduct = ref<'all' | number>('all')
  const moveRange = ref<DateRange>(null)
  // Purchase-order filter (by created date).
  const poRange = ref<DateRange>(null)

  // Whole lists used as pickers.
  const categories = ref<Category[]>([])
  const suppliers = ref<Supplier[]>([])
  // Every product, for the purchase-order picker — fetched on demand (when a
  // PO form opens), not on page load.
  const products = ref<Product[]>([])

  const productList = reactive(
    usePagedList(
      ({ page, perPage }) =>
        catalogApi.pageProducts(branchId.value, {
          page,
          perPage,
          q: debouncedSearch.value.trim(),
          categoryId: categoryFilter.value === 'all' ? null : categoryFilter.value,
          status: statusFilter.value === 'all' ? null : statusFilter.value,
        }),
      { deps: [branchId, debouncedSearch, categoryFilter, statusFilter] },
    ),
  )
  const categoryList = reactive(usePagedList(({ page, perPage }) => catalogApi.pageCategories({ page, perPage })))
  const supplierList = reactive(usePagedList(({ page, perPage }) => catalogApi.pageSuppliers({ page, perPage })))
  const moveList = reactive(
    usePagedList(
      ({ page, perPage }) =>
        catalogApi.pageStockMovements(branchId.value, {
          page,
          perPage,
          type: moveType.value === 'all' ? null : moveType.value,
          productId: moveProduct.value === 'all' ? null : moveProduct.value,
          dateFrom: moveRange.value?.from,
          dateTo: moveRange.value?.to,
        }),
      { deps: [branchId, moveType, moveProduct, moveRange] },
    ),
  )
  const poList = reactive(
    usePagedList(
      ({ page, perPage }) =>
        catalogApi.pagePurchaseOrders(branchId.value, { page, perPage, dateFrom: poRange.value?.from, dateTo: poRange.value?.to }),
      { deps: [branchId, poRange] },
    ),
  )
  const loading = computed(() => productList.loading)

  const loadCategories = async () => void (categories.value = await catalogApi.listCategories())
  const loadSuppliers = async () => void (suppliers.value = await catalogApi.listSuppliers())
  const loadAllProducts = async () => void (products.value = await catalogApi.listProducts(branchId.value))
  onMounted(() => void Promise.all([loadCategories(), loadSuppliers()]).catch(() => {}))

  const productSummary = computed(() => productList.summary)
  const refreshProducts = () => productList.reload()

  async function attempt(fn: () => Promise<unknown>, refresh: (() => Promise<unknown>)[]): Promise<boolean> {
    try {
      await fn()
      await Promise.all(refresh.map((r) => r()))
      return true
    } catch {
      return false
    }
  }

  // --- Categories ------------------------------------------------------------
  const saveCategory = (data: { nameEn: string; nameKm: string }, id: number | null) =>
    attempt(() => (id === null ? catalogApi.createCategory(data) : catalogApi.updateCategory(id, data)), [loadCategories, categoryList.reload])
  const removeCategory = (id: number) =>
    attempt(() => catalogApi.deleteCategory(id), [loadCategories, categoryList.reload, refreshProducts])

  // --- Suppliers ---------------------------------------------------------------
  const saveSupplier = (data: catalogApi.SupplierInput, id: number | null) =>
    attempt(() => (id === null ? catalogApi.createSupplier(data) : catalogApi.updateSupplier(id, data)), [loadSuppliers, supplierList.reload])
  const removeSupplier = (id: number) =>
    attempt(() => catalogApi.deleteSupplier(id), [loadSuppliers, supplierList.reload, refreshProducts])

  // --- Products ------------------------------------------------------------------
  const saveProduct = (data: ProductInput, id: number | null) =>
    attempt(
      () => (id === null ? catalogApi.createProduct(branchId.value, data) : catalogApi.updateProduct(branchId.value, id, data)),
      [refreshProducts, loadCategories, categoryList.reload, supplierList.reload],
    )
  const removeProduct = (id: number) =>
    attempt(() => catalogApi.deleteProduct(branchId.value, id), [refreshProducts, loadCategories, categoryList.reload, supplierList.reload])

  // --- Purchase orders -------------------------------------------------------------
  const savePurchaseOrder = (data: PurchaseOrderInput, id: number | null) =>
    attempt(() => (id === null ? catalogApi.createPurchaseOrder(data) : catalogApi.updatePurchaseOrder(id, data)), [poList.reload])
  const removePurchaseOrder = (id: number) => attempt(() => catalogApi.deletePurchaseOrder(id), [poList.reload])
  const receivePurchaseOrder = (id: number) =>
    attempt(() => catalogApi.receivePurchaseOrder(id), [poList.reload, refreshProducts, moveList.reload])

  function poItemsCostCents(po: PurchaseOrder) {
    return po.items.reduce((sum, i) => sum + i.qtyOrdered * i.unitCostCents, 0)
  }
  // Items plus shipping — the actual total cost of the order.
  function poTotalCostCents(po: PurchaseOrder) {
    return poItemsCostCents(po) + po.shippingCents
  }
  function poItemCount(po: PurchaseOrder) {
    return po.items.reduce((sum, i) => sum + i.qtyOrdered, 0)
  }
  const rows = computed(() =>
    productList.rows.map((p) => ({
      ...p,
      imageInitials: initialsOf(p.nameEn),
      marginPct: p.priceCents > 0 ? Math.round(((p.priceCents - p.costCents) / p.priceCents) * 100) : 0,
      status: stockStatusOf(p.qty, p.reorderPoint),
    })),
  )

  const summary = computed(() => ({
    stockValueCents: productSummary.value?.stockValueCents ?? 0,
    activeProducts: productSummary.value?.activeProducts ?? 0,
    belowReorder: productSummary.value?.belowReorder ?? 0,
    outOfStock: productSummary.value?.outOfStock ?? 0,
    openPurchaseOrders: poList.summary?.openOrders ?? 0,
  }))

  return {
    loading,
    search,
    categoryFilter,
    statusFilter,
    moveType,
    moveProduct,
    moveRange,
    poRange,
    rows,
    summary,
    productList,
    categories,
    categoryList,
    saveCategory,
    removeCategory,
    products,
    loadAllProducts,
    saveProduct,
    removeProduct,
    suppliers,
    supplierList,
    saveSupplier,
    removeSupplier,
    moveList,
    poList,
    poItemsCostCents,
    poTotalCostCents,
    poItemCount,
    savePurchaseOrder,
    removePurchaseOrder,
    receivePurchaseOrder,
  }
}
