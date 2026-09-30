<script setup lang="ts">
import Modal from '@/components/Modal.vue'
import { useSettingsStore } from '@/stores/settings'
import type { Product } from '@/types/domain'
import { formatUSD } from '@/utils/format'
import { localName } from '@/i18n'

const props = defineProps<{ product: Product; variants: Product[] }>()
const emit = defineEmits<{ close: []; add: [Product] }>()
const settings = useSettingsStore()

function outOfStock(v: Product) {
  if (settings.app.allowOutOfStockSale) return false
  return v.productType !== 'SERVICE' && v.qty <= 0
}
function pick(v: Product) {
  if (outOfStock(v)) return
  emit('add', v)
}
</script>

<template>
  <Modal :title="localName(props.product.nameEn, props.product.nameKm)" @close="emit('close')">
    <div class="space-y-2">
      <p class="text-xs text-muted">{{ $t('pos.pickVariantHint') }}</p>
      <button
        v-for="v in props.variants"
        :key="v.id"
        type="button"
        class="w-full flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2.5 text-left hover:bg-surface-subtle transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        :disabled="outOfStock(v)"
        @click="pick(v)"
      >
        <span class="text-sm font-medium">{{ v.variantName }}</span>
        <span class="flex items-center gap-3 shrink-0">
          <span v-if="outOfStock(v)" class="text-xs text-danger-strong">{{ $t('stockStatus.out') }}</span>
          <span class="font-mono text-sm">{{ formatUSD(v.priceCents) }}</span>
        </span>
      </button>
    </div>
  </Modal>
</template>
