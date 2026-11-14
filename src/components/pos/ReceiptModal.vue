<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { Printer } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { useSettingsStore } from '@/stores/settings'
import { useBrandingStore } from '@/stores/branding'
import type { Sale } from '@/types/domain'
import { formatUSD, formatKHR, formatDateTime } from '@/utils/format'
import { taxTitle } from '@/utils/tax'
import { clearReceiptPrint, printReceipt as printOnReceiptPaper } from '@/utils/receiptPrint'
import { label, localName } from '@/i18n'
import { useMoney } from '@/composables/useMoney'

// Amounts are in the company's main currency (cents, or whole riel).
const { money, other, isRiel } = useMoney()

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
// The Disc column is there only when some line has a discount of its own.
const hasLineDiscount = computed(() => props.sale.items.some((item) => item.discountCents > 0))

// Only the receipt goes to the printer, sized to the 80 mm roll. It stays
// ready for the printer until the receipt is closed (see utils/receiptPrint).
function printReceipt() {
  const receipt = document.getElementById('pos-receipt')
  if (receipt) printOnReceiptPaper(receipt)
}
onUnmounted(clearReceiptPrint)
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

      <!-- Item | Qty | Disc | Total: each line's own discount, and its total after it.
           With no line discounts it's just Item | Qty | Total. -->
      <div
        class="border-t border-line pt-2 grid items-start gap-x-2 gap-y-1"
        :class="hasLineDiscount ? 'grid-cols-[minmax(0,1fr)_auto_auto_auto]' : 'grid-cols-[minmax(0,1fr)_auto_auto]'"
        data-receipt-items
      >
        <div class="contents font-medium" data-receipt-head>
          <span>{{ $t('col.item') }}</span>
          <span class="text-right">{{ $t('col.qty') }}</span>
          <span v-if="hasLineDiscount" class="text-right">{{ $t('pos.receiptDisc') }}</span>
          <span class="text-right">{{ $t('col.total') }}</span>
        </div>
        <div class="col-span-full border-b border-dashed border-line" aria-hidden="true" />
        <div v-for="item in sale.items" :key="item.productId" class="contents" data-receipt-line>
          <div class="min-w-0 break-words text-[12px] leading-tight pt-0.5" data-receipt-name>
            {{ localName(item.name, item.nameKm) }}
            <p v-if="item.qty > 1" class="text-[10px] text-muted">{{ $t('pos.each', { price: money(item.unitPriceCents) }) }}</p>
            <p v-if="item.note" class="text-[10px] text-muted font-body">{{ $t('pos.itemNoteLine', { note: item.note }) }}</p>
          </div>
          <span class="text-right">{{ item.qty }}</span>
          <span v-if="hasLineDiscount" class="text-right">{{ item.discountCents > 0 ? `-${money(item.discountCents)}` : '' }}</span>
          <span class="text-right">{{ money(item.lineTotalCents) }}</span>
        </div>
      </div>

      <div class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('pos.subtotal') }}</span><span>{{ money(linesTotal) }}</span></div>
        <div v-if="saleDiscount > 0" class="flex justify-between" data-sale-discount>
          <span>{{ $t('pos.discount') }}</span><span>-{{ money(saleDiscount) }}</span>
        </div>
        <div v-if="sale.taxCents > 0" class="flex justify-between" data-tax-line>
          <span>{{ $t('tax.line', { name: taxTitle(sale.taxName, sale.taxPercent) }) }}</span><span>{{ money(sale.taxCents) }}</span>
        </div>
        <div class="flex justify-between font-medium"><span>{{ $t('pos.total') }}</span><span>{{ money(sale.totalCents) }}</span></div>
        <!-- The other currency at the sale's own rate. -->
        <div class="flex justify-between text-muted"><span></span><span data-total-other>{{ other(sale.totalCents, sale.exchangeRate) }}</span></div>
      </div>

      <div class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('pos.paidBy') }}</span><span>{{ label('method', sale.payment.method) }}</span></div>
        <template v-if="sale.payment.method === 'CASH'">
          <div class="flex justify-between">
            <span>{{ $t('pos.tendered') }}</span>
            <span v-if="isRiel">{{ [sale.payment.receivedUsdCents ? formatUSD(sale.payment.receivedUsdCents) : '', sale.payment.receivedKhrRiel ? formatKHR(sale.payment.receivedKhrRiel) : ''].filter(Boolean).join(' + ') }}</span>
            <span v-else>{{ formatUSD(sale.payment.receivedUsdCents) }}{{ sale.payment.receivedKhrRiel ? ` + ${formatKHR(sale.payment.receivedKhrRiel)}` : '' }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ $t('pos.change') }}</span>
            <!-- A riel company gives all change in riel. -->
            <span v-if="isRiel" data-change>{{ formatKHR(sale.payment.changeKhrRiel) }}</span>
            <span v-else data-change>{{ formatUSD(sale.payment.changeUsdCents) }} + {{ formatKHR(sale.payment.changeKhrRiel) }}</span>
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
