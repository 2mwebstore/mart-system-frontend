<script setup lang="ts">
const props = defineProps<{ tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }>()
const classMap: Record<string, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  neutral: 'bg-surface-subtle text-muted border border-line rounded-control px-2 py-0.5 text-xs font-medium',
}
</script>

<template>
  <span :class="classMap[props.tone]">{{ label }}</span>
</template>
