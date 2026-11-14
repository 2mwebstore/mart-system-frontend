<script setup lang="ts">
// A discount entered as % or an amount ($ or ៛, the company's main currency)
// — the same toggle the POS cart uses. The caller turns (type, value) into an
// amount against its own base; this only collects the input.
import { computed } from 'vue'
import type { DiscountType } from '@/composables/useCart'
import { useMoney } from '@/composables/useMoney'
import MoneyInput from '@/components/MoneyInput.vue'

defineProps<{ label: string; disabled?: boolean; small?: boolean }>()
const type = defineModel<DiscountType>('type', { required: true })
const value = defineModel<number>('value', { required: true })

const { symbol, currency } = useMoney()
const options = computed<{ type: DiscountType; label: string }[]>(() => [
  { type: 'percent', label: '%' },
  { type: 'amount', label: symbol.value },
])
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
    <MoneyInput v-if="type === 'amount'" v-model="value" :currency="currency" :disabled="disabled" :aria-label="label" data-discount-input />
    <input
      v-else
      v-model.number="value"
      type="number"
      min="0"
      max="100"
      step="1"
      class="input"
      :placeholder="$t('pos.discountHintPercent')"
      :aria-label="label"
      :disabled="disabled"
      data-discount-input
    />
  </div>
</template>
