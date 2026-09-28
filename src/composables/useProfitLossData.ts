import { computed, ref, watch, type Ref } from 'vue'
import * as reportsApi from '@/api/reports'
import type { ProfitLossReport } from '@/types/domain'
import { usdCentsToRiel } from '@/utils/money'
import { label, t } from '@/i18n'

// Profit & Loss (build spec §8.5) from GET /reports/profit-loss. Every figure
// is computed on the server from real sales and expenses; this only shapes
// them for the statement table and charts.
export function useProfitLossData(dateRange: Ref<{ from: string; to: string }>, branchId: Ref<number>) {
  const report = ref<ProfitLossReport | null>(null)
  const loading = ref(true)

  async function load() {
    loading.value = true
    try {
      report.value = await reportsApi.getProfitLoss({ branchId: branchId.value, dateFrom: dateRange.value.from, dateTo: dateRange.value.to })
    } catch {
      report.value = null
    } finally {
      loading.value = false
    }
  }
  watch([dateRange, branchId], load, { immediate: true, deep: true })

  const r = computed(() => report.value)
  const netSalesCents = computed(() => r.value?.netSalesCents ?? 0)
  const grossProfitCents = computed(() => r.value?.grossProfitCents ?? 0)
  const totalOperatingExpensesCents = computed(() => r.value?.totalExpensesCents ?? 0)
  const netProfitCents = computed(() => r.value?.netProfitCents ?? 0)
  const pct = (part: number, whole: number) => (whole !== 0 ? Math.round((part / whole) * 1000) / 10 : 0)

  const statementLines = computed(() => {
    const x = r.value
    if (!x) return []
    const rate = x.exchangeRate
    const catLabel = (c: string) => label('expenseCat', c)
    const lines: { label: string; usdCents: number; bold?: boolean }[] = [
      { label: t('pl.grossSales'), usdCents: x.grossSalesCents },
      { label: t('pl.discounts'), usdCents: -x.discountCents },
      { label: t('pl.returns'), usdCents: -x.returnsCents },
      { label: t('pl.netSales'), usdCents: x.netSalesCents, bold: true },
      { label: t('pl.cogs'), usdCents: -x.cogsCents },
      { label: t('pl.grossProfit'), usdCents: x.grossProfitCents, bold: true },
      ...x.expensesByCategory.map((e) => ({ label: catLabel(e.category), usdCents: -e.amountCents })),
      { label: t('pl.totalOpex'), usdCents: -x.totalExpensesCents, bold: true },
      { label: t('pl.netProfit'), usdCents: x.netProfitCents, bold: true },
    ]
    return lines.map((l) => ({ ...l, pctOfNetSales: pct(l.usdCents, x.netSalesCents), riel: usdCentsToRiel(l.usdCents, rate) }))
  })

  return {
    loading,
    reload: load,
    grossSalesCents: computed(() => r.value?.grossSalesCents ?? 0),
    netSalesCents,
    grossProfitCents,
    grossMarginPct: computed(() => pct(grossProfitCents.value, netSalesCents.value)),
    totalOperatingExpensesCents,
    netProfitCents,
    netMarginPct: computed(() => pct(netProfitCents.value, netSalesCents.value)),
    statementLines,
    grossProfitByCategory: computed(() => r.value?.profitByCategory ?? []),
    netProfitByDay: computed(() => r.value?.netProfitByDay ?? []),
  }
}
