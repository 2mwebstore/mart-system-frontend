<script setup lang="ts">
defineProps<{
  label: string
  value: string
  subvalue?: string
  delta?: number
  deltaLabel?: string
  to?: object
}>()
</script>

<template>
  <component :is="to ? 'RouterLink' : 'div'" :to="to" class="card flex flex-col gap-1 hover:border-primary/40 transition">
    <span class="text-sm text-muted">{{ label }}</span>
    <div class="flex items-baseline gap-2">
      <span class="font-mono text-2xl text-ink">{{ value }}</span>
      <span v-if="subvalue" class="font-mono text-sm text-muted">{{ subvalue }}</span>
    </div>
    <div v-if="delta !== undefined" class="flex items-center gap-1 text-xs">
      <span :class="delta >= 0 ? 'text-success-text' : 'text-danger-strong'">
        {{ delta >= 0 ? '+' : '' }}{{ delta }}%
      </span>
      <span class="text-muted">{{ deltaLabel }}</span>
    </div>
  </component>
</template>
