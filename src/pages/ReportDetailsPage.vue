<script setup lang="ts">
import Pagination from '@/components/Pagination.vue'
import { computed, ref } from 'vue'
import { Download, FileText, Printer, RotateCcw } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useDateRangeQuery } from '@/composables/useDateRangeQuery'
import { reportTypes, useReportDetails } from '@/composables/useReportDetails'
import { formatDateTime, formatKHR, formatUSD } from '@/utils/format'
import { drawerStatus } from '@/utils/money'
import * as posApi from '@/api/pos'
import * as reportsApi from '@/api/reports'
import type {
  ActivityLogRow,
  ByCashierRow,
  ByProductRow,
  Expense,
  PaymentMethodReportRow,
  PurchaseOrder,
  Sale,
  Shift,
  StockMovement,
  TransactionRow,
  VoidRefundRow,
} from '@/types/domain'
import StatusBadge from '@/components/StatusBadge.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import DateRangePicker from '@/components/DateRangePicker.vue'
import Modal from '@/components/Modal.vue'
import { useToast } from '@/composables/useToast'
import { i18n, label, localName } from '@/i18n'

const auth = useAuthStore()
const toast = useToast()
const { range } = useDateRangeQuery()
const branchId = computed(() => auth.activeBranchId ?? auth.branches[0]?.id ?? 1)

const {
  loading,
  selected,
  cashierFilter,
  paymentFilter,
  search,
  page,
  perPage,
  total,
  totalPages,
  resetFilters,
  cashiers,
  summary,
  transactionRows,
  byProductRows,
  byCashierRows,
  paymentRows,
  voidsRefunds,
  stockMovements,
  purchaseOrderRows,
  expenseRows,
  activityLog,
  totalsByReport,
} = useReportDetails(range, branchId)

const statusTone: Record<string, 'success' | 'danger' | 'warning'> = { PAID: 'success', VOIDED: 'danger', REFUNDED: 'warning', PARTIAL_REFUND: 'warning' }
const poStatusTone: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { RECEIVED: 'success', PARTIAL: 'warning', SENT: 'neutral', DRAFT: 'neutral', CANCELLED: 'danger' }
function poItemCount(po: PurchaseOrder) {
  return po.items.reduce((sum, i) => sum + i.qtyOrdered, 0)
}
function poItemsCostCents(po: PurchaseOrder) {
  return po.items.reduce((sum, i) => sum + i.qtyOrdered * i.unitCostCents, 0)
}
function poTotalCostCents(po: PurchaseOrder) {
  return poItemsCostCents(po) + po.shippingCents
}
const t = i18n.global.t
const reportName = (id: string) => t(`reportDetails.types.${id}.label`)

const cashierOptions = computed(() => [{ value: 'all', label: t('reportDetails.allCashiers') }, ...cashiers.value.map((c) => ({ value: c.id, label: c.name }))])
const paymentOptions = computed(() => [
  { value: 'all', label: t('reportDetails.allMethods') },
  { value: 'CASH', label: label('method', 'CASH') },
  { value: 'KHQR', label: label('method', 'KHQR') },
  { value: 'CARD', label: label('method', 'CARD') },
])

function exportAs(kind: string) {
  toast.success(t('reportDetails.exported', { report: reportName(selected.value), kind }))
}

// "Created · Product #5" — the audit trail's action + entity in the current language.
function auditAction(action: string, entityType: string, entityId: number | null) {
  const verb = label('audit.verb', action.split('.').pop() ?? action)
  const entity = label('audit.entity', entityType)
  return `${verb} · ${entity}${entityId ? ` #${entityId}` : ''}`
}

function printPage() {
  window.print()
}

