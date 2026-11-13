<script setup lang="ts">
import { computed } from 'vue'
import { Printer } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { useSettingsStore } from '@/stores/settings'
import { useBrandingStore } from '@/stores/branding'
import type { Sale } from '@/types/domain'
import { formatUSD, formatKHR, formatDateTime } from '@/utils/format'
import { formatPercent } from '@/utils/tax'
import { printReceipt as printOnReceiptPaper } from '@/utils/receiptPrint'
import { label, localName } from '@/i18n'

const props = defineProps<{ sale: Sale }>()
const emit = defineEmits<{ close: [] }>()
const settings = useSettingsStore()
const branding = useBrandingStore()

// Each line shows its own discount and its total after it, so the subtotal is
// those totals added up and the discount under it is the one on the whole
// sale. (The sale's own discount is the two together.)
const linesTotal = computed(() => props.sale.items.reduce((sum, item) => sum + item.lineTotalCents, 0))
const lineDiscounts = computed(() => props.sale.items.reduce((sum, item) => sum + item.discountCents, 0))
const saleDiscount = computed(() => Math.max(0, props.sale.discountCents - lineDiscounts.value))

// Only the receipt goes to the printer, sized to the 80 mm roll.
function printReceipt() {
  const receipt = document.getElementById('pos-receipt')
  if (receipt) printOnReceiptPaper(receipt)
}
</script>

<template>
  <Modal :title="$t('pos.paymentComplete')" @close="emit('close')">
    <div id="pos-receipt" class="font-mono text-sm space-y-3">
      <div class="text-center space-y-0.5 font-body">
        <BrandLogo class="h-14 max-w-[10rem] mb-1" />
        <p class="font-heading text-lg">{{ settings.app.receiptHeader || branding.shortName }}</p>
        <p class="text-muted">{{ sale.receiptNo }} · {{ formatDateTime(sale.soldAt) }}</p>
        <p class="text-muted">{{ $t('pos.cashierLine', { name: sale.cashier }) }}</p>
      </div>

      <!-- Item | Qty | Disc | Total: each line's own discount, and its total after it. -->
      <div class="border-t border-line pt-2 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-start gap-x-2 gap-y-1" data-receipt-items>
        <div class="contents font-medium" data-receipt-head>
          <span>{{ $t('col.item') }}</span>
          <span class="text-right">{{ $t('col.qty') }}</span>
          <span class="text-right">{{ $t('pos.receiptDisc') }}</span>
          <span class="text-right">{{ $t('col.total') }}</span>
        </div>
        <div class="col-span-4 border-b border-dashed border-line" aria-hidden="true" />
        <div v-for="item in sale.items" :key="item.productId" class="contents" data-receipt-line>
          <div class="min-w-0 break-words text-[9px] leading-tight pt-1" data-receipt-name>
            {{ localName(item.name, item.nameKm) }}
            <p v-if="item.qty > 1" class="text-[8px] text-muted">{{ $t('pos.each', { price: formatUSD(item.unitPriceCents) }) }}</p>
            <p v-if="item.note" class="text-[8px] text-muted font-body">{{ $t('pos.itemNoteLine', { note: item.note }) }}</p>
          </div>
          <span class="text-right">{{ item.qty }}</span>
          <span class="text-right">{{ item.discountCents > 0 ? `-${formatUSD(item.discountCents)}` : '' }}</span>
          <span class="text-right">{{ formatUSD(item.lineTotalCents) }}</span>
        </div>
      </div>

      <div class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('pos.subtotal') }}</span><span>{{ formatUSD(linesTotal) }}</span></div>
        <div v-if="saleDiscount > 0" class="flex justify-between" data-sale-discount>
          <span>{{ $t('pos.discount') }}</span><span>-{{ formatUSD(saleDiscount) }}</span>
        </div>
        <div v-if="sale.taxCents > 0" class="flex justify-between" data-tax-line>
          <span>{{ $t('tax.line', { name: `${sale.taxName} ${formatPercent(sale.taxPercent)}` }) }}</span><span>{{ formatUSD(sale.taxCents) }}</span>
        </div>
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
