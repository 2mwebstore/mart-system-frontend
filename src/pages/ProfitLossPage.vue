<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'
import { categoryName } from '@/i18n'
import { FileDown, Plus } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useDateRangeQuery } from '@/composables/useDateRangeQuery'
import { useProfitLossData } from '@/composables/useProfitLossData'
import { formatUSD, formatKHR } from '@/utils/format'
import { CATEGORY_COLORS } from '@/utils/chartColors'
import * as peopleApi from '@/api/people'
import type { ExpenseInput } from '@/api/people'
import DateRangePicker from '@/components/DateRangePicker.vue'
import DailyLineChart from '@/components/charts/DailyLineChart.vue'
import SegmentedBar from '@/components/charts/SegmentedBar.vue'
import Modal from '@/components/Modal.vue'
import ExpenseForm from '@/components/expenses/ExpenseForm.vue'
import { useToast } from '@/composables/useToast'

const { t, locale } = useI18n()

const auth = useAuthStore()
const toast = useToast()
const branchId = computed(() => auth.activeBranchId ?? auth.branches[0]?.id ?? 1)
const { range } = useDateRangeQuery()

const {
  netSalesCents,
  posSalesCents,
  invoiceSalesCents,
  invoiceCount,
  grossProfitCents,
  grossMarginPct,
  totalOperatingExpensesCents,
  netProfitCents,
  netMarginPct,
  statementLines,
  grossProfitByCategory,
  netProfitByDay,
  tax,
  reload,
} = useProfitLossData(range, branchId)

const opexPctOfSales = computed(() => (netSalesCents.value > 0 ? Math.round((totalOperatingExpensesCents.value / netSalesCents.value) * 1000) / 10 : 0))

const categorySegments = computed(() =>
  grossProfitByCategory.value.map((c) => ({
    label: c.name,
    name: categoryName(c.name, c.nameKm),
    value: c.profitCents,
    share: c.share,
    display: formatUSD(c.profitCents),
    color: CATEGORY_COLORS[c.name] ?? '#5A635D',
  })),
)

const profitLabels = computed(() => netProfitByDay.value.map((d) => dayjs(d.date).locale(locale.value).format('D MMM')))
const profitValues = computed(() => netProfitByDay.value.map((d) => Math.round(d.netProfitCents / 100)))

const showAddExpense = ref(false)
const savingExpense = ref(false)
async function submitExpense(body: ExpenseInput) {
  savingExpense.value = true
  try {
    await peopleApi.createExpense(body)
    showAddExpense.value = false
    toast.success(t('pl.expenseAdded'))
    await reload()
  } catch {
    // the API client already toasted the reason
  } finally {
    savingExpense.value = false
  }
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl">{{ t('pl.title') }}</h1>
        <p class="text-muted text-sm">{{ auth.branches.find((b) => b.id === branchId)?.name }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <DateRangePicker v-model="range" />
        <button type="button" class="btn-secondary flex items-center gap-2" @click="toast.info(t('pl.pdfSoon'))">
          <FileDown :stroke-width="1.8" class="w-4 h-4" /> {{ t('pl.downloadPdf') }}
        </button>
        <button v-if="auth.hasPermission('expense.create')" type="button" class="btn-primary flex items-center gap-2" @click="showAddExpense = true">
          <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ t('pl.addExpense') }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="card">
        <p class="text-sm text-muted">{{ t('pl.netSales') }}</p>
        <p class="font-mono text-xl mt-1">{{ formatUSD(netSalesCents) }}</p>
        <p v-if="invoiceCount > 0" class="text-xs text-muted mt-1">
          {{ t('pl.salesSplit', { pos: formatUSD(posSalesCents), invoices: formatUSD(invoiceSalesCents), n: invoiceCount }) }}
        </p>
      </div>
      <div class="card">
        <p class="text-sm text-muted">{{ t('pl.grossProfit') }}</p>
        <p class="font-mono text-xl mt-1">{{ formatUSD(grossProfitCents) }}</p>
        <p class="text-xs text-muted">{{ t('pl.marginPct', { pct: grossMarginPct }) }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-muted">{{ t('pl.opex') }}</p>
        <p class="font-mono text-xl mt-1">{{ formatUSD(totalOperatingExpensesCents) }}</p>
        <p class="text-xs text-muted">{{ t('pl.pctOfSales', { pct: opexPctOfSales }) }}</p>
      </div>
      <div class="card border-primary/40 bg-primary-tint">
        <p class="text-sm text-primary-tint-text">{{ t('pl.netProfit') }}</p>
        <p class="font-mono text-xl mt-1 text-primary-tint-text">{{ formatUSD(netProfitCents) }}</p>
        <p class="text-xs text-primary-tint-text">{{ t('pl.marginPct', { pct: netMarginPct }) }}</p>
      </div>
    </div>

    <div v-if="tax.collectedCents || tax.paidCents" class="grid grid-cols-1 sm:grid-cols-2 gap-4" data-pl-tax>
      <div class="card">
        <p class="text-sm text-muted">{{ t('tax.collected') }}</p>
        <p class="font-mono text-xl mt-1">{{ formatUSD(tax.collectedCents) }}</p>
        <p class="text-xs text-muted">{{ t('tax.collectedHint', { pos: formatUSD(tax.posCents), invoice: formatUSD(tax.invoiceCents) }) }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-muted">{{ t('tax.paid') }}</p>
        <p class="font-mono text-xl mt-1">{{ formatUSD(tax.paidCents) }}</p>
        <p class="text-xs text-muted">{{ t('tax.paidHint', { expense: formatUSD(tax.expenseCents), purchase: formatUSD(tax.purchaseCents) }) }}</p>
      </div>
    </div>

    <div class="card overflow-x-auto">
      <h2 class="font-heading text-base mb-3">{{ t('pl.statement') }}</h2>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-line">
            <th class="py-2 font-medium">{{ t('pl.line') }}</th>
            <th class="py-2 font-medium text-right">{{ t('common.usd') }}</th>
            <th class="py-2 font-medium text-right">{{ t('pl.pctOfNetSales') }}</th>
            <th class="py-2 font-medium text-right">{{ t('common.khr') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in statementLines" :key="line.label" class="border-b border-line last:border-0" :class="line.bold ? 'font-medium' : ''">
            <td class="py-2">{{ line.label }}</td>
            <td class="py-2 text-right font-mono" :class="line.usdCents < 0 ? 'text-danger-strong' : ''">{{ formatUSD(line.usdCents) }}</td>
            <td class="py-2 text-right font-mono text-muted">{{ line.pctOfNetSales }}%</td>
            <td class="py-2 text-right font-mono text-muted">{{ formatKHR(line.riel) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <h2 class="font-heading text-base mb-3">{{ t('pl.grossProfitByCategory') }}</h2>
        <SegmentedBar :segments="categorySegments" />
      </div>
      <div class="card">
        <h2 class="font-heading text-base mb-3">{{ t('pl.netProfitByDay') }}</h2>
        <DailyLineChart :labels="profitLabels" :values="profitValues" value-prefix="$" />
      </div>
    </div>

    <Modal v-if="showAddExpense" wide :title="t('pl.addExpenseTitle')" @close="showAddExpense = false">
      <ExpenseForm :branch-id="branchId" :show-branch="false" :saving="savingExpense" @save="submitExpense" @cancel="showAddExpense = false" />
    </Modal>
  </div>
</template>
