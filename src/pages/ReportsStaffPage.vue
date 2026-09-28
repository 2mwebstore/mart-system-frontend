<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'
import { categoryName, label } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useDateRangeQuery } from '@/composables/useDateRangeQuery'
import { useReportsStaffData } from '@/composables/useReportsStaffData'
import { formatUSD } from '@/utils/format'
import { CATEGORY_COLORS } from '@/utils/chartColors'
import DateRangePicker from '@/components/DateRangePicker.vue'
import DailyLineChart from '@/components/charts/DailyLineChart.vue'
import SegmentedBar from '@/components/charts/SegmentedBar.vue'
import StatusBadge from '@/components/StatusBadge.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const branchId = computed(() => auth.activeBranchId ?? auth.branches[0]?.id ?? 1)
const { range } = useDateRangeQuery()
const { series, totalNetSalesCents, dailyAverageCents, categoryBreakdown, staffRows, rolesSummary } = useReportsStaffData(range, branchId)

const chartLabels = computed(() => series.value.map((d) => dayjs(d.date).locale(locale.value).format('D MMM')))
const chartValues = computed(() => series.value.map((d) => Math.round(d.netSalesCents / 100)))

const categorySegments = computed(() =>
  categoryBreakdown.value.map((c) => ({
    label: c.name,
    name: categoryName(c.name, c.nameKm),
    value: c.salesCents,
    share: c.share,
    display: formatUSD(c.salesCents),
    color: CATEGORY_COLORS[c.name] ?? '#5A635D',
  })),
)

const shiftTone: Record<string, 'success' | 'neutral' | 'warning'> = { Open: 'success', Closed: 'neutral', Off: 'warning' }
</script>

<template>
  <div class="p-8 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl">{{ t('staffReport.title') }}</h1>
        <p class="text-muted text-sm">{{ auth.branches.find((b) => b.id === branchId)?.name }}</p>
      </div>
      <DateRangePicker v-model="range" />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="card lg:col-span-2">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-heading text-base">{{ t('staffReport.dailySales') }}</h2>
          <div class="text-right text-sm">
            <p class="text-muted">{{ t('staffReport.total') }} <span class="font-mono text-ink">{{ formatUSD(totalNetSalesCents) }}</span></p>
            <p class="text-muted">{{ t('staffReport.dailyAverage') }} <span class="font-mono text-ink">{{ formatUSD(dailyAverageCents) }}</span></p>
          </div>
        </div>
        <DailyLineChart :labels="chartLabels" :values="chartValues" value-prefix="$" />
      </div>

      <div class="card">
        <h2 class="font-heading text-base mb-3">{{ t('staffReport.salesByCategory') }}</h2>
        <SegmentedBar :segments="categorySegments" />
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card overflow-x-auto">
        <h2 class="font-heading text-base mb-3">{{ t('staffReport.staff') }}</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ t('common.name') }}</th>
              <th class="py-2 font-medium">{{ t('common.role') }}</th>
              <th class="py-2 font-medium text-right">{{ t('staffReport.salesToday') }}</th>
              <th class="py-2 font-medium">{{ t('staffReport.shift') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in staffRows" :key="s.id" class="border-b border-line last:border-0">
              <td class="py-2">{{ s.fullName }}</td>
              <td class="py-2 text-muted">{{ label('role', s.roleName) }}</td>
              <td class="py-2 text-right font-mono">{{ formatUSD(s.salesTodayCents) }}</td>
              <td class="py-2"><StatusBadge :tone="shiftTone[s.shiftStatus]" :label="label('shiftStatus', s.shiftStatus)" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-heading text-base">{{ t('staffReport.rolesPermissions') }}</h2>
          <RouterLink :to="{ name: 'users-roles' }" class="text-sm text-primary-text hover:underline">{{ t('staffReport.manage') }}</RouterLink>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ t('common.role') }}</th>
              <th v-for="g in rolesSummary[0]?.groupCounts" :key="g.group" class="py-2 font-medium text-right">{{ label('permGroup', g.group) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rolesSummary" :key="r.id" class="border-b border-line last:border-0">
              <td class="py-2">{{ label('role', r.name) }}</td>
              <td v-for="g in r.groupCounts" :key="g.group" class="py-2 text-right font-mono text-muted">{{ g.granted }}/{{ g.total }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
