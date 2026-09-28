<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import type { ChartOptions, TooltipItem } from 'chart.js'
import { CHART_PRIMARY, CHART_PRIMARY_TINT } from '@/utils/chartColors'
import { t } from '@/i18n'

const props = defineProps<{ data: { hour: number; qty: number }[] }>()

const peakQty = computed(() => Math.max(...props.data.map((d) => d.qty)))

const chartData = computed(() => ({
  labels: props.data.map((d) => `${d.hour}:00`),
  datasets: [
    {
      label: t('charts.itemsSold'),
      data: props.data.map((d) => d.qty),
      backgroundColor: props.data.map((d) => (d.qty === peakQty.value && peakQty.value > 0 ? CHART_PRIMARY : CHART_PRIMARY_TINT)),
      borderRadius: 4,
      maxBarThickness: 18,
    },
  ],
}))

const options = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#17201B',
      titleFont: { family: "'Kantumruy Pro', sans-serif" },
      bodyFont: { family: "'JetBrains Mono', monospace" },
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) => t('charts.itemsSoldTip', { n: ctx.parsed.y }),
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    y: { beginAtZero: true, grid: { color: '#E2DED3' }, ticks: { precision: 0 } },
  },
}))
</script>

<template>
  <div class="h-56">
    <Bar :data="chartData" :options="options" />
  </div>
</template>
