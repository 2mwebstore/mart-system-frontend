import { computed, ref, watch, type Ref } from 'vue'
import * as reportsApi from '@/api/reports'
import type { StaffReport } from '@/types/domain'

// Reports & Staff (build spec §8.3) from GET /reports/staff.
export function useReportsStaffData(dateRange: Ref<{ from: string; to: string }>, branchId: Ref<number>) {
  const report = ref<StaffReport | null>(null)
  const loading = ref(true)

  async function load() {
    loading.value = true
    try {
      report.value = await reportsApi.getStaffReport({ branchId: branchId.value, dateFrom: dateRange.value.from, dateTo: dateRange.value.to })
    } catch {
      report.value = null // the API client already toasted the reason
    } finally {
      loading.value = false
    }
  }
  watch([dateRange, branchId], load, { immediate: true, deep: true })

  const r = computed(() => report.value)
  return {
    loading,
    series: computed(() => r.value?.series ?? []),
    totalNetSalesCents: computed(() => r.value?.totalNetSalesCents ?? 0),
    dailyAverageCents: computed(() => r.value?.dailyAverageCents ?? 0),
    categoryBreakdown: computed(() => r.value?.categories ?? []),
    staffRows: computed(() => r.value?.staff ?? []),
    rolesSummary: computed(() => r.value?.roles ?? []),
  }
}
