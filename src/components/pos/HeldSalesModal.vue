<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { useShiftStore, type HeldSale, type HeldItem } from '@/stores/shift'
import { formatUSD } from '@/utils/format'
import { t } from '@/i18n'

const shift = useShiftStore()
const emit = defineEmits<{ close: []; resume: [HeldSale] }>()

function itemNetCents(item: HeldItem) {
  const gross = item.unitPriceCents * item.qty
  if (!item.discountType || !item.discountValue) return gross
  const raw = item.discountType === 'percent' ? Math.round((gross * item.discountValue) / 100) : Math.round(item.discountValue * 100)
  return gross - Math.min(Math.max(raw, 0), gross)
}
function lineTotal(h: HeldSale) {
  const afterItemDiscounts = h.items.reduce((sum, i) => sum + itemNetCents(i), 0)
  const raw = h.discountType === 'percent' ? Math.round((afterItemDiscounts * h.discountValue) / 100) : Math.round(h.discountValue * 100)
  const cartDiscount = Math.min(Math.max(raw, 0), afterItemDiscounts)
  return afterItemDiscounts - cartDiscount
}
function itemCount(h: HeldSale) {
  return h.items.reduce((sum, i) => sum + i.qty, 0)
}
const itemsLabel = (h: HeldSale) => t('pos.itemCount', { n: itemCount(h) }, itemCount(h))
const summaryOf = (h: HeldSale) => t('pos.holdSummary', { items: itemsLabel(h), total: formatUSD(lineTotal(h)) })

function resume(h: HeldSale) {
  const resumed = shift.resumeHeldSale(h.id)
  if (resumed) emit('resume', resumed)
}
function discard(h: HeldSale) {
  if (window.confirm(t('pos.confirmDiscard', { label: summaryOf(h) }))) {
    shift.discardHeldSale(h.id)
  }
}
</script>

<template>
  <Modal :title="$t('pos.heldSales')" wide @close="emit('close')">
    <div v-if="shift.heldSales.length === 0" class="text-center text-muted py-8">{{ $t('pos.noHeld') }}</div>
    <div v-else class="space-y-2">
      <div
        v-for="h in shift.heldSales"
        :key="h.id"
        class="flex items-center justify-between rounded-control border border-line p-3"
      >
        <div>
          <p class="font-medium">{{ summaryOf(h) }}</p>
          <p class="text-xs text-muted">{{ $t('pos.heldAt', { items: itemsLabel(h), time: h.heldAt }) }}</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="font-mono">{{ formatUSD(lineTotal(h)) }}</span>
          <button type="button" class="btn-primary px-4 py-1.5 text-sm" @click="resume(h)">{{ $t('pos.resume') }}</button>
          <button type="button" class="p-2 text-muted hover:text-danger-strong" :aria-label="$t('pos.discardAria')" @click="discard(h)">
            <Trash2 :stroke-width="1.8" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </Modal>
</template>