// --- Detail modal ------------------------------------------------------------
// One modal, shared by every report: click a row and see everything that row
// doesn't have room for. Three shapes of content:
//  - 'sale': the full sale (fetched by id) — Transactions and Voids & refunds
//    both land here, since a void/refund is always about one sale.
//  - a small drill-down LIST fetched on click ('product-sales', 'method-sales'
//    list matching transactions; 'cashier-shifts' lists a cashier's shifts) —
//    each row in those lists can itself be clicked through to 'sale'.
//  - the rest (stock movement, purchase order, expense, activity log) need no
//    fetch — the row already has everything, just laid out as a detail.
type DetailMode = 'sale' | 'product-sales' | 'method-sales' | 'cashier-shifts' | 'stock-movement' | 'po' | 'expense' | 'activity' | null
const detailMode = ref<DetailMode>(null)
const detailTitle = ref('')
const detailSubtitle = ref('')
const detailLoading = ref(false)

const detailSale = ref<Sale | null>(null)
const detailTransactionRows = ref<TransactionRow[]>([])
const detailShifts = ref<Shift[]>([])
const detailStockMovement = ref<StockMovement | null>(null)
const detailPO = ref<PurchaseOrder | null>(null)
const detailExpense = ref<Expense | null>(null)
const detailActivity = ref<ActivityLogRow | null>(null)

function closeDetail() {
  detailMode.value = null
  detailSubtitle.value = ''
  detailSale.value = null
  detailTransactionRows.value = []
  detailShifts.value = []
  detailStockMovement.value = null
  detailPO.value = null
  detailExpense.value = null
  detailActivity.value = null
}

async function openSaleDetail(saleId: number, title: string, subtitle = '') {
  detailMode.value = 'sale'
  detailTitle.value = title
  detailSubtitle.value = subtitle
  detailSale.value = null
  detailLoading.value = true
  try {
    detailSale.value = await posApi.getSale(branchId.value, saleId)
  } catch {
    closeDetail() // the API client already toasted the reason
  } finally {
    detailLoading.value = false
  }
}
function openTransactionDetail(row: TransactionRow) {
  openSaleDetail(row.id, row.receiptNo, `${t('col.till')}: ${row.till}`)
}
function openVoidDetail(row: VoidRefundRow) {
  openSaleDetail(row.saleId, row.receiptNo)
}

async function openProductSales(row: ByProductRow) {
  detailMode.value = 'product-sales'
  detailTitle.value = localName(row.name, row.nameKm)
  detailTransactionRows.value = []
  detailLoading.value = true
  try {
    const res = await reportsApi.getTransactions({
      branchId: branchId.value, dateFrom: range.value.from, dateTo: range.value.to,
      productId: row.productId, page: 1, perPage: 50,
    })
    detailTransactionRows.value = res.data.rows
  } catch {
    closeDetail()
  } finally {
    detailLoading.value = false
  }
}
async function openMethodSales(row: PaymentMethodReportRow) {
  detailMode.value = 'method-sales'
  detailTitle.value = label('method', row.method)
  detailTransactionRows.value = []
  detailLoading.value = true
  try {
    const res = await reportsApi.getTransactions({
      branchId: branchId.value, dateFrom: range.value.from, dateTo: range.value.to,
      payment: row.method, page: 1, perPage: 50,
    })
    detailTransactionRows.value = res.data.rows
  } catch {
    closeDetail()
  } finally {
    detailLoading.value = false
  }
}
async function openCashierShifts(row: ByCashierRow) {
  detailMode.value = 'cashier-shifts'
  detailTitle.value = row.name
  detailShifts.value = []
  detailLoading.value = true
  try {
    const res = await posApi.pageShifts(branchId.value, { userId: row.id, dateFrom: range.value.from, dateTo: range.value.to, page: 1, perPage: 50 })
    detailShifts.value = res.data
  } catch {
    closeDetail()
  } finally {
    detailLoading.value = false
  }
}

