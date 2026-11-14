<script setup lang="ts">
import { reactive } from 'vue'
import Modal from '@/components/Modal.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import type { DiscountType } from '@/composables/useCart'
import { useMoney } from '@/composables/useMoney'

const props = defineProps<{
  title: string
  discountType: DiscountType
  discountValue: number
  note: string
  canDiscount: boolean
}>()
const emit = defineEmits<{ close: []; save: [{ discountType: DiscountType; discountValue: number; note: string }] }>()

// An amount discount is typed in the company's main currency.
const { symbol, currency } = useMoney()

const form = reactive({ discountType: props.discountType, discountValue: props.discountValue, note: props.note })

function save() {
  emit('save', { discountType: form.discountType, discountValue: Math.max(0, form.discountValue), note: form.note })
}
</script>

<template>
  <Modal :title="props.title" @close="emit('close')">
    <div class="space-y-4">
      <div v-if="props.canDiscount">
        <label class="block text-sm text-muted mb-1">{{ $t('pos.addDiscount') }}</label>
        <div class="flex items-center gap-2">
          <div class="flex rounded-control border border-line overflow-hidden text-sm shrink-0">
            <button
              type="button"
              class="px-3 py-1.5"
              :class="form.discountType === 'percent' ? 'bg-primary text-primary-ink' : 'text-muted'"
              @click="form.discountType = 'percent'"
            >
              %
            </button>
            <button
              type="button"
              class="px-3 py-1.5"
              :class="form.discountType === 'amount' ? 'bg-primary text-primary-ink' : 'text-muted'"
              @click="form.discountType = 'amount'"
            >
              {{ symbol }}
            </button>
          </div>
          <MoneyInput v-if="form.discountType === 'amount'" v-model="form.discountValue" :currency="currency" data-discount-input />
          <input v-else v-model.number="form.discountValue" type="number" min="0" max="100" step="1" class="input" data-discount-input />
        </div>
      </div>

      <div>
        <label class="block text-sm text-muted mb-1">{{ $t('pos.addNote') }}</label>
        <input v-model="form.note" type="text" class="input" :placeholder="$t('pos.notePlaceholder')" maxlength="255" />
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="btn-secondary" @click="emit('close')">{{ $t('common.cancel') }}</button>
        <button type="button" class="btn-primary" @click="save">{{ $t('common.save') }}</button>
      </div>
    </div>
  </Modal>
</template>
