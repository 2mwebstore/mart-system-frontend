<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'
import { categoryName, label } from '@/i18n'
import { FileDown, Plus } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useDateRangeQuery } from '@/composables/useDateRangeQuery'
import { useProfitLossData } from '@/composables/useProfitLossData'
import { formatUSD, formatKHR } from '@/utils/format'
import { CATEGORY_COLORS } from '@/utils/chartColors'
import { EXPENSE_CATEGORIES } from '@/types/domain'
import * as peopleApi from '@/api/people'
import DateRangePicker from '@/components/DateRangePicker.vue'
import DailyLineChart from '@/components/charts/DailyLineChart.vue'
import SegmentedBar from '@/components/charts/SegmentedBar.vue'
import Modal from '@/components/Modal.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { useToast } from '@/composables/useToast'

const { t, locale } = useI18n()
const expenseCategoryOptions = computed(() => EXPENSE_CATEGORIES.map((c) => ({ value: c, label: label('expenseCat', c) })))

const auth = useAuthStore()
const toast = useToast()
const branchId = computed(() => auth.activeBranchId ?? auth.branches[0]?.id ?? 1)
const { range } = useDateRangeQuery()

const {
  netSalesCents,
  grossProfitCents,
  grossMarginPct,
  totalOperatingExpensesCents,
  netProfitCents,
  netMarginPct,
  statementLines,
  grossProfitByCategory,
  netProfitByDay,
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
const expenseForm = reactive({ category: EXPENSE_CATEGORIES[0], amount: '', date: new Date().toLocaleDateString('en-CA'), note: '' })
const savingExpense = ref(false)
async function submitExpense() {
  savingExpense.value = true
  try {
    await peopleApi.createExpense({
      branchId: branchId.value,
      category: expenseForm.category,
      amountCents: Math.round(Number(expenseForm.amount) * 100),
      expenseDate: expenseForm.date,
      note: expenseForm.note,
    })
    showAddExpense.value = false
    Object.assign(expenseForm, { amount: '', note: '' })
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
  <div class="p-8 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl">{{ t('pl.title') }}</h1>
        <p class="text-muted text-sm">{{ auth.branches.find((b) => b.id === branchId)?.name }}</p>
      </div>
      <div class="flex items-center gap-2">
        <DateRangePicker v-model="range" />
        <button type="button" class="btn-secondary flex items-center gap-2" @click="toast.info(t('pl.pdfSoon'))">
          <FileDown :stroke-width="1.8" class="w-4 h-4" /> {{ t('pl.downloadPdf') }}
        </button>
        <button type="button" class="btn-primary flex items-center gap-2" @click="showAddExpense = true">
          <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ t('pl.addExpense') }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="card">
        <p class="text-sm text-muted">{{ t('pl.netSales') }}</p>
        <p class="font-mono text-xl mt-1">{{ formatUSD(netSalesCents) }}</p>
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

    <Modal
      v-if="showAddExpense" 
      :title="t('pl.addExpenseTitle')" @close="showAddExpense = false"
    >
      <form class="space-y-4" @submit.prevent="submitExpense">
        <SearchableSelect v-model="expenseForm.category" :label="t('common.category')" :options="expenseCategoryOptions" :searchable="false" :clearable="false" />
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ t('pl.amountUsd') }}</label>
            <input v-model="expenseForm.amount" type="number" step="0.01" class="input" required />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ t('common.date') }}</label>
            <input v-model="expenseForm.date" type="date" class="input" required />
          </div>
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ t('common.note') }}</label>
          <input v-model="expenseForm.note" type="text" class="input" />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showAddExpense = false">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="savingExpense">{{ t('common.save') }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
