<script setup lang="ts">
import { Printer } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { useSettingsStore } from '@/stores/settings'
import type { Sale } from '@/types/domain'
import { formatUSD, formatKHR, formatDateTime } from '@/utils/format'
import { label, localName } from '@/i18n'

defineProps<{ sale: Sale }>()
const emit = defineEmits<{ close: [] }>()
const settings = useSettingsStore()

function printReceipt() {
  window.print()
}
</script>

<template>
  <Modal :title="$t('pos.paymentComplete')" @close="emit('close')">
    <div id="pos-receipt" class="font-mono text-sm space-y-3">
      <div class="text-center space-y-0.5 font-body">
        <p class="font-heading text-lg">{{ settings.app.receiptHeader || $t('app.brand') }}</p>
        <p class="text-muted">{{ sale.receiptNo }} · {{ formatDateTime(sale.soldAt) }}</p>
        <p class="text-muted">{{ $t('pos.cashierLine', { name: sale.cashier }) }}</p>
      </div>

      <div class="border-t border-line pt-2 space-y-1">
        <div v-for="item in sale.items" :key="item.productId">
          <div class="flex justify-between">
            <span>{{ item.qty }}× {{ localName(item.name, item.nameKm) }}</span>
            <span>{{ formatUSD(item.unitPriceCents * item.qty) }}</span>
          </div>
          <p v-if="item.note" class="text-xs text-muted pl-3 font-body">{{ $t('pos.itemNoteLine', { note: item.note }) }}</p>
        </div>
      </div>

      <div class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('pos.subtotal') }}</span><span>{{ formatUSD(sale.subtotalCents) }}</span></div>
        <div v-if="sale.discountCents > 0" class="flex justify-between"><span>{{ $t('pos.discount') }}</span><span>-{{ formatUSD(sale.discountCents) }}</span></div>
        <div class="flex justify-between font-medium"><span>{{ $t('pos.total') }}</span><span>{{ formatUSD(sale.totalCents) }}</span></div>
        <div class="flex justify-between text-muted"><span></span><span>{{ formatKHR(sale.totalRiel) }}</span></div>
      </div>

      <div class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('pos.paidBy') }}</span><span>{{ label('method', sale.payment.method) }}</span></div>
        <template v-if="sale.payment.method === 'CASH'">
          <div class="flex justify-between">
            <span>{{ $t('pos.tendered') }}</span>
            <span>{{ formatUSD(sale.payment.receivedUsdCents) }}{{ sale.payment.receivedKhrRiel ? ` + ${formatKHR(sale.payment.receivedKhrRiel)}` : '' }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ $t('pos.change') }}</span>
            <span>{{ formatUSD(sale.payment.changeUsdCents) }} + {{ formatKHR(sale.payment.changeKhrRiel) }}</span>
          </div>
        </template>
        <div v-if="sale.payment.reference" class="flex justify-between"><span>{{ $t('common.note') }}</span><span>{{ sale.payment.reference }}</span></div>
      </div>

      <div v-if="sale.customerName" class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('pos.customer') }}</span><span>{{ sale.customerName }}</span></div>
        <div class="flex justify-between"><span>{{ $t('pos.pointsEarned') }}</span><span>+{{ sale.pointsEarned }}</span></div>
      </div>

      <p class="text-center text-xs text-muted pt-2 font-body">{{ settings.app.receiptFooter || $t('pos.thanks') }}</p>
    </div>

    <div class="flex justify-end gap-2 pt-5 print:hidden">
      <button type="button" class="btn-secondary flex items-center gap-2" @click="printReceipt">
        <Printer :stroke-width="1.8" class="w-4 h-4" /> {{ $t('common.print') }}
      </button>
      <button type="button" class="btn-primary" @click="emit('close')">{{ $t('pos.newSale') }}</button>
    </div>
  </Modal>
</template>
