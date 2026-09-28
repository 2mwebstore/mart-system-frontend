<script setup lang="ts">
const props = defineProps<{ value: number; max: number; danger?: boolean }>()
const pct = () => Math.min(100, Math.round((props.value / Math.max(props.max, 1)) * 100))
</script>

<template>
  <div class="w-full h-1.5 rounded-full bg-line overflow-hidden">
    <div
      class="h-full rounded-full transition-all"
      :class="danger ? 'bg-danger-strong' : 'bg-primary'"
      :style="{ width: pct() + '%' }"
    />
  </div>
</template>
