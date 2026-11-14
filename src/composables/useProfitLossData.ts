import { computed, ref, watch, type Ref } from 'vue'
import * as reportsApi from '@/api/reports'
import type { ProfitLossReport } from '@/types/domain'
import { otherFigure } from '@/utils/money'
import { useSettingsStore } from '@/stores/settings'
import { label, t } from '@/i18n'

// Profit & Loss (build spec §8.5) from GET /reports/profit-loss. Every figure
// is computed on the server from real sales and expenses; this only shapes
// them for the statement table and charts.
export function useProfitLossData(dateRange: Ref<{ from: string; to: string }>, branchId: Ref<number>) {
  const settings = useSettingsStore()
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
    // `amount` is in the main currency; `other` is the same in the other
    // currency at the report's rate.
    const lines: { label: string; amount: number; bold?: boolean }[] = [
      { label: t('pl.grossSales'), amount: x.grossSalesCents },
      { label: t('pl.discounts'), amount: -x.discountCents },
      { label: t('pl.returns'), amount: -x.returnsCents },
      { label: t('pl.netSales'), amount: x.netSalesCents, bold: true },
      { label: t('pl.cogs'), amount: -x.cogsCents },
      { label: t('pl.grossProfit'), amount: x.grossProfitCents, bold: true },
      ...x.expensesByCategory.map((e) => ({ label: catLabel(e.category), amount: -e.amountCents })),
      { label: t('pl.totalOpex'), amount: -x.totalExpensesCents, bold: true },
      { label: t('pl.netProfit'), amount: x.netProfitCents, bold: true },
    ]
    return lines.map((l) => ({ ...l, pctOfNetSales: pct(l.amount, x.netSalesCents), other: otherFigure(l.amount, settings.mainCurrency, rate) }))
  })

  return {
    loading,
    reload: load,
    grossSalesCents: computed(() => r.value?.grossSalesCents ?? 0),
    posSalesCents: computed(() => r.value?.posSalesCents ?? 0),
    invoiceSalesCents: computed(() => r.value?.invoiceSalesCents ?? 0),
    invoiceCount: computed(() => r.value?.invoiceCount ?? 0),
    netSalesCents,
    grossProfitCents,
    grossMarginPct: computed(() => pct(grossProfitCents.value, netSalesCents.value)),
    totalOperatingExpensesCents,
    netProfitCents,
    netMarginPct: computed(() => pct(netProfitCents.value, netSalesCents.value)),
    statementLines,
    grossProfitByCategory: computed(() => r.value?.profitByCategory ?? []),
    netProfitByDay: computed(() => r.value?.netProfitByDay ?? []),
    // Tax on top, kept out of every figure above (an older server sends none).
    tax: computed(() => r.value?.tax ?? { collectedCents: 0, posCents: 0, invoiceCents: 0, paidCents: 0, expenseCents: 0, purchaseCents: 0 }),
  }
}
