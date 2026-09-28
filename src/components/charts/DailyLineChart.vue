<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import type { ChartOptions, TooltipItem } from 'chart.js'
import { CHART_PRIMARY } from '@/utils/chartColors'
import { t } from '@/i18n'

const props = defineProps<{
  labels: string[]
  values: number[] // already-formatted display units (e.g. dollars, not cents)
  valuePrefix?: string
}>()

const chartData = computed(() => ({
  labels: props.labels,
  datasets: [
    {
      label: t('charts.netSales'),
      data: props.values,
      borderColor: CHART_PRIMARY,
      backgroundColor: 'rgba(255,109,41,0.12)',
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
      backgroundColor: '#17201B',
      bodyFont: { family: "'JetBrains Mono', monospace" },
      callbacks: {
        label: (ctx: TooltipItem<'line'>) => `${props.valuePrefix ?? ''}${(ctx.parsed.y ?? 0).toLocaleString()}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
    y: { beginAtZero: true, grid: { color: '#E2DED3' } },
  },
}))
</script>

<template>
  <div class="h-64">
    <Line :data="chartData" :options="options" />
  </div>
</template>
