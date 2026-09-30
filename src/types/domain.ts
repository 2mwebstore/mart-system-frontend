// Shapes returned by the backend API, after the HTTP layer's snake_case ->
// camelCase conversion (see api/http.ts). Money is always integer cents (USD)
// or integer riel (KHR).

export interface Branch {
  id: number
  code: string
  name: string
  address: string
  phone: string
  receiptFooter: string
  active: boolean
}

export interface Till {
  id: number
  branchId: number
  name: string
  deviceKey: string
  lastSeenAt: string | null
  active: boolean
}

export interface PublicTill {
  deviceKey: string
  name: string
  branchId: number
}

export interface PaymentMethodRow {
  id: number
  name: string
  type: 'CASH' | 'KHQR' | 'CARD' | 'OTHER'
  feePercent: number
  enabled: boolean
}

export interface AppSettings {
  receiptHeader: string
  receiptFooter: string
  loyaltyPointsPerUsd: number
  // Store-wide (Settings > System, system.manage to change) — whether a
  // sale can go through at 0/negative stock. Read-only here; written via
  // updateStockPolicy, not updateAppSettings.
  allowOutOfStockSale: boolean
}

export interface ExchangeRateEntry {
  id: number
  rate: number
  setBy: string
  effectiveAt: string
}

export interface Category {
  id: number
  nameEn: string
  nameKm: string
  productCount: number
}

export interface Supplier {
  id: number
  name: string
  phone: string
  contact: string
  paymentTerms: string
  productCount?: number // filled by the list endpoint
}

