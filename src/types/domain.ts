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
  branchName: string
}

export interface PaymentMethodRow {
  id: number
  name: string
  type: 'CASH' | 'KHQR' | 'CARD' | 'OTHER'
  feePercent: number
  enabled: boolean
}

// ---- Tax rates ----------------------------------------------------------------
// Added on top of a POS sale, an invoice, a purchase order or an expense (prices
// are before tax). Settings › Tax rates lists them and where each place starts.

export interface TaxRate {
  id: number
  name: string
  percent: number // 0–100, two decimals
  active: boolean
}

// The rate a new POS sale, invoice, purchase order or expense starts with
// (null: no tax). Staff can change it on each one.
export interface TaxDefaults {
  pos: number | null
  invoice: number | null
  purchase: number | null
  expense: number | null
}

// What a document keeps of the rate it used, so changing or deleting the rate
// later never changes it. taxCents is the tax it came to.
export interface TaxSnapshot {
  taxRateId: number | null
  taxName: string
  taxPercent: number
  taxCents: number
}

export interface AppSettings {
  receiptHeader: string
  receiptFooter: string
  loyaltyPointsPerUsd: number
  // Store-wide (Settings > System, system.manage to change) — whether a
  // sale can go through at 0/negative stock. Read-only here; written via
  // updateStockPolicy, not updateAppSettings.
  allowOutOfStockSale: boolean
  // The customer the POS starts every sale with (null: walk-in). Read-only
  // here too; set from the Customers page via updateDefaultCustomer.
  defaultCustomerId: number | null
  defaultCustomerName: string
  // Where each place's tax starts. Read-only here too; set from Settings ›
  // Tax rates via updateTaxDefaults.
  taxDefaults: TaxDefaults
}

// The company's name and logo (Settings > Company).
export interface Branding {
  companyName: string // '' = the app's default name
  hasLogo: boolean
  logoLink: string // set when the logo is a web link
  logoVersion: string // set when it's an uploaded image; changes with it
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
  referenceType: string
  referenceId: number | null
  note: string
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
  discountCents: number // on the whole line (qty × unit cost)
}

// taxCents: on the items after their discounts plus shipping. It's owed the
// supplier but never part of the stock's cost.
export interface PurchaseOrder extends TaxSnapshot {
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
  taxRateId: number | null
  items: { productId: number; qty: number; unitCostCents: number; discountCents: number }[]
}

export interface Customer {
  id: number
  name: string
  phone: string
  tier: 'MEMBER' | 'GOLD'
  points: number
  lastVisit: string | null
}

export interface Expense extends TaxSnapshot {
  id: number
  code: string
  branchId: number
  category: string
  amountCents: number // before tax
  totalCents: number // with tax: what was paid
  expenseDate: string
  note: string // rich text (HTML)
  user: string
}

