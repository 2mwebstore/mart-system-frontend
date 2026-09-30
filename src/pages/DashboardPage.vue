<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ShoppingCart, AlertTriangle } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useDashboardData } from '@/composables/useDashboardData'
import { formatUSD, formatKHR } from '@/utils/format'
import KpiCard from '@/components/KpiCard.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import HourlyBarChart from '@/components/charts/HourlyBarChart.vue'
import SegmentedBar from '@/components/charts/SegmentedBar.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { PAYMENT_METHOD_COLORS } from '@/utils/chartColors'
import { localName } from '@/i18n'

const { t } = useI18n()
const auth = useAuthStore()

const branchId = computed({
  get: () => auth.activeBranchId ?? auth.branches[0]?.id ?? 1,
  set: (v: number | string | null) => auth.setActiveBranch(Number(v)),
})
const branchOptions = computed(() => auth.branches.map((b) => ({ value: b.id, label: b.name })))

const {
  noAccess,
  dateLabel,
  todayUSDCents,
  todayKHRRiel,
  transactions,
  transactionsDeltaPct,
  avgBasketCents,
  lowStockCount,
  lowStock,
  hourly,
  topProducts,
  paymentSegments,
} = useDashboardData(branchId)

const paymentSegmentsWithColor = computed(() =>
  paymentSegments.value.map((s) => ({ ...s, color: PAYMENT_METHOD_COLORS[s.label] ?? '#5A635D' })),
)
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl">{{ t('nav.dashboard') }}</h1>
        <p class="text-muted text-sm">{{ t('dashboard.todayDate', { date: dateLabel }) }}</p>
      </div>
      <div class="flex items-center gap-3">
        <SearchableSelect v-model="branchId" class="w-44" :options="branchOptions" :searchable="false" :clearable="false" />
        <RouterLink :to="{ name: 'pos' }" class="btn-primary flex items-center gap-2">
          <ShoppingCart :stroke-width="1.8" class="w-4 h-4" />
          {{ t('dashboard.newSale') }}
        </RouterLink>
      </div>
    </div>

    <div v-if="noAccess" class="card text-sm text-muted">{{ t('dashboard.noAccess') }}</div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard :label="t('dashboard.salesToday')" :value="formatUSD(todayUSDCents)" :subvalue="formatKHR(todayKHRRiel)" />
      <KpiCard
        :label="t('dashboard.transactions')"
        :value="String(transactions)"
        :delta="transactionsDeltaPct"
        :delta-label="t('dashboard.vsLastWeek')"
      />
      <KpiCard :label="t('dashboard.avgBasket')" :value="formatUSD(avgBasketCents)" />
      <KpiCard :label="t('dashboard.lowStock')" :value="String(lowStockCount)" :subvalue="t('dashboard.items')" :to="{ name: 'inventory' }" />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <h2 class="font-heading text-base mb-3">{{ t('dashboard.salesByHour') }}</h2>
        <HourlyBarChart :data="hourly" />
      </div>
      <div class="card">
        <h2 class="font-heading text-base mb-3">{{ t('dashboard.paymentMix') }}</h2>
        <SegmentedBar :segments="paymentSegmentsWithColor" />
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <h2 class="font-heading text-base mb-3">{{ t('dashboard.reorderSoon') }}</h2>
        <ul v-if="lowStock.length" class="space-y-3">
          <li v-for="p in lowStock" :key="p.id" class="space-y-1">
            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-1.5">
                <AlertTriangle v-if="p.qty === 0" :stroke-width="1.8" class="w-3.5 h-3.5 text-danger-strong" />
                {{ localName(p.nameEn, p.nameKm) }}
              </span>
              <span class="font-mono text-muted">{{ p.qty }} / {{ p.reorderPoint }}</span>
            </div>
            <ProgressBar :value="p.qty" :max="p.reorderPoint" :danger="p.qty === 0" />
          </li>
        </ul>
        <p v-else class="text-muted text-sm">{{ t('dashboard.nothingReorder') }}</p>
      </div>

      <div class="card">
        <h2 class="font-heading text-base mb-3">{{ t('dashboard.topProducts') }}</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ t('common.product') }}</th>
              <th class="py-2 font-medium text-right">{{ t('dashboard.qty') }}</th>
              <th class="py-2 font-medium text-right">{{ t('dashboard.revenue') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in topProducts" :key="p.productId" class="border-b border-line last:border-0">
              <td class="py-2">{{ localName(p.name, p.nameKm) }}</td>
              <td class="py-2 text-right font-mono">{{ p.qty }}</td>
              <td class="py-2 text-right font-mono">{{ formatUSD(p.revenueCents) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
