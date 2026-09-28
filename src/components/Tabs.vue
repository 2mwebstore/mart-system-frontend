<script setup lang="ts">
defineProps<{ tabs: { key: string; label: string }[]; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <div class="flex gap-1 border-b border-line" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.key"
      class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition"
      :class="modelValue === tab.key ? 'border-primary text-primary-text' : 'border-transparent text-muted hover:text-ink'"
      @click="emit('update:modelValue', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