export const EXPENSE_CATEGORIES = ['WAGES', 'RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'PACKAGING', 'PAYMENT_FEES', 'STOCK_LOSS', 'OTHER']

export interface StaffUser {
  id: number
  fullName: string
  username: string
  phone: string
  // Their main role: the one they hold at every branch not in branchRoles.
  roleId: number
  roleName: string
  // Only the branches the viewer can see; hasOtherBranches says there are more.
  branchIds: number[]
  branchRoles: BranchRole[]
  hasOtherBranches: boolean
  active: boolean
  lastActiveAt: string | null
}

// A role a user holds at one branch instead of their main role.
export interface BranchRole {
  branchId: number
  roleId: number
  roleName: string
}

export interface Role {
  id: number
  name: string
  description: string
  // The branch the role belongs to; null when every branch shares it.
  branchId: number | null
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

// taxCents: on the lines after every discount; totalCents includes it.
export interface Sale extends TaxSnapshot {
  id: number
  receiptNo: string
  shiftId: number
  branchId: number
  cashier: string
  customerId: number | null
  customerName: string
  status: 'PAID' | 'VOIDED' | 'REFUNDED' | 'PARTIAL_REFUND'
  shiftStatus: 'OPEN' | 'CLOSED' | ''
  subtotalCents: number
  discountCents: number
  totalCents: number
  totalRiel: number
  exchangeRate: number // the sale's own riel rate; an edit keeps it
  pointsEarned: number
  soldAt: string
  voidReason?: string
  note: string // the sale's own note, rich text (HTML)
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
  // Payment for QR table orders (one, or a whole table): the server marks them PAID.
  tableOrderIds?: number[]
  // Added on top of the discounted amount; null for no tax.
  taxRateId: number | null
  note: string // rich text (HTML)
}

// ---- Invoices (back-office sales, paid over time) ---------------------------

export type InvoicePaymentStatus = 'DUE' | 'PENDING' | 'PAID'

export interface InvoiceItem {
  productId: number
  nameEn: string
  nameKm: string
  sku: string
  qty: number
  unitPriceCents: number
  discountCents: number // on the whole line
  lineTotalCents: number
  note: string
}

export interface InvoicePayment {
  id: number
  paidOn: string
  methodName: string
  methodType: 'CASH' | 'KHQR' | 'CARD' | 'OTHER'
  amountCents: number
  reference: string
  note: string
  attachment: string | null // https link or an image data URL
  user: string
  createdAt: string
}

// taxCents: on the lines after discounts plus shipping; totalCents includes it.
export interface Invoice extends TaxSnapshot {
  id: number
  code: string
  branchId: number
  customerId: number
  customerName: string
  customerPhone: string
  invoiceDate: string
  dueDate: string | null
  status: 'OPEN' | 'CANCELLED'
  paymentStatus: InvoicePaymentStatus
  subtotalCents: number
  lineDiscountCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
  paidCents: number
  balanceCents: number
  exchangeRate: number
  itemCount: number
  note: string
  cancelReason: string
  createdBy: string
  createdAt: string
  items?: InvoiceItem[] // detail only
  payments?: InvoicePayment[] // detail only
}

export interface InvoiceSummary {
  count: number
  totalCents: number
  paidCents: number
  balanceCents: number
  overdue: number
}

export interface InvoiceInput {
  branchId: number
  customerId: number
  invoiceDate: string
  dueDate: string
  items: { productId: number; qty: number; unitPriceCents: number; discountCents: number; note: string }[]
  discountCents: number
  shippingCents: number
  taxRateId: number | null
  note: string // rich text (HTML)
  payment?: InvoicePaymentInput // money received now (create only)
}

export interface InvoicePaymentInput {
  paidOn: string
  methodName: string
  methodType: 'CASH' | 'KHQR' | 'CARD' | 'OTHER'
  amountCents: number
  reference: string
  note: string
  attachment: string
}

// ---- QR table ordering -------------------------------------------------------

export type TableOrderStatus = 'NEW' | 'ACCEPTED' | 'PAID' | 'CANCELLED'

export interface DiningTable {
  id: number
  branchId: number
  name: string
  token: string // the only thing in the printed QR
  active: boolean
  openOrders: number
}

// A table as the POS Tables board sees it (no QR token).
export interface TableBoardEntry {
  id: number
  name: string
  active: boolean
}

export interface TableOrderItem {
  productId: number
  nameEn: string
  nameKm: string
  qty: number
  unitPriceCents: number
  note: string
}

export interface TableOrder {
  id: number
  branchId: number
  tableId: number | null
  tableName: string
  status: TableOrderStatus
  note: string
  totalCents: number
  saleId: number | null
  receiptNo: string
  handledBy: string
  cancelReason: string
  acceptedAt: string | null
  closedAt: string | null
  createdAt: string
  items: TableOrderItem[]
}

// What a customer sees on the table's QR menu (no cost or stock counts).
export interface MenuItem {
  id: number
  parentProductId: number | null
  variantName: string
  variantCount: number
  nameEn: string
  nameKm: string
  categoryId: number | null
  categoryName: string | null
  categoryNameKm: string | null
  imageUrl: string
  unit: string
  priceCents: number
  available: boolean
}

export interface TableMenu {
  table: { name: string }
  branch: { name: string }
  storeName: string
  exchangeRate: number
  items: MenuItem[]
}

export interface PublicTableOrder {
  token: string
  tableName: string
  status: TableOrderStatus
  note: string
  totalCents: number
  cancelReason: string
  createdAt: string
  items: { nameEn: string; nameKm: string; qty: number; unitPriceCents: number; note: string }[]
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
  // Net sales split by where they came from (invoices count on their invoice date).
  posSalesCents: number
  invoiceSalesCents: number
  invoiceCount: number
  // Tax added on top, kept out of every figure above: collected on sales and
  // invoices, paid on expenses and purchase orders received in the period.
  tax: { collectedCents: number; posCents: number; invoiceCents: number; paidCents: number; expenseCents: number; purchaseCents: number }
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

// What a company can be told about its own branches: backend's
// CompanyAlertTypes (notify_service.go), less table_order, which this list
// has never offered.
export const COMPANY_ALERT_TYPES = [
  'low_stock',
  'shift_opened',
  'shift_closed',
  'sale_completed',
  'void_refund',
  'expense_added',
  'po_received',
] as const
// ...and PlatformAlertTypes: the super admin's, about the whole install.
export const PLATFORM_ALERT_TYPES = ['backup_success', 'backup_failed'] as const
export type AlertType = (typeof COMPANY_ALERT_TYPES)[number] | (typeof PLATFORM_ALERT_TYPES)[number]

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

// ---- Companies (the super admin's platform pages) --------------------------

export interface CompanyOwner {
  id: number
  fullName: string
  username: string
  active: boolean
}

export interface Company {
  id: number
  name: string
  code: string
  active: boolean
  // Not deleted, and of those the active ones, which the limits count.
  branchCount: number
  activeBranchCount: number
  // The most active branches and user accounts; null is no limit.
  maxBranches: number | null
  userCount: number
  activeUserCount: number
  maxUsers: number | null
  // How long the company keeps its activity log. The super admin sets it.
  retentionMonths: number
  owners: CompanyOwner[]
  createdAt: string
}

// One of a company's branches or user accounts, as the super admin switches
// it on and off.
export interface CompanyBranch {
  id: number
  code: string
  name: string
  active: boolean
}

export interface CompanyUser {
  id: number
  fullName: string
  username: string
  roleName: string
  active: boolean
}

// ---- Document numbering ----------------------------------------------------

export type DocType = 'SALE' | 'EXPENSE' | 'PURCHASE_ORDER' | 'INVOICE'

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
