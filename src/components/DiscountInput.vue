<script setup lang="ts">
// A discount entered as % or $ — the same toggle the POS cart uses. The
// caller turns (type, value) into cents against its own base; this only
// collects the input.
import type { DiscountType } from '@/composables/useCart'

defineProps<{ label: string; disabled?: boolean; small?: boolean }>()
const type = defineModel<DiscountType>('type', { required: true })
const value = defineModel<number>('value', { required: true })

const options: { type: DiscountType; label: string }[] = [
  { type: 'percent', label: '%' },
  { type: 'amount', label: '$' },
]
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-1">
      <label :class="small ? 'text-xs' : 'text-sm'" class="text-muted">{{ label }}</label>
      <div class="flex rounded-control border border-line overflow-hidden text-xs" role="group" :aria-label="label">
        <button
          v-for="opt in options"
          :key="opt.type"
          type="button"
          class="px-2 py-0.5"
          :class="type === opt.type ? 'bg-primary text-primary-ink' : 'text-muted'"
          :disabled="disabled"
          :aria-pressed="type === opt.type"
          @click="type = opt.type"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
    <input
      v-model.number="value"
      type="number"
      min="0"
      :max="type === 'percent' ? 100 : undefined"
      :step="type === 'percent' ? 1 : 0.01"
      class="input"
      :placeholder="type === 'percent' ? $t('pos.discountHintPercent') : $t('pos.discountHintAmount')"
      :disabled="disabled"
    />
  </div>
</template>
