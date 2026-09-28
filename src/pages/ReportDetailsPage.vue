<script setup lang="ts">
import Pagination from '@/components/Pagination.vue'
import { computed } from 'vue'
import { Download, FileText, Printer, RotateCcw } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useDateRangeQuery } from '@/composables/useDateRangeQuery'
import { reportTypes, useReportDetails } from '@/composables/useReportDetails'
import { formatDateTime, formatUSD } from '@/utils/format'
import StatusBadge from '@/components/StatusBadge.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import DateRangePicker from '@/components/DateRangePicker.vue'
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
  activityLog,
  totalsByReport,
} = useReportDetails(range, branchId)

const statusTone: Record<string, 'success' | 'danger' | 'warning'> = { PAID: 'success', VOIDED: 'danger', REFUNDED: 'warning', PARTIAL_REFUND: 'warning' }
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
</script>

<template>
  <div class="p-8 space-y-6">
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
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-heading text-base">{{ reportName(selected) }}</h2>
            <div class="flex gap-2">
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
                <tr v-for="row in transactionRows" :key="row.id" class="border-b border-line last:border-0">
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
                <tr v-for="r in byProductRows" :key="r.sku" class="border-b border-line last:border-0">
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
                <tr v-for="r in byCashierRows" :key="r.name" class="border-b border-line last:border-0">
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
                <tr v-for="r in paymentRows" :key="r.method" class="border-b border-line last:border-0">
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
                <tr v-for="r in voidsRefunds" :key="r.id" class="border-b border-line last:border-0">
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
                <tr v-for="m in stockMovements" :key="m.id" class="border-b border-line last:border-0">
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
                <tr v-for="a in activityLog" :key="a.id" class="border-b border-line last:border-0">
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
  </div>
</template>
