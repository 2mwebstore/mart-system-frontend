<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { listProducts, type ImportResult } from '@/api/catalog'
import * as posApi from '@/api/pos'
import { Download, Eye, Package, PackagePlus, Pencil, Plus, Upload, X } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useInventoryData } from '@/composables/useInventoryData'
import { useDebounced, usePagedList } from '@/composables/usePagedList'
import { formatDateTime, formatKHR, formatUSD } from '@/utils/format'
import { PRODUCT_TYPES, type Category, type Product, type ProductType, type PurchaseOrder, type Sale, type Supplier } from '@/types/domain'
import Tabs from '@/components/Tabs.vue'
import Modal from '@/components/Modal.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import Pagination from '@/components/Pagination.vue'
import DateRangePicker from '@/components/DateRangePicker.vue'
import SearchAddInput from '@/components/SearchAddInput.vue'
import { useToast } from '@/composables/useToast'
import { categoryName, label, localName, t } from '@/i18n'

const auth = useAuthStore()
const toast = useToast()
const branchId = computed(() => auth.activeBranchId ?? auth.branches[0]?.id ?? 1)

const canCatalog = auth.hasPermission('inventory.adjust') || auth.hasPermission('inventory.edit_price')
// Products split into their own create/edit permissions (categories and
// suppliers still just use canCatalog above).
const canCreateProduct = auth.hasPermission('inventory.product_create')
const canEditProduct = auth.hasPermission('inventory.product_edit')
const canPo = auth.hasPermission('inventory.purchase_order')
const canReceive = auth.hasPermission('inventory.receive')

const {
  search,
  categoryFilter,
  statusFilter,
  typeFilter,
  categorySearch,
  supplierSearch,
  moveType,
  moveProduct,
  moveRange,
  poRange,
  poSupplierFilter,
  rows,
  summary,
  productList,
  categories,
  categoryList,
  saveCategory,
  removeCategory,
  removeCategories,
  products,
  loadAllProducts,
  saveProduct,
  removeProduct,
  removeProducts,
  importCategoriesFile,
  importProductsFile,
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
} = useInventoryData(branchId)

const activeTab = ref('products')
const tabs = computed(() => [
  { key: 'products', label: t('inventory.tabProducts') },
  { key: 'categories', label: t('inventory.tabCategories') },
  { key: 'moves', label: t('inventory.tabMoves') },
  { key: 'po', label: t('inventory.tabPo') },
  { key: 'sales', label: t('inventory.tabSales') },
  { key: 'suppliers', label: t('inventory.tabSuppliers') },
])

const categoryOptions = computed(() => categories.value.map((c) => ({ value: c.id, label: localName(c.nameEn, c.nameKm) })))
const categoryFilterOptions = computed(() => [{ value: 'all', label: t('inventory.allCategories') }, ...categoryOptions.value])
const statusFilterOptions = computed(() => [
  { value: 'all', label: t('inventory.allStatuses') },
  { value: 'in_stock', label: t('stockStatus.in_stock') },
  { value: 'low', label: t('stockStatus.low') },
  { value: 'out', label: t('stockStatus.out') },
])
const typeFilterOptions = computed(() => [
  { value: 'all', label: t('inventory.allTypes') },
  ...PRODUCT_TYPES.map((v) => ({ value: v, label: label('productType', v) })),
])
const moveTypeOptions = computed(() => [
  { value: 'all', label: t('inventory.allTypes') },
  ...['SALE', 'RECEIVE', 'REFUND_RETURN', 'COUNT_ADJUST', 'DAMAGE', 'WRITE_OFF', 'TRANSFER_IN', 'TRANSFER_OUT'].map((v) => ({ value: v, label: label('moveType', v) })),
])
// Every STANDARD product (inactive ones too — they still have history) for
// the Stock moves product filter; loaded the first time that tab opens. A
// SERVICE product never has a stock movement, so it's left out.
const moveProductOptions = computed(() => [
  { value: 'all', label: t('inventory.allProducts') },
  ...products.value
    .filter((p) => p.productType !== 'SERVICE')
    .map((p) => ({ value: p.id, label: localName(p.nameEn, p.nameKm), sub: [p.sku, p.nameEn, p.nameKm].filter(Boolean).join(' · ') })),
])
watch(activeTab, (tab) => {
  if (tab === 'moves' && products.value.length === 0) void loadAllProducts()
})
const supplierOptions = computed(() => suppliers.value.map((s) => ({ value: s.id, label: s.name, sub: s.phone })))
const poSupplierFilterOptions = computed(() => [{ value: 'all', label: t('inventory.allSuppliers') }, ...supplierOptions.value])
const branchOptions = computed(() => auth.branches.map((b) => ({ value: b.id, label: b.name, sub: b.code })))
// A purchase order orders stock, so only STANDARD products are offered here.
const productOptions = computed(() =>
  products.value
    .filter((p) => p.active && p.productType !== 'SERVICE')
    .map((p) => ({ value: p.id, label: localName(p.nameEn, p.nameKm), sub: [p.sku, p.nameEn, p.nameKm].filter(Boolean).join(' · ') })),
)
// RECEIVED is reached only through the Receive action (it moves stock), so
// it isn't offered as a status to pick by hand.
const poStatusOptions = computed(() => ['DRAFT', 'SENT', 'PARTIAL', 'CANCELLED'].map((v) => ({ value: v, label: label('poStatus', v) })))

const statusTone: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  in_stock: 'success',
  low: 'warning',
  out: 'danger',
  service: 'neutral',
}

const poStatusTone: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  RECEIVED: 'success',
  PARTIAL: 'warning',
  SENT: 'neutral',
  DRAFT: 'neutral',
  CANCELLED: 'danger',
}

const saleStatusTone: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID: 'success',
  VOIDED: 'danger',
  REFUNDED: 'warning',
  PARTIAL_REFUND: 'warning',
}
function poCanReceive(po: PurchaseOrder) {
  return canReceive && po.status !== 'RECEIVED' && po.status !== 'CANCELLED'
}

