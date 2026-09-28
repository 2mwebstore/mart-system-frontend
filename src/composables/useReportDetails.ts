import { computed, ref, watch, type Ref } from 'vue'
import * as reportsApi from '@/api/reports'
import type {
  ActivityLogRow,
  ByCashierRow,
  ByProductRow,
  PaymentMethodReportRow,
  StockMovement,
  TransactionRow,
  TransactionsReport,
  VoidRefundRow,
} from '@/types/domain'
import { formatUSD } from '@/utils/format'
import { label, t } from '@/i18n'

// Report ids; their names / descriptions are translated in the page
// (reportDetails.types.<id>.label / .desc).
export const reportTypes = ['transactions', 'by-product', 'by-cashier', 'payment-methods', 'voids-refunds', 'stock-movements', 'activity-log']

// Report details (build spec §8.4). Only the selected report is fetched, and
// it is re-fetched when the date range, branch, the report type or (for
// Transactions) the cashier / payment / search filters change, and when the
// page changes. Every row-level report is paginated by the server, which also
// sends the whole-range totals used by the cards above the table.
export function useReportDetails(range: Ref<{ from: string; to: string }>, branchId: Ref<number>) {
  const selected = ref(reportTypes[0])
  const cashierFilter = ref<'all' | number>('all')
  const paymentFilter = ref<'all' | string>('all')
  const search = ref('')
  const page = ref(1)
  const perPage = 10
  const loading = ref(false)

  const transactions = ref<TransactionsReport | null>(null)
  // Rows matching the selected report across all pages, and the server's
  // whole-range totals for it.
  const transactionsTotal = ref(0)
  const total = ref(0)
  const reportSummary = ref<Record<string, number>>({})
  const byProductRows = ref<ByProductRow[]>([])
  const byCashierRows = ref<ByCashierRow[]>([])
  const paymentRows = ref<PaymentMethodReportRow[]>([])
  const voidsRefunds = ref<VoidRefundRow[]>([])
  const stockMovements = ref<StockMovement[]>([])
  const activityLog = ref<ActivityLogRow[]>([])

  function resetFilters() {
    cashierFilter.value = 'all'
    paymentFilter.value = 'all'
    search.value = ''
    page.value = 1
  }

  async function load() {
    loading.value = true
    const q = { branchId: branchId.value, dateFrom: range.value.from, dateTo: range.value.to }
    const paged = { ...q, page: page.value, perPage }
    const setMeta = (m: { total: number; summary: unknown }) => {
      total.value = m.total
      reportSummary.value = (m.summary ?? {}) as Record<string, number>
    }
    try {
      switch (selected.value) {
        case 'transactions': {
          const res = await reportsApi.getTransactions({
            ...q,
            cashierId: cashierFilter.value === 'all' ? null : cashierFilter.value,
            payment: paymentFilter.value === 'all' ? null : paymentFilter.value,
            q: search.value.trim(),
            page: page.value,
            perPage,
          })
          transactions.value = res.data
          transactionsTotal.value = res.meta.total
          total.value = res.meta.total
          break
        }
        case 'by-product': {
          const res = await reportsApi.getByProduct(paged)
          byProductRows.value = res.data
          setMeta(res.meta)
          break
        }
        case 'by-cashier': {
          const res = await reportsApi.getByCashier(paged)
          byCashierRows.value = res.data
          setMeta(res.meta)
          break
        }
        case 'payment-methods':
          paymentRows.value = await reportsApi.getPaymentMethodsReport(q)
          total.value = paymentRows.value.length
          break
        case 'voids-refunds': {
          const res = await reportsApi.getVoidsRefunds(paged)
          voidsRefunds.value = res.data
          setMeta(res.meta)
          break
        }
        case 'stock-movements': {
          const res = await reportsApi.getStockMovementsReport(paged)
          stockMovements.value = res.data
          setMeta(res.meta)
          break
        }
        case 'activity-log': {
          const res = await reportsApi.getActivityLog(paged)
          activityLog.value = res.data
          setMeta(res.meta)
          break
        }
      }
    } catch {
      // the API client already toasted the reason
    } finally {
      loading.value = false
    }
  }

  // Filters, the range and the report type reset paging; paging alone just re-fetches.
  watch([selected, cashierFilter, paymentFilter, search, range, branchId], () => (page.value = 1), { deep: true })
  watch([selected, page, cashierFilter, paymentFilter, search, range, branchId], load, { immediate: true, deep: true })

  const transactionRows = computed<TransactionRow[]>(() => transactions.value?.rows ?? [])
  const cashiers = computed(() => transactions.value?.cashiers ?? [])
  const summary = computed(() => transactions.value?.summary)
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage)))
  const sm = computed(() => reportSummary.value)

  const totalsByReport = computed(() => {
    switch (selected.value) {
      case 'transactions':
        return [
          { label: t('reportDetails.tiles.transactions'), value: String(summary.value?.count ?? 0) },
          { label: t('reportDetails.tiles.total'), value: formatUSD(summary.value?.totalCents ?? 0) },
          { label: t('reportDetails.tiles.avgBasket'), value: formatUSD(summary.value?.avgBasketCents ?? 0) },
          { label: t('reportDetails.tiles.refunded'), value: String(summary.value?.refunded ?? 0) },
        ]
      case 'by-product':
        return [
          { label: t('reportDetails.tiles.products'), value: String(sm.value.products ?? 0) },
          { label: t('reportDetails.tiles.unitsSold'), value: String(sm.value.units ?? 0) },
          { label: t('reportDetails.tiles.revenue'), value: formatUSD(sm.value.revenueCents ?? 0) },
          { label: t('reportDetails.tiles.profit'), value: formatUSD(sm.value.profitCents ?? 0) },
        ]
      case 'by-cashier':
        return [
          { label: t('reportDetails.tiles.cashiers'), value: String(sm.value.cashiers ?? 0) },
          { label: t('reportDetails.tiles.totalSales'), value: formatUSD(sm.value.salesCents ?? 0) },
          { label: t('reportDetails.tiles.voids'), value: String(sm.value.voids ?? 0) },
          { label: t('reportDetails.tiles.refunds'), value: String(sm.value.refunds ?? 0) },
        ]
      case 'payment-methods':
        return [
          { label: t('reportDetails.tiles.methods'), value: String(paymentRows.value.length) },
          { label: t('reportDetails.tiles.total'), value: formatUSD(paymentRows.value.reduce((n, r) => n + r.totalCents, 0)) },
          { label: t('reportDetails.tiles.transactions'), value: String(paymentRows.value.reduce((n, r) => n + r.count, 0)) },
          { label: t('reportDetails.tiles.topMethod'), value: paymentRows.value[0] ? label('method', paymentRows.value[0].method) : '—' },
        ]
      case 'voids-refunds':
        return [
          { label: t('reportDetails.tiles.totalEvents'), value: String(sm.value.events ?? 0) },
          { label: t('reportDetails.tiles.voids'), value: String(sm.value.voids ?? 0) },
          { label: t('reportDetails.tiles.refunds'), value: String(sm.value.refunds ?? 0) },
          { label: t('reportDetails.tiles.amount'), value: formatUSD(sm.value.amountCents ?? 0) },
        ]
      case 'stock-movements':
        return [
          { label: t('reportDetails.tiles.movements'), value: String(sm.value.movements ?? 0) },
          { label: t('reportDetails.tiles.received'), value: String(sm.value.received ?? 0) },
          { label: t('reportDetails.tiles.sold'), value: String(sm.value.sold ?? 0) },
          { label: t('reportDetails.tiles.adjustments'), value: String(sm.value.adjustments ?? 0) },
        ]
      case 'activity-log':
        return [
          { label: t('reportDetails.tiles.events'), value: String(sm.value.events ?? 0) },
          { label: t('reportDetails.tiles.users'), value: String(sm.value.users ?? 0) },
          { label: t('reportDetails.tiles.modules'), value: String(sm.value.modules ?? 0) },
          { label: t('reportDetails.tiles.retention'), value: t('reportDetails.tiles.retentionValue') },
        ]
      default:
        return []
    }
  })

  return {
    loading,
    selected,
    cashierFilter,
    paymentFilter,
    search,
    page,
    perPage,
    totalPages,
    resetFilters,
    cashiers,
    summary,
    transactionsTotal,
    total,
    transactionRows,
    byProductRows,
    byCashierRows,
    paymentRows,
    voidsRefunds,
    stockMovements,
    activityLog,
    totalsByReport,
  }
}
