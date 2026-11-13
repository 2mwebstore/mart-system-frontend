<script setup lang="ts">
// The POS cart's Edit: the discount on the whole sale, its tax and its note,
// in one popup. Nothing changes on the cart until Save.
import { reactive } from 'vue'
import Modal from '@/components/Modal.vue'
import DiscountInput from '@/components/DiscountInput.vue'
import TaxSelect from '@/components/TaxSelect.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import type { DiscountType } from '@/composables/useCart'

export interface SaleOptions {
  discountType: DiscountType
  discountValue: number
  taxRateId: number | null
  note: string
}

const props = defineProps<SaleOptions & { canDiscount: boolean }>()
const emit = defineEmits<{ close: []; save: [SaleOptions] }>()

const form = reactive<SaleOptions>({
  discountType: props.discountType,
  discountValue: props.discountValue,
  taxRateId: props.taxRateId,
  note: props.note,
})

function save() {
  emit('save', { ...form, discountValue: Math.max(0, Number(form.discountValue) || 0) })
}
</script>

<template>
  <Modal :title="$t('pos.saleOptions')" wide @close="emit('close')">
    <form class="space-y-4" data-sale-options @submit.prevent="save">
      <DiscountInput v-if="canDiscount" v-model:type="form.discountType" v-model:value="form.discountValue" :label="$t('pos.totalDiscount')" />
      <TaxSelect v-model="form.taxRateId" />
      <div>
        <RichTextEditor id="sale-note" v-model="form.note" :label="$t('pos.saleNote')" />
        <p class="text-xs text-muted mt-1">{{ $t('pos.saleNoteHint') }}</p>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="btn-secondary" @click="emit('close')">{{ $t('common.cancel') }}</button>
        <button type="submit" class="btn-primary">{{ $t('common.save') }}</button>
      </div>
    </form>
  </Modal>
</template>
