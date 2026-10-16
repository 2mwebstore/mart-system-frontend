<script setup lang="ts">
// Printable invoice (A4), opened from an invoice's Print button.
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Printer } from 'lucide-vue-next'
import { getInvoice } from '@/api/invoices'
import RichText from '@/components/RichText.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useBrandingStore } from '@/stores/branding'
import { localName, seededLabel, t } from '@/i18n'
import { formatKHR, formatUSD } from '@/utils/format'
import { usdCentsToRiel } from '@/utils/money'
import type { Invoice } from '@/types/domain'

const route = useRoute()
const auth = useAuthStore()
const settings = useSettingsStore()
const branding = useBrandingStore()
const invoice = ref<Invoice | null>(null)
const error = ref('')
const storeName = computed(() => settings.app.receiptHeader || branding.shortName)
const branchName = computed(() => auth.branches.find((b) => b.id === invoice.value?.branchId)?.name ?? '')

onMounted(async () => {
  try {
    invoice.value = await getInvoice(Number(route.params.id))
    document.title = `${invoice.value.code} · ${storeName.value}`
  } catch {
    error.value = t('invoices.loadFailed')
  }
})
function printNow() {
  window.print()
}
</script>

<template>
  <div class="min-h-screen bg-page print:bg-white">
    <div class="print:hidden sticky top-0 z-10 bg-surface border-b border-line">
      <div class="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <p class="font-heading text-lg">{{ invoice?.code }}</p>
        <button type="button" class="btn-primary flex items-center gap-2" :disabled="!invoice" @click="printNow">
          <Printer :stroke-width="1.8" class="w-4 h-4" /> {{ $t('invoices.print') }}
        </button>
      </div>
    </div>

    <p v-if="error" class="py-16 text-center text-danger-strong">{{ error }}</p>
    <article v-else-if="invoice" class="max-w-3xl mx-auto my-6 print:my-0 bg-white text-black p-8 print:p-0 rounded-card print:rounded-none border border-line print:border-0 space-y-6 text-sm">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-start gap-3">
          <BrandLogo class="h-16 max-w-[10rem]" />
          <div>
            <p class="font-heading text-2xl">{{ storeName }}</p>
            <p class="text-gray-600">{{ branchName }}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="font-heading text-xl tracking-wide uppercase">{{ $t('invoices.invoice') }}</p>
          <p class="font-mono">{{ invoice.code }}</p>
          <p class="text-gray-600">{{ $t('invoices.invoiceDate') }}: <span class="font-mono">{{ invoice.invoiceDate }}</span></p>
          <p v-if="invoice.dueDate" class="text-gray-600">{{ $t('invoices.dueDate') }}: <span class="font-mono">{{ invoice.dueDate }}</span></p>
        </div>
      </header>

      <section>
        <p class="text-gray-600 text-xs uppercase tracking-wide">{{ $t('invoices.billTo') }}</p>
        <p class="font-medium">{{ invoice.customerName }}</p>
        <p class="font-mono text-gray-600">{{ invoice.customerPhone }}</p>
      </section>

      <p v-if="invoice.status === 'CANCELLED'" class="border border-black px-3 py-2 font-medium">{{ $t('invoices.status.CANCELLED') }}</p>

      <table class="w-full">
        <thead>
          <tr class="text-left border-b-2 border-black">
            <th class="py-2 font-medium">{{ $t('col.product') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.qty') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.price') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('pos.discount') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.lineTotal') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(it, i) in invoice.items" :key="i" class="border-b border-gray-300 align-top">
            <td class="py-2">
              {{ localName(it.nameEn, it.nameKm) }}
              <span class="block text-xs text-gray-600 font-mono">{{ it.sku }}</span>
              <span v-if="it.note" class="block text-xs text-gray-600 italic">{{ it.note }}</span>
            </td>
            <td class="py-2 text-right font-mono">{{ it.qty }}</td>
            <td class="py-2 text-right font-mono">{{ formatUSD(it.unitPriceCents) }}</td>
            <td class="py-2 text-right font-mono">{{ it.discountCents ? `−${formatUSD(it.discountCents)}` : '' }}</td>
            <td class="py-2 text-right font-mono">{{ formatUSD(it.lineTotalCents) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="ml-auto w-full sm:w-72 space-y-1">
        <div class="flex justify-between"><span>{{ $t('pos.subtotal') }}</span><span class="font-mono">{{ formatUSD(invoice.subtotalCents) }}</span></div>
        <div v-if="invoice.lineDiscountCents" class="flex justify-between"><span>{{ $t('inventory.itemDiscounts') }}</span><span class="font-mono">−{{ formatUSD(invoice.lineDiscountCents) }}</span></div>
        <div v-if="invoice.discountCents" class="flex justify-between"><span>{{ $t('inventory.invoiceDiscount') }}</span><span class="font-mono">−{{ formatUSD(invoice.discountCents) }}</span></div>
        <div v-if="invoice.shippingCents" class="flex justify-between"><span>{{ $t('invoices.shippingLine') }}</span><span class="font-mono">{{ formatUSD(invoice.shippingCents) }}</span></div>
        <div class="flex justify-between font-medium border-t-2 border-black pt-1 text-base">
          <span>{{ $t('col.total') }}</span><span class="font-mono">{{ formatUSD(invoice.totalCents) }}</span>
        </div>
        <div class="flex justify-between text-gray-600"><span></span><span class="font-mono">{{ formatKHR(usdCentsToRiel(invoice.totalCents, invoice.exchangeRate || 4100)) }}</span></div>
        <div class="flex justify-between"><span>{{ $t('invoices.paid') }}</span><span class="font-mono">{{ formatUSD(invoice.paidCents) }}</span></div>
        <div class="flex justify-between font-medium text-base"><span>{{ $t('invoices.balanceDue') }}</span><span class="font-mono">{{ formatUSD(invoice.balanceCents) }}</span></div>
      </div>

      <section v-if="invoice.payments?.length">
        <p class="text-gray-600 text-xs uppercase tracking-wide mb-1">{{ $t('invoices.payments') }}</p>
        <table class="w-full">
          <tbody>
            <tr v-for="p in invoice.payments" :key="p.id" class="border-b border-gray-300">
              <td class="py-1 font-mono">{{ p.paidOn }}</td>
              <td class="py-1">{{ seededLabel('method', p.methodType, p.methodName) }}<template v-if="p.reference"> · {{ p.reference }}</template></td>
              <td class="py-1 text-right font-mono">{{ formatUSD(p.amountCents) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <RichText v-if="invoice.note" :html="invoice.note" />
      <p v-if="settings.app.receiptFooter" class="text-center text-gray-600 whitespace-pre-line border-t border-gray-300 pt-4">{{ settings.app.receiptFooter }}</p>
    </article>
  </div>
</template>

<style scoped>
@media print {
  @page {
    size: A4;
    margin: 14mm;
  }
}
</style>
