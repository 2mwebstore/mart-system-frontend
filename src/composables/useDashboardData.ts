import { computed, onMounted, ref, watch, type Ref } from 'vue'
import axios from 'axios'
import * as reportsApi from '@/api/reports'
import type { DashboardReport } from '@/types/domain'
import { usdCentsToRiel } from '@/utils/money'
import { label } from '@/i18n'

// `label` stays the English key (chart colours are keyed by it); `name` is what's shown.
const METHOD_KEYS: Record<string, string> = { CASH: 'Cash', KHQR: 'KHQR', CARD: 'Card' }

// Dashboard KPIs for one branch, from GET /reports/dashboard (build spec §8.1).
export function useDashboardData(branchId: Ref<number>) {
  const report = ref<DashboardReport | null>(null)
  const loading = ref(true)
  const noAccess = ref(false)

  async function load() {
    loading.value = true
    noAccess.value = false
    try {
      report.value = await reportsApi.getDashboard(branchId.value)
    } catch (e) {
      // 403: this role can't see sales reports — show a note instead of a toast.
      if (axios.isAxiosError(e) && e.response?.status === 403) noAccess.value = true
      report.value = null
    } finally {
      loading.value = false
    }
  }
  onMounted(load)
  watch(branchId, load)

  const r = computed(() => report.value)
  const rate = computed(() => r.value?.exchangeRate ?? 4100)
  const transactionsDeltaPct = computed(() => {
    const prev = r.value?.lastWeekTransactions ?? 0
    if (!prev) return 0
    return Math.round((((r.value?.transactions ?? 0) - prev) / prev) * 100)
  })

  const paymentSegments = computed(() => {
    const mix = r.value?.paymentMix ?? []
    const total = mix.reduce((s, m) => s + m.amountCents, 0)
    return mix.map((m) => ({
      label: METHOD_KEYS[m.method] ?? m.method,
      name: label('method', m.method),
      value: m.amountCents,
      share: total ? m.amountCents / total : 0,
      display: `$${(m.amountCents / 100).toFixed(2)}`,
    }))
  })

  return {
    loading,
    noAccess,
    dateLabel: computed(() => r.value?.date ?? ''),
    todayUSDCents: computed(() => r.value?.netSalesCents ?? 0),
    todayKHRRiel: computed(() => usdCentsToRiel(r.value?.netSalesCents ?? 0, rate.value)),
    transactions: computed(() => r.value?.transactions ?? 0),
    transactionsDeltaPct,
    avgBasketCents: computed(() => r.value?.avgBasketCents ?? 0),
    lowStockCount: computed(() => r.value?.lowStockCount ?? 0),
    lowStock: computed(() => r.value?.lowStock ?? []),
    hourly: computed(() => r.value?.hourly ?? []),
    topProducts: computed(() => r.value?.topProducts ?? []),
    paymentSegments,
  }
}
