<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import type { ChartOptions, TooltipItem } from 'chart.js'
import { CHART_GRID, CHART_PRIMARY, CHART_PRIMARY_FILL, CHART_TOOLTIP_BG } from '@/utils/chartColors'
import { t } from '@/i18n'

const props = defineProps<{
  labels: string[]
  values: number[] // whole display units of the main currency (dollars or riel, not cents)
  valuePrefix?: string
}>()

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [
    {
      label: t('charts.netSales'),
      data: props.values,
      borderColor: CHART_PRIMARY,
      backgroundColor: CHART_PRIMARY_FILL,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
      fill: true,
      tension: 0.25,
    },
  ],
}))

const options = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: CHART_TOOLTIP_BG,
      bodyFont: { family: "'JetBrains Mono', monospace" },
      callbacks: {
        label: (ctx: TooltipItem<'line'>) => `${props.valuePrefix ?? ''}${(ctx.parsed.y ?? 0).toLocaleString()}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
    y: { beginAtZero: true, grid: { color: CHART_GRID } },
  },
}))
</script>

<template>
  <div class="h-64">
    <Line :data="chartData" :options="options" />
  </div>
</template>
