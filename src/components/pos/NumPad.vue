<script setup lang="ts">
import { Delete } from 'lucide-vue-next'

defineProps<{ modelValue: string; maxLength: number }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

function onDigit(d: string, value: string, maxLength: number) {
  if (value.length >= maxLength) return
  emit('update:modelValue', value + d)
}

function onBackspace(value: string) {
  emit('update:modelValue', value.slice(0, -1))
}
</script>

<template>
  <div class="grid grid-cols-3 gap-3">
    <button
      v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
      :key="d"
      type="button"
      class="h-16 rounded-control bg-surface-subtle border border-line text-xl font-medium hover:bg-primary-tint active:scale-95 transition"
      @click="onDigit(d, modelValue, maxLength)"
    >
      {{ d }}
    </button>
    <button
      type="button"
      class="h-16 rounded-control bg-surface-subtle border border-line text-sm text-muted hover:bg-surface-subtle active:scale-95 transition"
      @click="emit('update:modelValue', '')"
    >
      {{ $t('common.clear') }}
    </button>
    <button
      type="button"
      class="h-16 rounded-control bg-surface-subtle border border-line text-xl font-medium hover:bg-primary-tint active:scale-95 transition"
      @click="onDigit('0', modelValue, maxLength)"
    >
      0
    </button>
    <button
      type="button"
      class="h-16 rounded-control bg-surface-subtle border border-line flex items-center justify-center hover:bg-primary-tint active:scale-95 transition"
      :aria-label="$t('common.backspace')"
      @click="onBackspace(modelValue)"
    >
      <Delete :stroke-width="1.8" class="w-5 h-5" />
    </button>
  </div>
</template>