function openStockMovementDetail(row: StockMovement) {
  detailMode.value = 'stock-movement'
  detailTitle.value = localName(row.product, row.productKm)
  detailStockMovement.value = row
}
function openPODetail(row: PurchaseOrder) {
  detailMode.value = 'po'
  detailTitle.value = row.code
  detailPO.value = row
}
function openExpenseDetail(row: Expense) {
  detailMode.value = 'expense'
  detailTitle.value = label('expenseCat', row.category)
  detailExpense.value = row
}
function openActivityDetail(row: ActivityLogRow) {
  detailMode.value = 'activity'
  detailTitle.value = auditAction(row.action, row.entityType, row.entityId)
  detailActivity.value = row
}

function shiftStatus(s: Shift) {
  if (s.status === 'OPEN') return { tone: 'success' as const, label: label('shiftStatus', 'OPEN') }
  return drawerStatus(s.diffUsdCents, s.diffKhrRiel, s.exchangeRate)
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl">{{ $t('reportDetails.title') }}</h1>
        <p class="text-muted text-sm">{{ auth.branches.find((b) => b.id === auth.activeBranchId)?.name }}</p>
      </div>
      <DateRangePicker v-model="range" />
    </div>

    <div class="card flex flex-wrap items-end gap-3">
      <SearchableSelect v-model="cashierFilter" :label="$t('common.cashier')" class="w-44" :options="cashierOptions" :clearable="false" />
      <SearchableSelect v-model="paymentFilter" :label="$t('reportDetails.payment')" class="w-40" :options="paymentOptions" :searchable="false" :clearable="false" />
      <div class="flex-1 min-w-[160px]">
        <label class="block text-xs text-muted mb-1">{{ $t('reportDetails.searchLabel') }}</label>
        <input v-model="search" type="search" :placeholder="$t('reportDetails.receiptPlaceholder')" class="input" />
      </div>
      <button type="button" class="btn-secondary flex items-center gap-2" @click="resetFilters">
        <RotateCcw :stroke-width="1.8" class="w-4 h-4" /> {{ $t('reportDetails.reset') }}
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div class="card lg:col-span-1 space-y-1 h-fit">
        <button
          v-for="rt in reportTypes"
          :key="rt"
          type="button"
          class="w-full text-left px-3 py-2 rounded-control transition"
          :class="selected === rt ? 'bg-primary-tint text-primary-tint-text' : 'hover:bg-surface-subtle'"
          @click="selected = rt"
        >
          <p class="text-sm font-medium">{{ reportName(rt) }}</p>
          <p class="text-xs text-muted">{{ $t(`reportDetails.types.${rt}.desc`) }}</p>
        </button>
      </div>

      <div class="lg:col-span-3 space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div v-for="tile in totalsByReport" :key="tile.label" class="card py-3">
            <p class="text-xs text-muted">{{ tile.label }}</p>
            <p class="font-mono text-lg mt-1">{{ tile.value }}</p>
          </div>
        </div>

        <div class="card">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 class="font-heading text-base">{{ reportName(selected) }}</h2>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn-secondary flex items-center gap-1 px-3 py-1.5 text-sm" @click="exportAs('Excel')">
                <Download :stroke-width="1.8" class="w-3.5 h-3.5" /> Excel
              </button>
              <button type="button" class="btn-secondary flex items-center gap-1 px-3 py-1.5 text-sm" @click="exportAs('PDF')">
                <FileText :stroke-width="1.8" class="w-3.5 h-3.5" /> PDF
              </button>
              <button type="button" class="btn-secondary flex items-center gap-1 px-3 py-1.5 text-sm" @click="printPage">
                <Printer :stroke-width="1.8" class="w-3.5 h-3.5" /> {{ $t('common.print') }}
              </button>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table v-if="selected === 'transactions'" class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th class="py-2 font-medium">{{ $t('col.receipt') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.date') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.cashier') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.till') }}</th>
                  <th class="py-2 pr-4 font-medium text-right">{{ $t('col.items') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.payment') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.total') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.profit') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in transactionRows"
                  :key="row.id"
                  class="border-b border-line last:border-0 cursor-pointer hover:bg-surface-subtle"
                  @click="openTransactionDetail(row)"
                >
                  <td class="py-2 font-mono text-xs">{{ row.receiptNo }}</td>
                  <td class="py-2 font-mono text-xs">{{ formatDateTime(row.soldAt) }}</td>
                  <td class="py-2">{{ row.cashier }}</td>
                  <td class="py-2">{{ row.till }}</td>
                  <td class="py-2 pr-4 text-right font-mono">{{ row.items }}</td>
                  <td class="py-2">{{ label('method', row.paymentMethod) }}</td>
                  <td class="py-2 text-right font-mono">{{ formatUSD(row.totalCents) }}</td>
                  <td class="py-2 text-right font-mono">{{ formatUSD(row.totalCents - row.costCents) }}</td>
                  <td class="py-2"><StatusBadge :tone="statusTone[row.status]" :label="label('saleStatus', row.status)" /></td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="font-medium border-t border-line">
                  <td class="py-2" colspan="6">{{ $t('common.total') }}</td>
                  <td class="py-2 text-right font-mono">{{ formatUSD(summary?.totalCents ?? 0) }}</td>
                  <td class="py-2 text-right font-mono">{{ formatUSD((summary?.totalCents ?? 0) - (summary?.costCents ?? 0)) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            <table v-else-if="selected === 'by-product'" class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th class="py-2 font-medium">{{ $t('col.sku') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.product') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.qty') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.sales') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.cost') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.profit') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.margin') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in byProductRows" :key="r.sku" class="border-b border-line last:border-0 cursor-pointer hover:bg-surface-subtle" @click="openProductSales(r)">
                  <td class="py-2 font-mono text-xs">{{ r.sku }}</td>
                  <td class="py-2">{{ localName(r.name, r.nameKm) }}</td>
                  <td class="py-2 text-right font-mono">{{ r.qty }}</td>
                  <td class="py-2 text-right font-mono">{{ formatUSD(r.revenueCents) }}</td>
                  <td class="py-2 text-right font-mono">{{ formatUSD(r.costCents) }}</td>
                  <td class="py-2 text-right font-mono">{{ formatUSD(r.profitCents) }}</td>
                  <td class="py-2 text-right font-mono">{{ r.marginPct }}%</td>
                </tr>
              </tbody>
            </table>

            <table v-else-if="selected === 'by-cashier'" class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th class="py-2 font-medium">{{ $t('col.cashier') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.shifts') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.netSales') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.avgBasket') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.voids') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.refunds') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.cashDiff') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in byCashierRows" :key="r.id" class="border-b border-line last:border-0 cursor-pointer hover:bg-surface-subtle" @click="openCashierShifts(r)">
                  <td class="py-2">{{ r.name }}</td>
                  <td class="py-2 text-right font-mono">{{ r.shifts }}</td>
                  <td class="py-2 text-right font-mono">{{ formatUSD(r.salesCents) }}</td>
                  <td class="py-2 text-right font-mono">{{ formatUSD(r.avgBasketCents) }}</td>
                  <td class="py-2 text-right font-mono">{{ r.voids }}</td>
                  <td class="py-2 text-right font-mono">{{ r.refunds }}</td>
                  <td class="py-2 text-right font-mono" :class="r.cashDiffCents < 0 ? 'text-danger-strong' : ''">{{ formatUSD(r.cashDiffCents) }}</td>
                </tr>
              </tbody>
            </table>

            <table v-else-if="selected === 'payment-methods'" class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th class="py-2 font-medium">{{ $t('col.method') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.transactions') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.amount') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.share') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in paymentRows" :key="r.method" class="border-b border-line last:border-0 cursor-pointer hover:bg-surface-subtle" @click="openMethodSales(r)">
                  <td class="py-2">{{ label('method', r.method) }}</td>
                  <td class="py-2 text-right font-mono">{{ r.count }}</td>
                  <td class="py-2 text-right font-mono">{{ formatUSD(r.totalCents) }}</td>
                  <td class="py-2 text-right font-mono">{{ Math.round(r.share * 100) }}%</td>
                </tr>
              </tbody>
            </table>

            <table v-else-if="selected === 'voids-refunds'" class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th class="py-2 font-medium">{{ $t('col.date') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.receipt') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.type') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.item') }}</th>
                  <th class="py-2 pr-4 font-medium text-right">{{ $t('col.amount') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.cashier') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.approvedBy') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.reason') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in voidsRefunds" :key="r.id" class="border-b border-line last:border-0 cursor-pointer hover:bg-surface-subtle" @click="openVoidDetail(r)">
                  <td class="py-2 font-mono text-xs">{{ formatDateTime(r.createdAt) }}</td>
                  <td class="py-2 font-mono text-xs">{{ r.receiptNo }}</td>
                  <td class="py-2">{{ label('voidType', r.type) }}</td>
                  <td class="py-2">{{ r.item }}</td>
                  <td class="py-2 pr-4 text-right font-mono">{{ formatUSD(r.amountCents) }}</td>
                  <td class="py-2">{{ r.cashier }}</td>
                  <td class="py-2">{{ r.approvedBy }}</td>
                  <td class="py-2 text-muted">{{ r.reason }}</td>
                </tr>
              </tbody>
            </table>

            <table v-else-if="selected === 'stock-movements'" class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th class="py-2 font-medium">{{ $t('col.date') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.sku') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.product') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.type') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.qty') }}</th>
                  <th class="py-2 pr-4 font-medium text-right">{{ $t('col.balance') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.user') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.reference') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in stockMovements" :key="m.id" class="border-b border-line last:border-0 cursor-pointer hover:bg-surface-subtle" @click="openStockMovementDetail(m)">
                  <td class="py-2 font-mono text-xs">{{ formatDateTime(m.createdAt) }}</td>
                  <td class="py-2 font-mono text-xs">{{ m.sku }}</td>
                  <td class="py-2">{{ localName(m.product, m.productKm) }}</td>
                  <td class="py-2">{{ label('moveType', m.type) }}</td>
                  <td class="py-2 text-right font-mono">{{ m.qtyChange > 0 ? '+' : '' }}{{ m.qtyChange }}</td>
                  <td class="py-2 pr-4 text-right font-mono">{{ m.balanceAfter }}</td>
                  <td class="py-2">{{ m.user }}</td>
                  <td class="py-2 font-mono text-xs">{{ m.reference }}</td>
                </tr>
              </tbody>
            </table>

            <table v-else-if="selected === 'purchase-orders'" class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th class="py-2 font-medium">{{ $t('col.po') }}</th>
                  <th class="py-2 font-medium">{{ $t('common.supplier') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.items') }}</th>
                  <th class="py-2 pr-4 font-medium text-right">{{ $t('col.totalCost') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.created') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="po in purchaseOrderRows" :key="po.id" class="border-b border-line last:border-0 cursor-pointer hover:bg-surface-subtle" @click="openPODetail(po)">
                  <td class="py-2 font-mono text-xs">{{ po.code }}</td>
                  <td class="py-2">{{ po.supplierName }}</td>
                  <td class="py-2 text-right font-mono">{{ poItemCount(po) }}</td>
                  <td class="py-2 pr-4 text-right font-mono">{{ formatUSD(poTotalCostCents(po)) }}</td>
                  <td class="py-2 font-mono text-xs">{{ po.createdAt }}</td>
                  <td class="py-2"><StatusBadge :tone="poStatusTone[po.status]" :label="label('poStatus', po.status)" /></td>
                </tr>
              </tbody>
            </table>

            <table v-else-if="selected === 'expenses'" class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th class="py-2 font-medium">{{ $t('col.date') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.category') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.note') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.addedBy') }}</th>
                  <th class="py-2 pr-4 font-medium text-right">{{ $t('col.amount') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="e in expenseRows" :key="e.id" class="border-b border-line last:border-0 cursor-pointer hover:bg-surface-subtle" @click="openExpenseDetail(e)">
                  <td class="py-2 font-mono text-xs">{{ e.expenseDate }}</td>
                  <td class="py-2">{{ label('expenseCat', e.category) }}</td>
                  <td class="py-2 text-muted">{{ e.note }}</td>
                  <td class="py-2">{{ e.user }}</td>
                  <td class="py-2 pr-4 text-right font-mono">{{ formatUSD(e.amountCents) }}</td>
                </tr>
              </tbody>
            </table>

            <table v-else class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th class="py-2 font-medium">{{ $t('col.time') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.user') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.role') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.module') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.action') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.device') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in activityLog" :key="a.id" class="border-b border-line last:border-0 cursor-pointer hover:bg-surface-subtle" @click="openActivityDetail(a)">
                  <td class="py-2 font-mono text-xs">{{ formatDateTime(a.createdAt) }}</td>
                  <td class="py-2">{{ a.user }}</td>
                  <td class="py-2 text-muted">{{ label('role', a.role) }}</td>
                  <td class="py-2">{{ label('audit.module', a.module) }}</td>
                  <td class="py-2">{{ auditAction(a.action, a.entityType, a.entityId) }}</td>
                  <td class="py-2 text-muted max-w-[180px] truncate" :title="a.device">{{ a.device }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="loading" class="text-center text-sm text-muted py-4">{{ $t('common.loading') }}</p>

          <Pagination
            v-if="selected !== 'payment-methods'"
            v-model:page="page"
            :total-pages="totalPages"
            :total="total"
            :per-page="perPage"
            :noun="$t(`reportDetails.nouns.${selected}`)"
          />
        </div>
      </div>
    </div>

    <!-- Detail modal: shape depends on detailMode, see the script for why. -->
    <Modal v-if="detailMode" :title="detailTitle" @close="closeDetail">
      <p v-if="detailSubtitle" class="text-muted text-xs -mt-2 mb-3">{{ detailSubtitle }}</p>
      <div v-if="detailLoading" class="text-center text-sm text-muted py-8">{{ $t('common.loading') }}</div>

      <!-- One sale, in full (Transactions + Voids & refunds land here) -->
      <div v-else-if="detailMode === 'sale' && detailSale" class="space-y-4 text-sm">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-muted text-xs">{{ formatDateTime(detailSale.soldAt) }}</p>
            <p class="text-muted text-xs">{{ $t('col.cashier') }}: {{ detailSale.cashier }}</p>
          </div>
          <StatusBadge :tone="statusTone[detailSale.status]" :label="label('saleStatus', detailSale.status)" />
        </div>

        <div class="border-t border-line pt-3 space-y-1">
          <div v-for="item in detailSale.items" :key="item.productId" class="flex justify-between">
            <span>{{ item.qty }}× {{ localName(item.name, item.nameKm) }}</span>
            <span class="font-mono">{{ formatUSD(item.lineTotalCents) }}</span>
          </div>
        </div>

        <div class="border-t border-line pt-3 space-y-1">
          <div class="flex justify-between"><span class="text-muted">{{ $t('pos.subtotal') }}</span><span class="font-mono">{{ formatUSD(detailSale.subtotalCents) }}</span></div>
          <div v-if="detailSale.discountCents > 0" class="flex justify-between">
            <span class="text-muted">{{ $t('pos.discount') }}</span><span class="font-mono">-{{ formatUSD(detailSale.discountCents) }}</span>
          </div>
          <div class="flex justify-between font-medium"><span>{{ $t('pos.total') }}</span><span class="font-mono">{{ formatUSD(detailSale.totalCents) }} ({{ formatKHR(detailSale.totalRiel) }})</span></div>
        </div>

        <div class="border-t border-line pt-3 space-y-1">
          <div class="flex justify-between"><span class="text-muted">{{ $t('pos.paidBy') }}</span><span>{{ label('method', detailSale.payment.method) }}</span></div>
          <template v-if="detailSale.payment.method === 'CASH'">
            <div class="flex justify-between">
              <span class="text-muted">{{ $t('pos.tendered') }}</span>
              <span class="font-mono">{{ formatUSD(detailSale.payment.receivedUsdCents) }}{{ detailSale.payment.receivedKhrRiel ? ` + ${formatKHR(detailSale.payment.receivedKhrRiel)}` : '' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">{{ $t('pos.change') }}</span>
              <span class="font-mono">{{ formatUSD(detailSale.payment.changeUsdCents) }} + {{ formatKHR(detailSale.payment.changeKhrRiel) }}</span>
            </div>
          </template>
          <div v-if="detailSale.payment.reference" class="flex justify-between"><span class="text-muted">{{ $t('common.note') }}</span><span>{{ detailSale.payment.reference }}</span></div>
        </div>

        <div v-if="detailSale.customerName" class="border-t border-line pt-3 space-y-1">
          <div class="flex justify-between"><span class="text-muted">{{ $t('pos.customer') }}</span><span>{{ detailSale.customerName }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('pos.pointsEarned') }}</span><span>+{{ detailSale.pointsEarned }}</span></div>
        </div>

        <div v-if="detailSale.voidReason" class="border-t border-line pt-3">
          <p class="text-muted">{{ $t('common.reason') }}</p>
          <p>{{ detailSale.voidReason }}</p>
        </div>

        <div class="flex justify-end pt-2">
          <button type="button" class="btn-secondary" @click="closeDetail">{{ $t('common.close') }}</button>
        </div>
      </div>

      <!-- Matching sales list (By product / Payment methods drill-down) -->
      <div v-else-if="detailMode === 'product-sales' || detailMode === 'method-sales'" class="space-y-3">
        <p class="text-xs text-muted">{{ $t('reportDetails.detail.matchingSales') }}</p>
        <p v-if="detailTransactionRows.length === 0" class="text-center text-sm text-muted py-8">{{ $t('reportDetails.detail.empty') }}</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.receipt') }}</th>
              <th class="py-2 font-medium">{{ $t('col.date') }}</th>
              <th class="py-2 font-medium">{{ $t('col.cashier') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('col.total') }}</th>
              <th class="py-2 font-medium">{{ $t('col.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in detailTransactionRows"
              :key="row.id"
              class="border-b border-line last:border-0 cursor-pointer hover:bg-surface-subtle"
              @click="openTransactionDetail(row)"
            >
              <td class="py-2 font-mono text-xs">{{ row.receiptNo }}</td>
              <td class="py-2 font-mono text-xs">{{ formatDateTime(row.soldAt) }}</td>
              <td class="py-2">{{ row.cashier }}</td>
              <td class="py-2 text-right font-mono">{{ formatUSD(row.totalCents) }}</td>
              <td class="py-2"><StatusBadge :tone="statusTone[row.status]" :label="label('saleStatus', row.status)" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- A cashier's shifts (By cashier drill-down) -->
      <div v-else-if="detailMode === 'cashier-shifts'" class="space-y-3">
        <p v-if="detailShifts.length === 0" class="text-center text-sm text-muted py-8">{{ $t('reportDetails.detail.empty') }}</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.till') }}</th>
              <th class="py-2 font-medium">{{ $t('col.opened') }}</th>
              <th class="py-2 font-medium">{{ $t('col.closed') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('shifts.grossSales') }}</th>
              <th class="py-2 font-medium">{{ $t('col.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in detailShifts" :key="s.id" class="border-b border-line last:border-0">
              <td class="py-2">{{ s.deviceName }}</td>
              <td class="py-2 font-mono text-xs">{{ formatDateTime(s.openedAt) }}</td>
              <td class="py-2 font-mono text-xs">{{ formatDateTime(s.closedAt) }}</td>
              <td class="py-2 text-right font-mono">{{ formatUSD(s.grossSalesCents) }}</td>
              <td class="py-2"><StatusBadge :tone="shiftStatus(s).tone" :label="shiftStatus(s).label" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Stock movement (no more data than the row — just laid out) -->
      <div v-else-if="detailMode === 'stock-movement' && detailStockMovement" class="space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.date') }}</span><span class="font-mono">{{ formatDateTime(detailStockMovement.createdAt) }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.sku') }}</span><span class="font-mono">{{ detailStockMovement.sku }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.type') }}</span><span>{{ label('moveType', detailStockMovement.type) }}</span></div>
        <div class="flex justify-between">
          <span class="text-muted">{{ $t('col.qtyChange') }}</span>
          <span class="font-mono">{{ detailStockMovement.qtyChange > 0 ? '+' : '' }}{{ detailStockMovement.qtyChange }}</span>
        </div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.balance') }}</span><span class="font-mono">{{ detailStockMovement.balanceAfter }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.user') }}</span><span>{{ detailStockMovement.user }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.reference') }}</span><span class="font-mono">{{ detailStockMovement.reference }}</span></div>
      </div>

      <!-- Purchase order, with line items -->
      <div v-else-if="detailMode === 'po' && detailPO" class="space-y-4 text-sm">
        <div class="flex items-center justify-between text-muted">
          <span>{{ detailPO.supplierName }}</span>
          <StatusBadge :tone="poStatusTone[detailPO.status]" :label="label('poStatus', detailPO.status)" />
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
            <tr v-for="(item, idx) in detailPO.items" :key="idx" class="border-b border-line last:border-0">
              <td class="py-2">{{ localName(item.productName, item.productNameKm) }}</td>
              <td class="py-2 text-right font-mono">{{ item.qtyOrdered }}</td>
              <td class="py-2 text-right font-mono">{{ formatUSD(item.unitCostCents) }}</td>
              <td class="py-2 pr-1 text-right font-mono">{{ formatUSD(item.qtyOrdered * item.unitCostCents) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="detailPO.note" class="text-muted">{{ detailPO.note }}</p>
        <div class="space-y-1 pt-2 border-t border-line">
          <div class="flex justify-between"><span class="text-muted">{{ $t('inventory.items') }}</span><span class="font-mono">{{ formatUSD(poItemsCostCents(detailPO)) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('inventory.shipping') }}</span><span class="font-mono">{{ formatUSD(detailPO.shippingCents) }}</span></div>
          <div class="flex justify-between items-center"><span class="text-muted">{{ $t('inventory.totalCost') }}</span><span class="font-mono font-medium">{{ formatUSD(poTotalCostCents(detailPO)) }}</span></div>
        </div>
      </div>

      <!-- Expense -->
      <div v-else-if="detailMode === 'expense' && detailExpense" class="space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.date') }}</span><span class="font-mono">{{ detailExpense.expenseDate }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('common.category') }}</span><span>{{ label('expenseCat', detailExpense.category) }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('common.amount') }}</span><span class="font-mono">{{ formatUSD(detailExpense.amountCents) }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.addedBy') }}</span><span>{{ detailExpense.user }}</span></div>
        <div v-if="detailExpense.note" class="pt-2 border-t border-line">
          <p class="text-muted">{{ $t('common.note') }}</p>
          <p>{{ detailExpense.note }}</p>
        </div>
      </div>

      <!-- Activity log entry -->
      <div v-else-if="detailMode === 'activity' && detailActivity" class="space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.time') }}</span><span class="font-mono">{{ formatDateTime(detailActivity.createdAt) }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.user') }}</span><span>{{ detailActivity.user }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.role') }}</span><span>{{ label('role', detailActivity.role) }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.module') }}</span><span>{{ label('audit.module', detailActivity.module) }}</span></div>
        <div class="flex justify-between"><span class="text-muted">{{ $t('col.device') }}</span><span class="text-right max-w-[220px] truncate">{{ detailActivity.device }}</span></div>
        <div v-if="detailActivity.ip" class="flex justify-between"><span class="text-muted">{{ $t('reportDetails.detail.ip') }}</span><span class="font-mono">{{ detailActivity.ip }}</span></div>
      </div>
    </Modal>
  </div>
</template>