// STANDARD is a physical item — stock-tracked, can run out. SERVICE is never
// stocked at all (a fee, a delivery charge, an install job) — always
// sellable, never shows a stock number or a low/out-of-stock badge.
export const PRODUCT_TYPES = ['STANDARD', 'SERVICE'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

export interface Product {
  id: number
  parentProductId: number | null // set => this row is a variant of that product
  parentNameEn: string | null
  parentNameKm: string | null
  variantName: string // e.g. "Red / Large" — blank unless parentProductId is set
  variantCount: number // for a non-variant product: how many variants it has
  sku: string
  barcode: string | null
  nameEn: string
  nameKm: string
  categoryId: number | null
  categoryName: string | null
  categoryNameKm: string | null
  supplierId: number | null
  supplierName: string | null
  unit: string
  productType: ProductType
  imageUrl: string
  active: boolean
  priceCents: number
  costCents: number
  qty: number // on hand at the branch the list was requested for — always 0 for a SERVICE product
  reorderPoint: number
  hideWhenOutOfStock: boolean // STANDARD only: disappears from the POS grid once qty <= 0
}

export interface ProductInput {
  nameEn: string
  nameKm: string
  barcode: string
  categoryId: number | null
  unit: string
  productType: ProductType
  imageUrl: string
  active: boolean
  priceCents: number
  costCents: number
  reorderPoint: number
  parentProductId?: number | null // set only when creating/editing a variant
  variantName?: string
  hideWhenOutOfStock: boolean
}

export interface StockMovement {
  id: number
  createdAt: string
  sku: string
  product: string
  productKm: string
  type: string
  qtyChange: number
  balanceAfter: number
  user: string
  reference: string
}

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'

export interface PurchaseOrderItem {
  productId: number
  productName: string
  productNameKm: string
  sku: string
  qtyOrdered: number
  qtyReceived: number
  unitCostCents: number
}

export interface PurchaseOrder {
  id: number
  code: string
  branchId: number
  supplierId: number
  supplierName: string
  status: PurchaseOrderStatus
  note: string
  shippingCents: number
  createdAt: string
  items: PurchaseOrderItem[]
}

export interface PurchaseOrderInput {
  branchId: number
  supplierId: number
  status: string
  note: string
  shippingCents: number
  items: { productId: number; qty: number; unitCostCents: number }[]
}

export interface Customer {
  id: number
  name: string
  phone: string
  tier: 'MEMBER' | 'GOLD'
  points: number
  lastVisit: string | null
}

export interface Expense {
  id: number
  branchId: number
  category: string
  amountCents: number
  expenseDate: string
  note: string
  user: string
}

export const EXPENSE_CATEGORIES = ['WAGES', 'RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'PACKAGING', 'PAYMENT_FEES', 'STOCK_LOSS', 'OTHER']

export interface StaffUser {
  id: number
  fullName: string
  username: string
  phone: string
  roleId: number
  roleName: string
  branchIds: number[]
  active: boolean
  lastActiveAt: string | null
}

export interface Role {
  id: number
  name: string
  description: string
  isLocked: boolean
  maxDiscountPercent: number
  refundWithoutApprovalCents: number
  permissions: string[]
  userCount: number
}

export interface Permission {
  id: number
  key: string
  group: string
  description: string
}

export interface CashMovement {
  id: number
  type: 'PAYOUT' | 'PAYIN'
  amountUsdCents: number
  amountKhrRiel: number
  reason: string
  createdAt: string
}

export interface Shift {
  id: number
  branchId: number
  deviceId: number
  deviceKey: string
  deviceName: string
  userId: number
  cashierName: string
  status: 'OPEN' | 'CLOSED'
  openedAt: string
  closedAt: string | null
  exchangeRate: number
  openingUsdCents: number
  openingKhrRiel: number
  transactions: number
  itemsSold: number
  grossSalesCents: number
  cashSalesCount: number
  cashUsdCents: number
  cashKhrRiel: number
  khqrCents: number
  cardCents: number
  voidedCount: number
  voidedCents: number
  payinUsdCents: number
  payinKhrRiel: number
  payoutUsdCents: number
  payoutKhrRiel: number
  // null while the shift is open for a caller without shift.see_expected
  expectedUsdCents: number | null
  expectedKhrRiel: number | null
  countedUsdCents: number
  countedKhrRiel: number
  diffUsdCents: number
  diffKhrRiel: number
  cashMovements: CashMovement[] | null
}

export interface SaleItem {
  productId: number
  name: string
  nameKm: string
  sku: string
  qty: number
  unitPriceCents: number
  discountCents: number
  note: string
  lineTotalCents: number
}

export interface Sale {
  id: number
  receiptNo: string
  shiftId: number
  branchId: number
  cashier: string
  customerId: number | null
  customerName: string
  status: 'PAID' | 'VOIDED' | 'REFUNDED' | 'PARTIAL_REFUND'
  subtotalCents: number
  discountCents: number
  totalCents: number
  totalRiel: number
  pointsEarned: number
  soldAt: string
  voidReason?: string
  items: SaleItem[]
  payment: {
    method: 'CASH' | 'KHQR' | 'CARD'
    receivedUsdCents: number
    receivedKhrRiel: number
    changeUsdCents: number
    changeKhrRiel: number
    reference: string
  }
}

export interface CreateSaleInput {
  deviceKey: string
  idempotencyKey: string
  customerId: number | null
  items: { productId: number; qty: number; discountCents: number; note: string }[]
  discountCents: number
  payment: { method: 'CASH' | 'KHQR' | 'CARD'; receivedUsdCents: number; receivedKhrRiel: number; reference: string }
}

// ---- Reports ---------------------------------------------------------------

export interface DailyPoint {
  date: string
  netSalesCents: number
  transactions: number
  costCents: number
}

export interface DashboardReport {
  date: string
  exchangeRate: number
  netSalesCents: number
  transactions: number
  lastWeekTransactions: number
  avgBasketCents: number
  lowStockCount: number
  lowStock: { id: number; nameEn: string; nameKm: string; qty: number; reorderPoint: number }[]
  hourly: { hour: number; qty: number }[]
  topProducts: { productId: number; name: string; nameKm: string; qty: number; revenueCents: number }[]
  paymentMix: { method: string; amountCents: number }[]
}

export interface StaffReport {
  series: DailyPoint[]
  totalNetSalesCents: number
  dailyAverageCents: number
  categories: { name: string; nameKm: string; salesCents: number; share: number }[]
  staff: { id: number; fullName: string; roleName: string; active: boolean; shiftStatus: 'Open' | 'Closed' | 'Off'; salesTodayCents: number }[]
  roles: { id: number; name: string; groupCounts: { group: string; granted: number; total: number }[] }[]
}

export interface ProfitLossReport {
  exchangeRate: number
  grossSalesCents: number
  discountCents: number
  returnsCents: number
  netSalesCents: number
  cogsCents: number
  grossProfitCents: number
  expensesByCategory: { category: string; amountCents: number }[]
  totalExpensesCents: number
  netProfitCents: number
  profitByCategory: { name: string; nameKm: string; profitCents: number; share: number }[]
  netProfitByDay: { date: string; netProfitCents: number }[]
}

export interface TransactionRow {
  id: number
  receiptNo: string
  soldAt: string
  cashier: string
  till: string
  items: number
  paymentMethod: string
  totalCents: number
  costCents: number
  status: string
}

export interface TransactionsReport {
  rows: TransactionRow[]
  cashiers: { id: number; name: string }[]
  summary: { count: number; totalCents: number; costCents: number; avgBasketCents: number; refunded: number }
}

export interface ByProductRow {
  productId: number
  sku: string
  name: string
  nameKm: string
  qty: number
  revenueCents: number
  costCents: number
  profitCents: number
  marginPct: number
}

export interface ByCashierRow {
  id: number
  name: string
  shifts: number
  salesCents: number
  transactions: number
  avgBasketCents: number
  voids: number
  refunds: number
  cashDiffCents: number
}

export interface PaymentMethodReportRow {
  method: string
  count: number
  totalCents: number
  share: number
}

export interface VoidRefundRow {
  id: number
  saleId: number
  createdAt: string
  receiptNo: string
  type: 'VOID' | 'REFUND'
  item: string
  amountCents: number
  cashier: string
  approvedBy: string
  reason: string
}

export interface ActivityLogRow {
  id: number
  createdAt: string
  user: string
  role: string
  module: string
  action: string
  entityType: string
  entityId: number | null
  device: string
  ip: string
}

export interface DateRangeParams {
  dateFrom: string
  dateTo: string
}

// ---- Alerts & backups --------------------------------------------------------

// Keep in sync with backend/internal/services/notify_service.go's AllAlertTypes.
export const ALERT_TYPES = [
  'low_stock',
  'shift_opened',
  'shift_closed',
  'sale_completed',
  'void_refund',
  'expense_added',
  'po_received',
  'backup_success',
  'backup_failed',
] as const
export type AlertType = (typeof ALERT_TYPES)[number]

export interface NotifySettings {
  enabled: boolean
  botToken: string
  chatId: string
  alertTypes: AlertType[]
}

export type BackupStatus = 'RUNNING' | 'SUCCESS' | 'FAILED'
export type BackupTriggerType = 'SCHEDULED' | 'MANUAL'

export interface BackupRow {
  id: number
  filename: string
  sizeBytes: number
  status: BackupStatus
  triggerType: BackupTriggerType
  triggeredBy?: string
  error?: string
  startedAt: string
  finishedAt: string | null
  downloadable: boolean
}

export interface BackupSettings {
  autoEnabled: boolean
  retentionDays: number
}

// ---- Document numbering ----------------------------------------------------

export type DocType = 'SALE' | 'EXPENSE' | 'PURCHASE_ORDER'

export interface NumberSequence {
  docType: DocType
  prefix: string
  nextNumber: number
  preview: string
}

// ---- Audit log retention ---------------------------------------------------

export interface ActivityLogRetention {
  retentionMonths: number
}
