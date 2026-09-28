<script setup lang="ts">
import Modal from '@/components/Modal.vue'
import type { Product } from '@/types/domain'
import { formatUSD, initialsOf } from '@/utils/format'
import { localName } from '@/i18n'

defineProps<{ product: Product }>()
const emit = defineEmits<{ close: []; add: [Product] }>()
</script>

<template>
  <Modal :title="localName(product.nameEn, product.nameKm)" @close="emit('close')">
    <div class="space-y-4">
      <div class="w-full aspect-square rounded-card bg-primary-tint flex items-center justify-center overflow-hidden">
        <img v-if="product.imageUrl" :src="product.imageUrl" :alt="localName(product.nameEn, product.nameKm)" class="w-full h-full object-cover" />
        <span v-else class="text-primary-tint-text font-heading text-6xl">{{ initialsOf(product.nameEn) }}</span>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <p class="font-mono text-xs text-muted">{{ product.sku }}</p>
          <p class="font-mono text-xl font-medium">{{ formatUSD(product.priceCents) }}</p>
        </div>
        <button type="button" class="btn-primary" :disabled="product.qty <= 0" @click="emit('add', product)">{{ $t('pos.addToCart') }}</button>
      </div>
    </div>
  </Modal>
</template>