async function exportCsv() {
  // The table only holds one page, so the export fetches the whole catalog.
  let all: Product[]
  try {
    all = await listProducts(branchId.value)
  } catch {
    return
  }
  const header = ['sku', 'product', 'parentSku', 'variantName', 'categoryId', 'category', 'type', 'cost', 'price', 'stock', 'reorder'].map((k) =>
    t(`inventory.csvHeader.${k}`),
  )
  const byId = new Map(all.map((p) => [p.id, p]))
  const lines = all.map((p) =>
    [
      p.sku,
      p.nameEn,
      p.parentProductId ? (byId.get(p.parentProductId)?.sku ?? '') : '',
      p.variantName,
      p.categoryId ?? '',
      p.categoryName ?? '',
      label('productType', p.productType),
      (p.costCents / 100).toFixed(2),
      (p.priceCents / 100).toFixed(2),
      p.productType === 'SERVICE' ? '—' : p.qty,
      p.productType === 'SERVICE' ? '—' : p.reorderPoint,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  )
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `inventory-${new Date().toLocaleDateString('en-CA')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  toast.success(t('inventory.exported'))
}

function exportCategoriesCsv() {
  const header = ['id', 'nameEn', 'nameKm', 'products'].map((k) => t(`inventory.csvHeader.${k}`))
  const lines = categories.value.map((c) => [c.id, c.nameEn, c.nameKm, c.productCount])
  downloadCsv(`categories-${new Date().toLocaleDateString('en-CA')}.csv`, [header, ...lines.map((r) => r.map(String))])
  toast.success(t('inventory.exported'))
}

// A CSV blob download, shared by the export above and the two sample
// templates below.
function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// --- Import (categories & products) ------------------------------------------
// A tiny modal: pick a CSV, see what it matched to and what it skipped. The
// "download sample" link is pure frontend — a one-row CSV with the exact
// headers the backend matches (case-insensitively, any column order).

type ImportKind = 'categories' | 'products'
const showImportModal = ref(false)
const importKind = ref<ImportKind>('products')
const importFile = ref<File | null>(null)
const importing = ref(false)
const importResult = ref<ImportResult | null>(null)

function openImport(kind: ImportKind) {
  importKind.value = kind
  importFile.value = null
  importResult.value = null
  showImportModal.value = true
}
function onImportFileChange(e: Event) {
  importFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
  importResult.value = null
}
function downloadImportSample() {
  if (importKind.value === 'categories') {
    downloadCsv('categories-sample.csv', [
      ['name_en', 'name_km'],
      ['Snacks', 'អាហារសម្រន់'],
    ])
  } else {
    downloadCsv('products-sample.csv', [
      ['name_en', 'name_km', 'barcode', 'category_id', 'category', 'unit', 'type', 'cost', 'price', 'reorder_point', 'active', 'parent_sku', 'variant_name'],
      ['Coca-Cola 330ml', 'កូកាកូឡា ៣៣០ម.ល.', '8850001234567', '', 'Drinks', 'can', 'standard', '0.35', '0.75', '24', 'true', '', ''],
      ['Delivery fee', 'ថ្លៃដឹកជញ្ជូន', '', '', '', '', 'service', '0', '1.00', '', 'true', '', ''],
      ['T-Shirt', '', '', '', 'Apparel', 'pcs', 'standard', '3.00', '8.00', '10', 'true', '', ''],
      ['', '', '8850009991111', '', '', 'pcs', '', '3.20', '8.00', '10', 'true', 'TSH-001', 'Red / Large'],
    ])
  }
}
async function runImport() {
  if (!importFile.value) return
  importing.value = true
  const res = await (importKind.value === 'categories' ? importCategoriesFile(importFile.value) : importProductsFile(importFile.value))
  importing.value = false
  if (!res) return // toasted by the API client
  importResult.value = res
  if (res.created > 0) toast.success(t('inventory.importCreated', { n: res.created }))
}

// --- Categories (full CRUD) -------------------------------------------------

const showCategoryModal = ref(false)
const editingCategoryId = ref<number | null>(null)
const categoryForm = reactive({ nameEn: '', nameKm: '' })

function newCategory() {
  editingCategoryId.value = null
  Object.assign(categoryForm, { nameEn: '', nameKm: '' })
  showCategoryModal.value = true
}
function editCategory(c: Category) {
  editingCategoryId.value = c.id
  Object.assign(categoryForm, { nameEn: c.nameEn, nameKm: c.nameKm })
  showCategoryModal.value = true
}
async function submitCategory() {
  const id = editingCategoryId.value
  if (await saveCategory({ ...categoryForm }, id)) {
    toast.success(id === null ? t('inventory.categoryCreated') : t('inventory.categoryUpdated'))
    showCategoryModal.value = false
  }
}
async function deleteCategory(id: number) {
  if (await removeCategory(id)) {
    toast.success(t('inventory.categoryDeleted'))
    if (selectedCategoryIds.value.has(id)) {
      const next = new Set(selectedCategoryIds.value)
      next.delete(id)
      selectedCategoryIds.value = next
    }
  }
}

// --- Bulk select & delete (Categories tab) — same pattern as Products below.
const selectedCategoryIds = ref<Set<number>>(new Set())
const allVisibleCategoriesSelected = computed(
  () => categoryList.rows.length > 0 && categoryList.rows.every((c) => selectedCategoryIds.value.has(c.id)),
)
function toggleSelectAllCategories() {
  const next = new Set(selectedCategoryIds.value)
  if (allVisibleCategoriesSelected.value) {
    for (const c of categoryList.rows) next.delete(c.id)
  } else {
    for (const c of categoryList.rows) next.add(c.id)
  }
  selectedCategoryIds.value = next
}
function toggleCategorySelected(id: number) {
  const next = new Set(selectedCategoryIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedCategoryIds.value = next
}
watch([categorySearch, () => categoryList.page], () => {
  selectedCategoryIds.value = new Set()
})

const bulkDeletingCategories = ref(false)
async function bulkDeleteCategories() {
  const ids = [...selectedCategoryIds.value]
  if (ids.length === 0) return
  bulkDeletingCategories.value = true
  const { ok, failed } = await removeCategories(ids)
  bulkDeletingCategories.value = false
  selectedCategoryIds.value = new Set()
  if (ok.length > 0) toast.success(t('inventory.bulkCategoriesDeleted', { n: ok.length }))
  if (failed.length > 0) toast.error(t('inventory.bulkCategoriesDeleteFailed', { n: failed.length }))
}

// --- Products (full CRUD, with image link/upload) ---------------------------

interface ProductForm {
  nameEn: string
  nameKm: string
  variantName: string
  barcode: string
  categoryId: number | null
  unit: string
  productType: ProductType
  costDollars: number
  priceDollars: number
  reorderPoint: number
  active: boolean
  imageUrl: string
  hideWhenOutOfStock: boolean
}

const showProductModal = ref(false)
const editingProductId = ref<number | null>(null)
// Set while creating or editing a variant — just enough to send
// parentProductId and show "inherited from <name>"; category/supplier/
// image/type themselves come from the variant row's own fields (the backend
// keeps them mirrored to the parent) or, when creating, from the parent row
// passed to newVariant.
const variantOf = ref<{ id: number; nameEn: string; nameKm: string } | null>(null)
const productForm = reactive<ProductForm>({
  nameEn: '',
  nameKm: '',
  variantName: '',
  barcode: '',
  categoryId: null,
  unit: 'pcs',
  productType: 'STANDARD',
  costDollars: 0,
  priceDollars: 0,
  reorderPoint: 10,
  active: true,
  imageUrl: '',
  hideWhenOutOfStock: false,
})
const imageMode = ref<'link' | 'upload'>('link')

function newProduct() {
  editingProductId.value = null
  variantOf.value = null
  Object.assign(productForm, {
    nameEn: '',
    nameKm: '',
    variantName: '',
    barcode: '',
    categoryId: categories.value[0]?.id ?? null,
    unit: 'pcs',
    productType: 'STANDARD',
    costDollars: 0,
    priceDollars: 0,
    reorderPoint: 10,
    active: true,
    imageUrl: '',
    hideWhenOutOfStock: false,
  })
  imageMode.value = 'link'
  showProductModal.value = true
}
// Opens the same modal pre-set to create a variant of `parent`: name/category/
// type/image come from the parent and aren't independently editable — only
// variant name, barcode, unit, price, cost, reorder point and active are.
function newVariant(parent: Product) {
  editingProductId.value = null
  variantOf.value = { id: parent.id, nameEn: parent.nameEn, nameKm: parent.nameKm }
  Object.assign(productForm, {
    nameEn: '',
    nameKm: '',
    variantName: '',
    barcode: '',
    categoryId: parent.categoryId,
    unit: parent.unit,
    productType: parent.productType,
    costDollars: parent.costCents / 100,
    priceDollars: parent.priceCents / 100,
    reorderPoint: parent.reorderPoint,
    active: true,
    imageUrl: parent.imageUrl,
    hideWhenOutOfStock: parent.hideWhenOutOfStock,
  })
  imageMode.value = 'link'
  showProductModal.value = true
}
function editProduct(p: Product) {
  editingProductId.value = p.id
  variantOf.value = p.parentProductId ? { id: p.parentProductId, nameEn: p.parentNameEn ?? '', nameKm: p.parentNameKm ?? '' } : null
  Object.assign(productForm, {
    nameEn: p.nameEn,
    nameKm: p.nameKm ?? '',
    variantName: p.variantName ?? '',
    barcode: p.barcode ?? '',
    categoryId: p.categoryId,
    unit: p.unit,
    productType: p.productType,
    costDollars: p.costCents / 100,
    priceDollars: p.priceCents / 100,
    reorderPoint: p.reorderPoint,
    active: p.active,
    imageUrl: p.imageUrl,
    hideWhenOutOfStock: p.hideWhenOutOfStock,
  })
  imageMode.value = 'link'
  showProductModal.value = true
}

// Object storage (Cloudflare R2) isn't wired up yet: an uploaded file is read
// in the browser as a data URL and saved with the product, exactly like a
// pasted link. Swap this for an upload to the backend when R2 lands — nothing
// else has to change, the product just stores whatever URL comes back.
function onImageFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 1_500_000) {
    toast.error(t('inventory.imageTooBig'))
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    productForm.imageUrl = String(reader.result)
  }
  reader.readAsDataURL(file)
}

const saving = ref(false)
async function submitProduct() {
  if (variantOf.value === null && productForm.categoryId === null) {
    toast.error(t('inventory.pickCategory'))
    return
  }
  if (variantOf.value !== null && productForm.variantName.trim() === '') {
    toast.error(t('inventory.variantNameRequired'))
    return
  }
  const id = editingProductId.value
  saving.value = true
  const ok = await saveProduct(
    {
      nameEn: productForm.nameEn,
      nameKm: productForm.nameKm.trim(),
      barcode: productForm.barcode,
      categoryId: productForm.categoryId,
      unit: productForm.unit,
      productType: productForm.productType,
      costCents: Math.round(productForm.costDollars * 100),
      priceCents: Math.round(productForm.priceDollars * 100),
      reorderPoint: Number(productForm.reorderPoint) || 0,
      active: productForm.active,
      imageUrl: productForm.imageUrl,
      parentProductId: variantOf.value?.id ?? null,
      variantName: productForm.variantName.trim(),
      hideWhenOutOfStock: productForm.hideWhenOutOfStock,
    },
    id,
  )
  saving.value = false
  if (ok) {
    toast.success(id === null ? t('inventory.productCreated') : t('inventory.productUpdated'))
    showProductModal.value = false
  }
}
async function deleteProduct(id: number) {
  if (await removeProduct(id)) {
    toast.success(t('inventory.productDeleted'))
    // In case this row was also bulk-selected — its checkbox no longer
    // exists once the row is gone, so drop it from the selection too.
    if (selectedProductIds.value.has(id)) {
      const next = new Set(selectedProductIds.value)
      next.delete(id)
      selectedProductIds.value = next
    }
  }
}

// --- Bulk select & delete (Products tab) -------------------------------------
// Selection is scoped to the current page/filters: it clears whenever any of
// them change, so a stale id from a page you've since left never lingers.
const selectedProductIds = ref<Set<number>>(new Set())
const allVisibleSelected = computed(() => rows.value.length > 0 && rows.value.every((r) => selectedProductIds.value.has(r.id)))
function toggleSelectAllProducts() {
  const next = new Set(selectedProductIds.value)
  if (allVisibleSelected.value) {
    for (const r of rows.value) next.delete(r.id)
  } else {
    for (const r of rows.value) next.add(r.id)
  }
  selectedProductIds.value = next
}
function toggleProductSelected(id: number) {
  const next = new Set(selectedProductIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedProductIds.value = next
}
watch([search, categoryFilter, typeFilter, statusFilter, () => productList.page], () => {
  selectedProductIds.value = new Set()
})

const bulkDeleting = ref(false)
async function bulkDeleteProducts() {
  const ids = [...selectedProductIds.value]
  if (ids.length === 0) return
  bulkDeleting.value = true
  const { ok, failed } = await removeProducts(ids)
  bulkDeleting.value = false
  selectedProductIds.value = new Set()
  if (ok.length > 0) toast.success(t('inventory.bulkDeleted', { n: ok.length }))
  if (failed.length > 0) toast.error(t('inventory.bulkDeleteFailed', { n: failed.length }))
}

// --- Suppliers (full CRUD) -------------------------------------------------

const showSupplierModal = ref(false)
const editingSupplierId = ref<number | null>(null)
const supplierForm = reactive({ name: '', phone: '', contact: '', paymentTerms: '' })

function newSupplier() {
  editingSupplierId.value = null
  Object.assign(supplierForm, { name: '', phone: '', contact: '', paymentTerms: '' })
  showSupplierModal.value = true
}
function editSupplier(s: Supplier) {
  editingSupplierId.value = s.id
  Object.assign(supplierForm, { name: s.name, phone: s.phone, contact: s.contact, paymentTerms: s.paymentTerms })
  showSupplierModal.value = true
}
async function submitSupplier() {
  const id = editingSupplierId.value
  if (await saveSupplier({ ...supplierForm }, id)) {
    toast.success(id === null ? t('inventory.supplierCreated') : t('inventory.supplierUpdated'))
    showSupplierModal.value = false
  }
}
async function deleteSupplier(id: number) {
  if (await removeSupplier(id)) toast.success(t('inventory.supplierDeleted'))
}

// --- Purchase orders (full CRUD, with line items) ---------------------------

interface PoFormItem {
  productId: number
  name: string
  sku: string
  qty: number
  unitCostDollars: number // form-only unit; converted to unitCostCents on submit
}

const showPoModal = ref(false)
const editingPoId = ref<number | null>(null)
const poForm = reactive<{
  supplierId: number | null
  branchId: number | null
  status: string
  note: string
  shippingDollars: number
  items: PoFormItem[]
}>({ supplierId: null, branchId: branchId.value, status: 'DRAFT', note: '', shippingDollars: 0, items: [] })

function newPo() {
  editingPoId.value = null
  Object.assign(poForm, { supplierId: null, branchId: branchId.value, status: 'DRAFT', note: '', shippingDollars: 0, items: [] })
  void loadAllProducts() // the picker searches every product, not just one page
  showPoModal.value = true
}
function editPo(po: PurchaseOrder) {
  editingPoId.value = po.id
  Object.assign(poForm, {
    supplierId: po.supplierId,
    branchId: po.branchId,
    status: po.status,
    note: po.note,
    shippingDollars: po.shippingCents / 100,
    items: po.items.map((i) => ({ productId: i.productId, name: localName(i.productName, i.productNameKm), sku: i.sku, qty: i.qtyOrdered, unitCostDollars: i.unitCostCents / 100 })),
  })
  void loadAllProducts()
  showPoModal.value = true
}
// Picked from the single search box. The product just picked always lands at
// the top; if it's already on the order its qty goes up and it moves to the
// top instead of being added twice. The unit cost is pre-filled with the
// product's current cost (editable) rather than starting at 0.
function addPoProduct(productId: string | number) {
  const product = products.value.find((p) => p.id === productId)
  if (!product) return
  const idx = poForm.items.findIndex((i) => i.productId === product.id)
  if (idx !== -1) {
    const [existing] = poForm.items.splice(idx, 1)
    existing.qty += 1
    poForm.items.unshift(existing)
  } else {
    poForm.items.unshift({ productId: product.id, name: localName(product.nameEn, product.nameKm), sku: product.sku, qty: 1, unitCostDollars: product.costCents / 100 })
  }
}
function removePoItem(productId: number) {
  const idx = poForm.items.findIndex((i) => i.productId === productId)
  if (idx !== -1) poForm.items.splice(idx, 1)
}
const poFormItemsCents = computed(() => poForm.items.reduce((sum, i) => sum + i.qty * Math.round(i.unitCostDollars * 100), 0))
const poFormShippingCents = computed(() => Math.round(poForm.shippingDollars * 100))
const poFormTotalCents = computed(() => poFormItemsCents.value + poFormShippingCents.value)

async function submitPo() {
  if (poForm.supplierId === null || poForm.branchId === null || poForm.items.length === 0) {
    toast.error(t('inventory.pickPoFields'))
    return
  }
  const id = editingPoId.value
  saving.value = true
  const ok = await savePurchaseOrder(
    {
      supplierId: poForm.supplierId,
      branchId: poForm.branchId,
      status: poForm.status,
      note: poForm.note,
      shippingCents: poFormShippingCents.value,
      items: poForm.items.map((i) => ({ productId: i.productId, qty: Number(i.qty), unitCostCents: Math.round(i.unitCostDollars * 100) })),
    },
    id,
  )
  saving.value = false
  if (ok) {
    toast.success(id === null ? t('inventory.poCreated') : t('inventory.poUpdated'))
    showPoModal.value = false
  }
}
async function receivePo(po: PurchaseOrder) {
  if (await receivePurchaseOrder(po.id)) toast.success(t('inventory.poReceived', { code: po.code }))
}
async function deletePo(id: number) {
  if (await removePurchaseOrder(id)) toast.success(t('inventory.poDeleted'))
}

// --- Sales (branch history: view, edit items on a still-open shift, void) ---
// "Edit" only ever changes which products/quantities were rung up — never
// payment method/amount or discounts. See EditSale in the backend and
// docs/DECISIONS.md for why: those need the amount tendered to still make
// sense, which a bare item swap can't guarantee on its own.

const canEditSale = auth.hasPermission('pos.edit_sale')
const canVoidSale = auth.hasPermission('pos.void')

const saleSearch = ref('')
const debouncedSaleSearch = useDebounced(saleSearch)
const saleRange = ref<{ from: string; to: string } | null>(null)
const saleList = reactive(
  usePagedList(
    ({ page, perPage }) =>
      posApi.pageSales(branchId.value, {
        page,
        perPage,
        q: debouncedSaleSearch.value.trim(),
        dateFrom: saleRange.value?.from,
        dateTo: saleRange.value?.to,
      }),
    { deps: [branchId, debouncedSaleSearch, saleRange] },
  ),
)
watch(activeTab, (tab) => {
  if ((tab === 'moves' || tab === 'sales') && products.value.length === 0) void loadAllProducts()
})
// Unlike the PO item picker, a sale can include SERVICE products.
const saleProductOptions = computed(() =>
  products.value.filter((p) => p.active).map((p) => ({ value: p.id, label: localName(p.nameEn, p.nameKm), sub: [p.sku, p.nameEn, p.nameKm].filter(Boolean).join(' · ') })),
)

interface SaleEditItem {
  productId: number
  name: string
  sku: string
  qty: number
  // Carried over unchanged from the original line — not independently
  // editable here, same scope boundary as payment/discounts (see
  // docs/DECISIONS.md): this flow only corrects which products and how many.
  note: string
}
const showSaleModal = ref(false)
const saleModalMode = ref<'view' | 'edit'>('view')
const activeSale = ref<Sale | null>(null)
const saleEditItems = ref<SaleEditItem[]>([])
const savingSale = ref(false)

function canEditSaleRow(s: Sale) {
  return canEditSale && s.status === 'PAID'
}
function openSaleDetail(row: Sale) {
  activeSale.value = row
  saleModalMode.value = 'view'
  showSaleModal.value = true
}
function startEditSale() {
  if (!activeSale.value) return
  saleEditItems.value = activeSale.value.items.map((i) => ({ productId: i.productId, name: localName(i.name, i.nameKm), sku: i.sku, qty: i.qty, note: i.note }))
  saleModalMode.value = 'edit'
}
function cancelEditSale() {
  saleModalMode.value = 'view'
}
function addSaleItem(productId: string | number) {
  const product = products.value.find((p) => p.id === productId)
  if (!product) return
  const idx = saleEditItems.value.findIndex((i) => i.productId === product.id)
  if (idx !== -1) {
    saleEditItems.value[idx].qty += 1
  } else {
    saleEditItems.value.push({ productId: product.id, name: localName(product.nameEn, product.nameKm), sku: product.sku, qty: 1, note: '' })
  }
}
function removeSaleEditItem(productId: number) {
  const idx = saleEditItems.value.findIndex((i) => i.productId === productId)
  if (idx !== -1) saleEditItems.value.splice(idx, 1)
}
async function submitSaleEdit() {
  if (!activeSale.value || saleEditItems.value.length === 0) {
    toast.error(t('inventory.saleNeedsItem'))
    return
  }
  savingSale.value = true
  try {
    const updated = await posApi.editSale(
      activeSale.value.id,
      saleEditItems.value.map((i) => ({ productId: i.productId, qty: Number(i.qty) || 1, note: i.note })),
    )
    toast.success(t('inventory.saleUpdated'))
    activeSale.value = updated
    saleModalMode.value = 'view'
    await saleList.reload()
  } catch {
    // toasted by the API client
  } finally {
    savingSale.value = false
  }
}
function closeSaleModal() {
  showSaleModal.value = false
  activeSale.value = null
  saleModalMode.value = 'view'
}
async function deleteSaleRow(row: Sale) {
  try {
    await posApi.voidSale(row.id, t('inventory.saleDeletedReason'))
    toast.success(t('inventory.saleDeleted'))
    if (activeSale.value?.id === row.id) closeSaleModal()
    await saleList.reload()
  } catch {
    // toasted by the API client
  }
}

// --- Product image preview (click a product's thumbnail) --------------------

const previewRow = ref<(typeof rows.value)[number] | null>(null)
function editFromPreview() {
  if (!previewRow.value) return
  const row = previewRow.value
  previewRow.value = null
  if (canEditProduct) editProduct(row)
}

// --- Purchase order detail (read-only line items) ---------------------------

const showPoDetailModal = ref(false)
const detailPo = ref<PurchaseOrder | null>(null)
function viewPoDetail(po: PurchaseOrder) {
  detailPo.value = po
  showPoDetailModal.value = true
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl">{{ $t('inventory.title') }}</h1>
        <p class="text-muted text-sm">{{ auth.branches.find((b) => b.id === branchId)?.name }}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-4">
      <div class="card">
        <p class="text-sm text-muted">{{ $t('inventory.stockValue') }}</p>
        <p class="font-mono text-xl mt-1">{{ formatUSD(summary.stockValueCents) }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-muted">{{ $t('inventory.activeProducts') }}</p>
        <p class="font-mono text-xl mt-1">{{ summary.activeProducts }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-muted">{{ $t('inventory.belowReorder') }}</p>
        <p class="font-mono text-xl mt-1 text-warning-text">{{ summary.belowReorder }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-muted">{{ $t('inventory.outOfStock') }}</p>
        <p class="font-mono text-xl mt-1 text-danger-strong">{{ summary.outOfStock }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-muted">{{ $t('inventory.openPos') }}</p>
        <p class="font-mono text-xl mt-1">{{ summary.openPurchaseOrders }}</p>
      </div>
    </div>

    <Tabs v-model="activeTab" :tabs="tabs" />

    <div v-if="activeTab === 'products'" class="card space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div class="flex flex-wrap gap-2">
          <input v-model="search" type="search" :placeholder="$t('inventory.searchPlaceholder')" class="input max-w-xs" />
          <SearchableSelect v-model="categoryFilter" class="w-52" :options="categoryFilterOptions" :clearable="false" />
          <SearchableSelect v-model="typeFilter" class="w-40" :options="typeFilterOptions" :searchable="false" :clearable="false" />
          <SearchableSelect v-model="statusFilter" class="w-44" :options="statusFilterOptions" :searchable="false" :clearable="false" />
        </div>
        <div class="flex flex-wrap gap-2">
          <button v-if="canCreateProduct" type="button" class="btn-secondary flex items-center gap-2" @click="openImport('products')">
            <Upload :stroke-width="1.8" class="w-4 h-4" /> {{ $t('inventory.import') }}
          </button>
          <button type="button" class="btn-secondary flex items-center gap-2" @click="exportCsv">
            <Download :stroke-width="1.8" class="w-4 h-4" /> {{ $t('inventory.exportCsv') }}
          </button>
          <button v-if="canCreateProduct" type="button" class="btn-primary flex items-center gap-2" @click="newProduct">
            <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('inventory.newProduct') }}
          </button>
        </div>
      </div>

      <div v-if="canEditProduct && selectedProductIds.size > 0" class="flex items-center gap-3 rounded-control bg-primary-tint px-3 py-2 text-sm">
        <span class="text-primary-tint-text">{{ $t('inventory.selectedProducts', { n: selectedProductIds.size }) }}</span>
        <ConfirmDelete :item-label="$t('inventory.selectedProducts', { n: selectedProductIds.size })" size="md" @confirm="bulkDeleteProducts" />
        <span v-if="bulkDeleting" class="text-xs text-muted">{{ $t('common.loading') }}</span>
        <button type="button" class="text-xs text-muted hover:text-ink ml-auto" @click="selectedProductIds = new Set()">{{ $t('common.cancel') }}</button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th v-if="canEditProduct" class="py-2 pr-1 font-medium w-6">
                <input type="checkbox" class="rounded" :checked="allVisibleSelected" :aria-label="$t('inventory.selectAll')" @change="toggleSelectAllProducts" />
              </th>
              <th class="py-2 font-medium">{{ $t('col.sku') }}</th>
              <th class="py-2 font-medium">{{ $t('col.product') }}</th>
              <th class="py-2 font-medium">{{ $t('common.category') }}</th>
              <th class="py-2 font-medium">{{ $t('col.type') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('col.cost') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('col.price') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('col.margin') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('col.stock') }}</th>
              <th class="py-2 pr-4 font-medium text-right">{{ $t('col.reorder') }}</th>
              <th class="py-2 font-medium">{{ $t('col.status') }}</th>
              <th class="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" class="border-b border-line last:border-0 hover:bg-surface-subtle">
              <td v-if="canEditProduct" class="py-2 pr-1">
                <input
                  type="checkbox"
                  class="rounded"
                  :checked="selectedProductIds.has(r.id)"
                  :aria-label="$t('inventory.selectRowAria', { name: r.nameEn })"
                  @change="toggleProductSelected(r.id)"
                />
              </td>
              <td class="py-2 font-mono text-xs">{{ r.sku }}</td>
              <td class="py-2" :class="r.parentProductId ? 'pl-6' : ''">
                <div class="flex items-center gap-2">
                  <span v-if="r.parentProductId" class="text-muted">↳</span>
                  <button
                    type="button"
                    class="shrink-0 rounded-control hover:ring-2 hover:ring-primary/40 transition"
                    :aria-label="$t('inventory.previewAria')"
                    @click="previewRow = r"
                  >
                    <img v-if="r.imageUrl" :src="r.imageUrl" alt="" class="w-7 h-7 rounded-control object-cover" />
                    <span v-else class="w-7 h-7 rounded-control bg-primary-tint text-primary-tint-text text-xs flex items-center justify-center font-medium">
                      {{ r.imageInitials }}
                    </span>
                  </button>
                  <span>{{ r.parentProductId ? r.variantName : localName(r.nameEn, r.nameKm) }}</span>
                  <StatusBadge
                    v-if="!r.parentProductId && r.variantCount > 0"
                    tone="neutral"
                    :label="$t('inventory.variantCount', { n: r.variantCount }, r.variantCount)"
                  />
                </div>
              </td>
              <td class="py-2">{{ r.categoryName ? categoryName(r.categoryName, r.categoryNameKm) : '—' }}</td>
              <td class="py-2 text-muted">{{ label('productType', r.productType) }}</td>
              <td class="py-2 text-right font-mono">{{ formatUSD(r.costCents) }}</td>
              <td class="py-2 text-right font-mono">{{ formatUSD(r.priceCents) }}</td>
              <td class="py-2 text-right font-mono">{{ r.marginPct }}%</td>
              <td class="py-2 text-right font-mono">{{ r.productType === 'SERVICE' ? '—' : r.qty }}</td>
              <td class="py-2 pr-4 text-right font-mono text-muted">{{ r.productType === 'SERVICE' ? '—' : r.reorderPoint }}</td>
              <td class="py-2"><StatusBadge :tone="statusTone[r.status]" :label="$t('stockStatus.' + r.status)" /></td>
              <td class="py-2">
                <div v-if="canCreateProduct || canEditProduct" class="flex items-center gap-1">
                  <button
                    v-if="canCreateProduct && !r.parentProductId"
                    type="button"
                    class="p-1.5 text-muted hover:text-ink"
                    :aria-label="$t('inventory.addVariantAria')"
                    :title="$t('inventory.addVariant')"
                    @click="newVariant(r)"
                  >
                    <PackagePlus :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <button v-if="canEditProduct" type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('inventory.editProductAria')" @click="editProduct(r)">
                    <Pencil :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <ConfirmDelete v-if="canEditProduct" :item-label="$t('entity.product')" :item-name="r.nameEn" @confirm="deleteProduct(r.id)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Pagination v-model:page="productList.page" :total-pages="productList.totalPages" :total="productList.total" :per-page="productList.perPage" :noun="$t('inventory.productsNoun')" />
    </div>

    <div v-else-if="activeTab === 'categories'" class="card overflow-x-auto">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <input v-model="categorySearch" type="search" :placeholder="$t('inventory.searchCategoriesPlaceholder')" class="input max-w-xs" />
        <div class="flex flex-wrap gap-2">
          <button v-if="canCatalog" type="button" class="btn-secondary flex items-center gap-2" @click="openImport('categories')">
            <Upload :stroke-width="1.8" class="w-4 h-4" /> {{ $t('inventory.import') }}
          </button>
          <button type="button" class="btn-secondary flex items-center gap-2" @click="exportCategoriesCsv">
            <Download :stroke-width="1.8" class="w-4 h-4" /> {{ $t('inventory.exportCsv') }}
          </button>
          <button v-if="canCatalog" type="button" class="btn-primary flex items-center gap-2" @click="newCategory">
            <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('inventory.newCategory') }}
          </button>
        </div>
      </div>

      <div v-if="canCatalog && selectedCategoryIds.size > 0" class="flex items-center gap-3 rounded-control bg-primary-tint px-3 py-2 text-sm mb-3">
        <span class="text-primary-tint-text">{{ $t('inventory.selectedCategories', { n: selectedCategoryIds.size }) }}</span>
        <ConfirmDelete :item-label="$t('inventory.selectedCategories', { n: selectedCategoryIds.size })" size="md" @confirm="bulkDeleteCategories" />
        <span v-if="bulkDeletingCategories" class="text-xs text-muted">{{ $t('common.loading') }}</span>
        <button type="button" class="text-xs text-muted hover:text-ink ml-auto" @click="selectedCategoryIds = new Set()">{{ $t('common.cancel') }}</button>
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-line">
            <th v-if="canCatalog" class="py-2 pr-1 font-medium w-6">
              <input type="checkbox" class="rounded" :checked="allVisibleCategoriesSelected" :aria-label="$t('inventory.selectAll')" @change="toggleSelectAllCategories" />
            </th>
            <th class="py-2 font-medium">{{ $t('col.id') }}</th>
            <th class="py-2 font-medium">{{ $t('col.nameEn') }}</th>
            <th class="py-2 font-medium">{{ $t('col.nameKm') }}</th>
            <th class="py-2 pr-4 font-medium text-right">{{ $t('col.products') }}</th>
            <th class="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in categoryList.rows" :key="c.id" class="border-b border-line last:border-0">
            <td v-if="canCatalog" class="py-2 pr-1">
              <input
                type="checkbox"
                class="rounded"
                :checked="selectedCategoryIds.has(c.id)"
                :aria-label="$t('inventory.selectRowAria', { name: c.nameEn })"
                @change="toggleCategorySelected(c.id)"
              />
            </td>
            <td class="py-2 font-mono text-xs text-muted">#{{ c.id }}</td>
            <td class="py-2">{{ c.nameEn }}</td>
            <td class="py-2">{{ c.nameKm }}</td>
            <td class="py-2 pr-4 text-right font-mono">{{ c.productCount }}</td>
            <td class="py-2">
              <div v-if="canCatalog" class="flex items-center gap-1">
                <button type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('inventory.editCategoryAria')" @click="editCategory(c)">
                  <Pencil :stroke-width="1.8" class="w-4 h-4" />
                </button>
                <ConfirmDelete :item-label="$t('entity.category')" :item-name="c.nameEn" @confirm="deleteCategory(c.id)" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <Pagination v-model:page="categoryList.page" :total-pages="categoryList.totalPages" :total="categoryList.total" :per-page="categoryList.perPage" :noun="$t('inventory.categoriesNoun')" />
    </div>

    <div v-else-if="activeTab === 'moves'" class="card overflow-x-auto space-y-3">
      <div class="flex flex-wrap items-end gap-3">
        <SearchableSelect v-model="moveProduct" :label="$t('common.product')" class="w-60" :options="moveProductOptions" :clearable="false" />
        <SearchableSelect v-model="moveType" :label="$t('common.type')" class="w-44" :options="moveTypeOptions" :searchable="false" :clearable="false" />
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('inventory.dateRange') }}</label>
          <DateRangePicker v-model="moveRange" clearable @clear="moveRange = null" />
        </div>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-line">
            <th class="py-2 font-medium">{{ $t('col.date') }}</th>
            <th class="py-2 font-medium">{{ $t('col.sku') }}</th>
            <th class="py-2 font-medium">{{ $t('col.product') }}</th>
            <th class="py-2 font-medium">{{ $t('col.type') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.qtyChange') }}</th>
            <th class="py-2 pr-4 font-medium text-right">{{ $t('col.balance') }}</th>
            <th class="py-2 font-medium">{{ $t('col.user') }}</th>
            <th class="py-2 font-medium">{{ $t('col.reference') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in moveList.rows" :key="m.id" class="border-b border-line last:border-0">
            <td class="py-2 font-mono text-xs">{{ formatDateTime(m.createdAt) }}</td>
            <td class="py-2 font-mono text-xs">{{ m.sku }}</td>
            <td class="py-2">{{ localName(m.product, m.productKm) }}</td>
            <td class="py-2">{{ label('moveType', m.type) }}</td>
            <td class="py-2 text-right font-mono" :class="m.qtyChange < 0 ? 'text-danger-strong' : 'text-success-text'">
              {{ m.qtyChange > 0 ? '+' : '' }}{{ m.qtyChange }}
            </td>
            <td class="py-2 pr-4 text-right font-mono">{{ m.balanceAfter }}</td>
            <td class="py-2">{{ m.user }}</td>
            <td class="py-2 font-mono text-xs">{{ m.reference }}</td>
          </tr>
        </tbody>
      </table>
      <Pagination v-model:page="moveList.page" :total-pages="moveList.totalPages" :total="moveList.total" :per-page="moveList.perPage" :noun="$t('inventory.movementsNoun')" />
    </div>

    <div v-else-if="activeTab === 'po'" class="card overflow-x-auto">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('inventory.created') }}</label>
            <DateRangePicker v-model="poRange" clearable @clear="poRange = null" />
          </div>
          <SearchableSelect v-model="poSupplierFilter" :label="$t('col.supplier')" class="w-52" :options="poSupplierFilterOptions" :clearable="false" />
        </div>
        <button v-if="canPo" type="button" class="btn-primary flex items-center gap-2" @click="newPo">
          <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('inventory.newPo') }}
        </button>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-line">
            <th class="py-2 font-medium">{{ $t('col.po') }}</th>
            <th class="py-2 font-medium">{{ $t('col.supplier') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.items') }}</th>
            <th class="py-2 pr-4 font-medium text-right">{{ $t('col.totalCost') }}</th>
            <th class="py-2 font-medium">{{ $t('col.created') }}</th>
            <th class="py-2 font-medium">{{ $t('col.status') }}</th>
            <th class="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="po in poList.rows" :key="po.id" class="border-b border-line last:border-0">
            <td class="py-2 font-mono text-xs">{{ po.code }}</td>
            <td class="py-2">{{ po.supplierName }}</td>
            <td class="py-2 text-right font-mono">{{ poItemCount(po) }}</td>
            <td class="py-2 pr-4 text-right font-mono">{{ formatUSD(poTotalCostCents(po)) }}</td>
            <td class="py-2 font-mono text-xs">{{ po.createdAt }}</td>
            <td class="py-2"><StatusBadge :tone="poStatusTone[po.status]" :label="label('poStatus', po.status)" /></td>
            <td class="py-2">
              <div class="flex items-center gap-1">
                <button type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('inventory.viewItemsAria')" @click="viewPoDetail(po)">
                  <Eye :stroke-width="1.8" class="w-4 h-4" />
                </button>
                <button v-if="canPo && po.status !== 'RECEIVED'" type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('inventory.editPoAria')" @click="editPo(po)">
                  <Pencil :stroke-width="1.8" class="w-4 h-4" />
                </button>
                <button
                  v-if="poCanReceive(po)"
                  type="button"
                  class="flex items-center gap-1 px-2 py-1 rounded-control text-xs text-success-text hover:bg-success-tint"
                  @click="receivePo(po)"
                >
                  <PackagePlus :stroke-width="1.8" class="w-3.5 h-3.5" /> {{ $t('inventory.receive') }}
                </button>
                <ConfirmDelete v-if="canPo && po.status !== 'RECEIVED' && po.status !== 'PARTIAL'" :item-label="$t('entity.purchaseOrder')" :item-name="po.code" @confirm="deletePo(po.id)" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <Pagination v-model:page="poList.page" :total-pages="poList.totalPages" :total="poList.total" :per-page="poList.perPage" :noun="$t('inventory.posNoun')" />
    </div>

    <div v-else-if="activeTab === 'sales'" class="card overflow-x-auto space-y-3">
      <div class="flex flex-wrap items-end gap-3">
        <input v-model="saleSearch" type="search" :placeholder="$t('inventory.searchSalesPlaceholder')" class="input max-w-xs" />
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('inventory.dateRange') }}</label>
          <DateRangePicker v-model="saleRange" clearable @clear="saleRange = null" />
        </div>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-line">
            <th class="py-2 font-medium">{{ $t('col.receipt') }}</th>
            <th class="py-2 font-medium">{{ $t('col.date') }}</th>
            <th class="py-2 font-medium">{{ $t('col.cashier') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.items') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.total') }}</th>
            <th class="py-2 font-medium">{{ $t('col.status') }}</th>
            <th class="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in saleList.rows"
            :key="s.id"
            class="border-b border-line last:border-0 hover:bg-surface-subtle cursor-pointer"
            @click="openSaleDetail(s)"
          >
            <td class="py-2 font-mono text-xs">{{ s.receiptNo }}</td>
            <td class="py-2 font-mono text-xs">{{ formatDateTime(s.soldAt) }}</td>
            <td class="py-2">{{ s.cashier }}</td>
            <td class="py-2 text-right font-mono">{{ s.items.reduce((n, i) => n + i.qty, 0) }}</td>
            <td class="py-2 text-right font-mono">{{ formatUSD(s.totalCents) }}</td>
            <td class="py-2"><StatusBadge :tone="saleStatusTone[s.status]" :label="label('saleStatus', s.status)" /></td>
            <td class="py-2" @click.stop>
              <div v-if="canVoidSale && s.status === 'PAID'" class="flex items-center gap-1">
                <ConfirmDelete :item-label="$t('entity.sale')" :item-name="s.receiptNo" @confirm="deleteSaleRow(s)" />
              </div>
            </td>
          </tr>
          <tr v-if="!saleList.loading && saleList.rows.length === 0">
            <td colspan="7" class="py-6 text-center text-muted">{{ $t('inventory.noSales') }}</td>
          </tr>
        </tbody>
      </table>
      <Pagination v-model:page="saleList.page" :total-pages="saleList.totalPages" :total="saleList.total" :per-page="saleList.perPage" :noun="$t('inventory.salesNoun')" />
    </div>

    <div v-else-if="activeTab === 'suppliers'" class="card overflow-x-auto">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <input v-model="supplierSearch" type="search" :placeholder="$t('inventory.searchSuppliersPlaceholder')" class="input max-w-xs" />
        <button v-if="canCatalog" type="button" class="btn-primary flex items-center gap-2" @click="newSupplier">
          <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('inventory.newSupplier') }}
        </button>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-line">
            <th class="py-2 font-medium">{{ $t('col.supplier') }}</th>
            <th class="py-2 font-medium">{{ $t('col.contact') }}</th>
            <th class="py-2 font-medium">{{ $t('col.phone') }}</th>
            <th class="py-2 font-medium">{{ $t('col.terms') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.productsSupplied') }}</th>
            <th class="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in supplierList.rows" :key="s.id" class="border-b border-line last:border-0">
            <td class="py-2 flex items-center gap-2">
              <Package :stroke-width="1.8" class="w-4 h-4 text-muted" />
              {{ s.name }}
            </td>
            <td class="py-2 text-muted">{{ s.contact }}</td>
            <td class="py-2 font-mono">{{ s.phone }}</td>
            <td class="py-2 text-muted">{{ s.paymentTerms }}</td>
            <td class="py-2 text-right font-mono">{{ s.productCount ?? 0 }}</td>
            <td class="py-2">
              <div v-if="canCatalog" class="flex items-center gap-1">
                <button type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('inventory.editSupplierAria')" @click="editSupplier(s)">
                  <Pencil :stroke-width="1.8" class="w-4 h-4" />
                </button>
                <ConfirmDelete :item-label="$t('entity.supplier')" :item-name="s.name" @confirm="deleteSupplier(s.id)" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <Pagination v-model:page="supplierList.page" :total-pages="supplierList.totalPages" :total="supplierList.total" :per-page="supplierList.perPage" :noun="$t('inventory.suppliersNoun')" />
    </div>

    <Modal v-if="previewRow" :title="localName(previewRow.nameEn, previewRow.nameKm)" @close="previewRow = null">
      <div class="space-y-4">
        <div class="w-full aspect-square rounded-card bg-primary-tint flex items-center justify-center overflow-hidden">
          <img v-if="previewRow.imageUrl" :src="previewRow.imageUrl" :alt="localName(previewRow.nameEn, previewRow.nameKm)" class="w-full h-full object-cover" />
          <span v-else class="text-primary-tint-text font-heading text-6xl">{{ previewRow.imageInitials }}</span>
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><p class="text-muted text-xs">{{ $t('col.sku') }}</p><p class="font-mono">{{ previewRow.sku }}</p></div>
          <div><p class="text-muted text-xs">{{ $t('common.category') }}</p><p>{{ previewRow.categoryName ? categoryName(previewRow.categoryName, previewRow.categoryNameKm) : '—' }}</p></div>
          <div><p class="text-muted text-xs">{{ $t('col.price') }}</p><p class="font-mono">{{ formatUSD(previewRow.priceCents) }}</p></div>
          <div><p class="text-muted text-xs">{{ $t('col.cost') }}</p><p class="font-mono">{{ formatUSD(previewRow.costCents) }}</p></div>
          <div><p class="text-muted text-xs">{{ $t('inventory.productType') }}</p><p>{{ label('productType', previewRow.productType) }}</p></div>
          <template v-if="previewRow.productType === 'SERVICE'">
            <div class="col-span-2"><p class="text-muted text-xs">{{ $t('inventory.serviceHint') }}</p></div>
          </template>
          <template v-else>
            <div><p class="text-muted text-xs">{{ $t('inventory.inStock') }}</p><p class="font-mono">{{ previewRow.qty }}</p></div>
            <div><p class="text-muted text-xs">{{ $t('inventory.reorderPoint') }}</p><p class="font-mono">{{ previewRow.reorderPoint }}</p></div>
          </template>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-secondary" @click="previewRow = null">{{ $t('common.close') }}</button>
          <button v-if="canEditProduct" type="button" class="btn-primary flex items-center gap-2" @click="editFromPreview">
            <Pencil :stroke-width="1.8" class="w-4 h-4" /> {{ $t('inventory.editProduct') }}
          </button>
        </div>
      </div>
    </Modal>

    <Modal v-if="showCategoryModal" :title="editingCategoryId === null ? $t('inventory.newCategory') : $t('inventory.editCategory')" @close="showCategoryModal = false">
      <form class="space-y-4" @submit.prevent="submitCategory">
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('inventory.nameEn') }}</label>
          <input v-model="categoryForm.nameEn" type="text" class="input" required />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('inventory.nameKm') }}</label>
          <input v-model="categoryForm.nameKm" type="text" class="input" />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showCategoryModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary">{{ editingCategoryId === null ? $t('settings.create') : $t('common.save') }}</button>
        </div>
      </form>
    </Modal>

    <Modal v-if="showProductModal" :title="editingProductId === null ? (variantOf ? $t('inventory.addVariant') : $t('inventory.newProduct')) : $t('inventory.editProduct')" wide @close="showProductModal = false">
      <form class="space-y-4" @submit.prevent="submitProduct">
        <div v-if="variantOf" class="rounded-control bg-surface-subtle px-3 py-2 text-sm">
          {{ $t('inventory.variantOfNote', { name: localName(variantOf.nameEn, variantOf.nameKm) }) }}
        </div>
        <template v-if="variantOf">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('inventory.variantName') }}</label>
            <input v-model="productForm.variantName" type="text" class="input" :placeholder="$t('inventory.variantNameHint')" required />
          </div>
          <p class="text-xs text-muted -mt-2">
            {{ $t('inventory.variantFullNamePreview', { name: `${localName(variantOf.nameEn, variantOf.nameKm)} — ${productForm.variantName || '…'}` }) }}
          </p>
        </template>
        <template v-else>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('inventory.nameEn') }}</label>
            <input v-model="productForm.nameEn" type="text" class="input" required />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('inventory.nameKm') }}</label>
            <input v-model="productForm.nameKm" type="text" class="input" :placeholder="$t('inventory.nameKmHint')" />
          </div>
        </template>
        <SearchableSelect v-if="!variantOf" v-model="productForm.categoryId" :label="$t('common.category')" :options="categoryOptions" required />
        <div v-if="!variantOf">
          <label class="block text-sm text-muted mb-1">{{ $t('inventory.productType') }}</label>
          <div class="flex rounded-control border border-line overflow-hidden text-sm w-fit">
            <button
              v-for="pt in PRODUCT_TYPES"
              :key="pt"
              type="button"
              class="px-3 py-1.5"
              :class="productForm.productType === pt ? 'bg-primary text-white' : 'bg-surface text-muted hover:text-ink'"
              @click="productForm.productType = pt"
            >
              {{ label('productType', pt) }}
            </button>
          </div>
          <p class="text-xs text-muted mt-1">{{ productForm.productType === 'SERVICE' ? $t('inventory.serviceHint') : $t('inventory.standardHint') }}</p>
        </div>
        <p v-else class="text-xs text-muted">{{ $t('inventory.variantInheritedNote') }}</p>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('inventory.unit') }}</label>
            <input v-model="productForm.unit" type="text" class="input" :placeholder="$t('inventory.unitHint')" />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('inventory.barcode') }}</label>
            <input v-model="productForm.barcode" type="text" class="input" />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('inventory.reorderPoint') }}</label>
            <input
              v-model.number="productForm.reorderPoint"
              type="number"
              min="0"
              class="input"
              :disabled="productForm.productType === 'SERVICE'"
              :placeholder="productForm.productType === 'SERVICE' ? '—' : ''"
            />
          </div>
        </div>
        <label v-if="productForm.productType === 'STANDARD'" class="flex items-center gap-2 text-sm">
          <input v-model="productForm.hideWhenOutOfStock" type="checkbox" class="rounded" />
          {{ $t('inventory.hideWhenOutOfStock') }}
        </label>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('inventory.costUsd') }}</label>
            <input v-model.number="productForm.costDollars" type="number" min="0" step="0.01" class="input" required />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('inventory.priceUsd') }}</label>
            <input v-model.number="productForm.priceDollars" type="number" min="0" step="0.01" class="input" required />
          </div>
        </div>

        <div v-if="!variantOf">
          <label class="block text-sm text-muted mb-1">{{ $t('inventory.image') }}</label>
          <div class="flex items-center gap-3 mb-2">
            <div class="flex rounded-control border border-line overflow-hidden text-xs">
              <button
                type="button"
                class="px-3 py-1.5"
                :class="imageMode === 'link' ? 'bg-primary text-white' : 'bg-surface text-muted hover:text-ink'"
                @click="imageMode = 'link'"
              >
                {{ $t('inventory.imageLink') }}
              </button>
              <button
                type="button"
                class="px-3 py-1.5"
                :class="imageMode === 'upload' ? 'bg-primary text-white' : 'bg-surface text-muted hover:text-ink'"
                @click="imageMode = 'upload'"
              >
                {{ $t('inventory.uploadFile') }}
              </button>
            </div>
            <img v-if="productForm.imageUrl" :src="productForm.imageUrl" alt="" class="w-9 h-9 rounded-control object-cover border border-line" />
          </div>
          <input v-if="imageMode === 'link'" v-model="productForm.imageUrl" type="url" class="input" placeholder="https://…" />
          <input v-else type="file" accept="image/*" class="input" @change="onImageFileChange" />
          <p class="text-xs text-muted mt-1">{{ $t('inventory.imageHelp') }}</p>
        </div>

        <label class="flex items-center gap-2 text-sm">
          <input v-model="productForm.active" type="checkbox" class="rounded" />
          {{ $t('common.active') }}
        </label>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showProductModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ editingProductId === null ? $t('settings.create') : $t('common.save') }}</button>
        </div>
      </form>
    </Modal>

    <Modal v-if="showSupplierModal" :title="editingSupplierId === null ? $t('inventory.newSupplier') : $t('inventory.editSupplier')" @close="showSupplierModal = false">
      <form class="space-y-4" @submit.prevent="submitSupplier">
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.name') }}</label>
          <input v-model="supplierForm.name" type="text" class="input" required />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('inventory.contactPerson') }}</label>
          <input v-model="supplierForm.contact" type="text" class="input" />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.phone') }}</label>
          <input v-model="supplierForm.phone" type="text" class="input" />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('inventory.paymentTerms') }}</label>
          <input v-model="supplierForm.paymentTerms" type="text" class="input" :placeholder="$t('inventory.paymentTermsHint')" />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showSupplierModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary">{{ editingSupplierId === null ? $t('settings.create') : $t('common.save') }}</button>
        </div>
      </form>
    </Modal>

    <Modal v-if="showPoModal" :title="editingPoId === null ? $t('inventory.newPo') : $t('inventory.editPo', { code: poList.rows.find((po) => po.id === editingPoId)?.code })" wide @close="showPoModal = false">
      <form class="space-y-4" @submit.prevent="submitPo">
        <div class="grid grid-cols-2 gap-3">
          <SearchableSelect v-model="poForm.supplierId" :label="$t('common.supplier')" :options="supplierOptions" required />
          <SearchableSelect v-model="poForm.branchId" :label="$t('common.branch')" :options="branchOptions" required />
        </div>
        <SearchableSelect
          v-if="editingPoId !== null"
          v-model="poForm.status"
          :label="$t('common.status')"
          :options="poStatusOptions"
          :searchable="false"
          :clearable="false"
        />

        <div>
          <SearchAddInput :label="$t('inventory.items')" :options="productOptions" :placeholder="$t('inventory.itemsSearchHint')" @select="addPoProduct" />
          <div class="mt-2 space-y-2">
            <p v-if="poForm.items.length === 0" class="rounded-control border border-dashed border-line py-4 text-center text-sm text-muted">
              {{ $t('inventory.noItemsYet') }}
            </p>
            <div v-for="item in poForm.items" :key="item.productId" class="flex items-end gap-2">
              <div class="flex-1 min-w-0 pb-2">
                <p class="text-sm font-medium truncate">{{ item.name }}</p>
                <p class="text-xs text-muted font-mono">{{ item.sku }}</p>
              </div>
              <div class="w-20">
                <label class="block text-xs text-muted mb-1">{{ $t('inventory.qty') }}</label>
                <input v-model.number="item.qty" type="number" min="1" class="input" />
              </div>
              <div class="w-28">
                <label class="block text-xs text-muted mb-1">{{ $t('inventory.unitCostUsd') }}</label>
                <input v-model.number="item.unitCostDollars" type="number" min="0" step="0.01" class="input" />
              </div>
              <button type="button" class="p-2 text-muted hover:text-danger-strong" :aria-label="$t('inventory.removeItem')" @click="removePoItem(item.productId)">
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>
          <p class="text-sm text-right font-mono mt-2">{{ $t('inventory.itemsTotal', { amount: formatUSD(poFormItemsCents) }) }}</p>
        </div>

        <div class="grid grid-cols-2 gap-3 items-end">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('inventory.shippingUsd') }}</label>
            <input v-model.number="poForm.shippingDollars" type="number" min="0" step="0.01" class="input" />
          </div>
          <p class="text-sm text-right font-mono font-medium">{{ $t('inventory.totalLine', { amount: formatUSD(poFormTotalCents) }) }}</p>
        </div>

        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.note') }}</label>
          <input v-model="poForm.note" type="text" class="input" />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showPoModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ editingPoId === null ? $t('settings.create') : $t('common.save') }}</button>
        </div>
      </form>
    </Modal>

    <Modal v-if="showPoDetailModal && detailPo" :title="$t('inventory.poItemsTitle', { code: detailPo.code })" wide @close="showPoDetailModal = false">
      <div class="space-y-4">
        <div class="flex items-center justify-between text-sm text-muted">
          <span>{{ detailPo?.supplierName }}</span>
          <StatusBadge :tone="poStatusTone[detailPo?.status ?? 'DRAFT']" :label="label('poStatus', detailPo.status)" />
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.product') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('col.qty') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('col.unitCost') }}</th>
              <th class="py-2 pr-1 font-medium text-right">{{ $t('col.lineTotal') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in detailPo.items" :key="idx" class="border-b border-line last:border-0">
              <td class="py-2">{{ localName(item.productName, item.productNameKm) }}</td>
              <td class="py-2 text-right font-mono">{{ item.qtyOrdered }}</td>
              <td class="py-2 text-right font-mono">{{ formatUSD(item.unitCostCents) }}</td>
              <td class="py-2 pr-1 text-right font-mono">{{ formatUSD(item.qtyOrdered * item.unitCostCents) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="detailPo.note" class="text-sm text-muted">{{ $t('inventory.poNote', { note: detailPo.note }) }}</p>
        <div class="space-y-1 pt-2 border-t border-line">
          <div class="flex justify-between text-sm">
            <span class="text-muted">{{ $t('inventory.items') }}</span>
            <span class="font-mono">{{ formatUSD(poItemsCostCents(detailPo)) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-muted">{{ $t('inventory.shipping') }}</span>
            <span class="font-mono">{{ formatUSD(detailPo.shippingCents) }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">{{ $t('inventory.totalCost') }}</span>
            <span class="font-mono font-medium">{{ formatUSD(poTotalCostCents(detailPo)) }}</span>
          </div>
        </div>
        <div class="flex justify-end pt-2">
          <button type="button" class="btn-secondary" @click="showPoDetailModal = false">{{ $t('common.close') }}</button>
        </div>
      </div>
    </Modal>

    <Modal v-if="showSaleModal && activeSale" :title="activeSale.receiptNo" wide @close="closeSaleModal">
      <div class="space-y-4">
        <div class="flex items-center justify-between text-sm text-muted">
          <span>{{ formatDateTime(activeSale.soldAt) }} · {{ activeSale.cashier }}</span>
          <StatusBadge :tone="saleStatusTone[activeSale.status]" :label="label('saleStatus', activeSale.status)" />
        </div>

        <!-- View mode: read-only items, same shape as the row's own numbers -->
        <template v-if="saleModalMode === 'view'">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted border-b border-line">
                <th class="py-2 font-medium">{{ $t('col.product') }}</th>
                <th class="py-2 font-medium text-right">{{ $t('col.qty') }}</th>
                <th class="py-2 font-medium text-right">{{ $t('col.unitCost') }}</th>
                <th class="py-2 pr-1 font-medium text-right">{{ $t('col.lineTotal') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in activeSale.items" :key="item.productId" class="border-b border-line last:border-0">
                <td class="py-2">
                  <p>{{ localName(item.name, item.nameKm) }}</p>
                  <p v-if="item.note" class="text-xs text-muted">{{ item.note }}</p>
                </td>
                <td class="py-2 text-right font-mono">{{ item.qty }}</td>
                <td class="py-2 text-right font-mono">{{ formatUSD(item.unitPriceCents) }}</td>
                <td class="py-2 pr-1 text-right font-mono">{{ formatUSD(item.lineTotalCents) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="flex justify-between items-center pt-2 border-t border-line">
            <span class="text-sm text-muted">{{ $t('col.total') }}</span>
            <span class="font-mono font-medium">{{ formatUSD(activeSale.totalCents) }} ({{ formatKHR(activeSale.totalRiel) }})</span>
          </div>
          <div class="flex justify-between text-sm text-muted">
            <span>{{ $t('pos.paidBy') }}</span>
            <span>{{ label('method', activeSale.payment.method) }}</span>
          </div>
          <p v-if="!canEditSaleRow(activeSale)" class="text-xs text-muted">{{ $t('inventory.saleNotEditableHint') }}</p>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-secondary" @click="closeSaleModal">{{ $t('common.close') }}</button>
            <button v-if="canEditSaleRow(activeSale)" type="button" class="btn-primary flex items-center gap-2" @click="startEditSale">
              <Pencil :stroke-width="1.8" class="w-4 h-4" /> {{ $t('inventory.editSaleItems') }}
            </button>
          </div>
        </template>

        <!-- Edit mode: same item-picker UX as the purchase-order form -->
        <template v-else>
          <SearchAddInput :label="$t('inventory.items')" :options="saleProductOptions" :placeholder="$t('inventory.itemsSearchHint')" @select="addSaleItem" />
          <div class="space-y-2">
            <p v-if="saleEditItems.length === 0" class="rounded-control border border-dashed border-line py-4 text-center text-sm text-muted">
              {{ $t('inventory.noItemsYet') }}
            </p>
            <div v-for="item in saleEditItems" :key="item.productId" class="flex items-end gap-2">
              <div class="flex-1 min-w-0 pb-2">
                <p class="text-sm font-medium truncate">{{ item.name }}</p>
                <p class="text-xs text-muted font-mono">{{ item.sku }}</p>
                <p v-if="item.note" class="text-xs text-muted truncate">{{ item.note }}</p>
              </div>
              <div class="w-20">
                <label class="block text-xs text-muted mb-1">{{ $t('inventory.qty') }}</label>
                <input v-model.number="item.qty" type="number" min="1" class="input" />
              </div>
              <button type="button" class="p-2 text-muted hover:text-danger-strong" :aria-label="$t('inventory.removeItem')" @click="removeSaleEditItem(item.productId)">
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>
          <p class="text-xs text-muted">{{ $t('inventory.saleEditHint') }}</p>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-secondary" @click="cancelEditSale">{{ $t('common.cancel') }}</button>
            <button type="button" class="btn-primary" :disabled="savingSale" @click="submitSaleEdit">{{ $t('common.save') }}</button>
          </div>
        </template>
      </div>
    </Modal>

    <Modal v-if="showImportModal" :title="importKind === 'categories' ? $t('inventory.importCategories') : $t('inventory.importProducts')" @close="showImportModal = false">
      <div class="space-y-4">
        <p class="text-sm text-muted">{{ importKind === 'categories' ? $t('inventory.importCategoriesHint') : $t('inventory.importProductsHint') }}</p>

        <button type="button" class="text-sm text-primary-text hover:underline flex items-center gap-1.5" @click="downloadImportSample">
          <Download :stroke-width="1.8" class="w-3.5 h-3.5" /> {{ $t('inventory.downloadSample') }}
        </button>

        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('inventory.chooseCsv') }}</label>
          <input type="file" accept=".csv,text/csv" class="input" @change="onImportFileChange" />
        </div>

        <div v-if="importResult" class="space-y-2">
          <p class="text-sm">{{ $t('inventory.importCreated', { n: importResult.created }) }}</p>
          <div v-if="importResult.skipped.length" class="max-h-48 overflow-y-auto rounded-control border border-line">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left text-muted border-b border-line bg-surface-subtle">
                  <th class="py-1.5 px-2 font-medium">{{ $t('inventory.importRow') }}</th>
                  <th class="py-1.5 px-2 font-medium">{{ $t('inventory.importReason') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in importResult.skipped" :key="s.row" class="border-b border-line last:border-0">
                  <td class="py-1.5 px-2 font-mono">{{ s.row }}</td>
                  <td class="py-1.5 px-2 text-danger-strong">{{ s.reason }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showImportModal = false">{{ $t('common.close') }}</button>
          <button type="button" class="btn-primary" :disabled="!importFile || importing" @click="runImport">
            {{ importing ? $t('common.loading') : $t('inventory.import') }}
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>
