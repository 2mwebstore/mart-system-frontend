<script setup lang="ts">
// One invoice: items, totals, and its payments — record a payment (any number
// over time, each optionally with a proof image or link) or remove one entered
// by mistake. Editing and cancelling are handed back to the page.
import { computed, ref } from 'vue'
import { ExternalLink, Pencil, Printer, X } from 'lucide-vue-next'
import InvoicePaymentForm from '@/components/invoices/InvoicePaymentForm.vue'
import RichText from '@/components/RichText.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import { localName, seededLabel, t } from '@/i18n'
import { formatKHR, formatUSD } from '@/utils/format'
import { usdCentsToRiel } from '@/utils/money'
import type { Invoice, InvoicePaymentInput, PaymentMethodRow } from '@/types/domain'

const props = defineProps<{ invoice: Invoice; paymentMethods: PaymentMethodRow[]; canManage: boolean; busy?: boolean }>()
const emit = defineEmits<{ edit: []; cancel: [string]; addPayment: [InvoicePaymentInput]; deletePayment: [number]; print: [] }>()

const open = computed(() => props.invoice.status === 'OPEN')
const today = new Date().toISOString().slice(0, 10)
const overdue = computed(() => open.value && props.invoice.paymentStatus !== 'PAID' && !!props.invoice.dueDate && props.invoice.dueDate < today)

// ---- Proof viewer (a data URL can't be opened in a new tab everywhere) -------------
const viewing = ref<string | null>(null)
const isImage = (s: string) => s.startsWith('data:image/')

function cancelInvoice() {
  const reason = window.prompt(t('invoices.cancelPrompt', { code: props.invoice.code }), '')
  if (reason === null) return
  emit('cancel', reason.trim())
}

const statusTone = computed(() =>
  props.invoice.status === 'CANCELLED' ? 'neutral' : props.invoice.paymentStatus === 'PAID' ? 'success' : overdue.value ? 'danger' : 'warning',
)
const statusLabel = computed(() =>
  props.invoice.status === 'CANCELLED' ? t('invoices.status.CANCELLED') : overdue.value ? t('invoices.status.OVERDUE') : t(`invoices.status.${props.invoice.paymentStatus}`),
)
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-0.5">
        <p class="font-medium">{{ invoice.customerName }}</p>
        <p class="text-sm text-muted font-mono">{{ invoice.customerPhone }}</p>
        <p class="text-sm text-muted">
          {{ $t('invoices.invoiceDate') }}: <span class="font-mono">{{ invoice.invoiceDate }}</span>
          <template v-if="invoice.dueDate"> · {{ $t('invoices.dueDate') }}: <span class="font-mono" :class="overdue ? 'text-danger-strong font-medium' : ''">{{ invoice.dueDate }}</span></template>
        </p>
      </div>
      <StatusBadge :tone="statusTone" :label="statusLabel" />
    </div>

    <p v-if="invoice.status === 'CANCELLED'" class="rounded-control bg-surface-subtle px-3 py-2 text-sm">
      {{ $t('invoices.cancelledNote') }}<template v-if="invoice.cancelReason"> — {{ invoice.cancelReason }}</template>
    </p>

    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-line">
            <th class="py-2 font-medium">{{ $t('col.product') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.qty') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.price') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('pos.discount') }}</th>
            <th class="py-2 pr-1 font-medium text-right">{{ $t('col.lineTotal') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(it, i) in invoice.items" :key="i" class="border-b border-line last:border-0">
            <td class="py-2">
              <p>{{ localName(it.nameEn, it.nameKm) }}</p>
              <p class="text-xs text-muted font-mono">{{ it.sku }}</p>
              <p v-if="it.note" class="text-xs text-muted italic">↳ {{ it.note }}</p>
            </td>
            <td class="py-2 text-right font-mono">{{ it.qty }}</td>
            <td class="py-2 text-right font-mono">{{ formatUSD(it.unitPriceCents) }}</td>
            <td class="py-2 text-right font-mono">{{ it.discountCents ? `−${formatUSD(it.discountCents)}` : '—' }}</td>
            <td class="py-2 pr-1 text-right font-mono">{{ formatUSD(it.lineTotalCents) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="space-y-1 text-sm border-t border-line pt-3">
      <div class="flex justify-between"><span class="text-muted">{{ $t('pos.subtotal') }}</span><span class="font-mono">{{ formatUSD(invoice.subtotalCents) }}</span></div>
      <div v-if="invoice.lineDiscountCents" class="flex justify-between"><span class="text-muted">{{ $t('inventory.itemDiscounts') }}</span><span class="font-mono">−{{ formatUSD(invoice.lineDiscountCents) }}</span></div>
      <div v-if="invoice.discountCents" class="flex justify-between"><span class="text-muted">{{ $t('inventory.invoiceDiscount') }}</span><span class="font-mono">−{{ formatUSD(invoice.discountCents) }}</span></div>
      <div v-if="invoice.shippingCents" class="flex justify-between"><span class="text-muted">{{ $t('invoices.shippingLine') }}</span><span class="font-mono">{{ formatUSD(invoice.shippingCents) }}</span></div>
      <div class="flex justify-between font-medium">
        <span>{{ $t('col.total') }}</span>
        <span class="font-mono">{{ formatUSD(invoice.totalCents) }} <span class="text-muted font-normal">({{ formatKHR(usdCentsToRiel(invoice.totalCents, invoice.exchangeRate || 4100)) }})</span></span>
      </div>
      <div class="flex justify-between text-success-text"><span>{{ $t('invoices.paid') }}</span><span class="font-mono">{{ formatUSD(invoice.paidCents) }}</span></div>
      <div class="flex justify-between font-medium text-lg" :class="invoice.balanceCents > 0 && open ? (overdue ? 'text-danger-strong' : 'text-ink') : 'text-muted'">
        <span>{{ $t('invoices.balance') }}</span><span class="font-mono">{{ formatUSD(invoice.balanceCents) }}</span>
      </div>
    </div>

    <RichText v-if="invoice.note" :html="invoice.note" class="rounded-control bg-surface-subtle px-3 py-2 text-sm" />

    <!-- Payments -->
    <section class="space-y-2">
      <h3 class="font-heading text-base">{{ $t('invoices.payments') }}</h3>
      <p v-if="!invoice.payments?.length" class="text-sm text-muted">{{ $t('invoices.noPayments') }}</p>
      <div v-for="p in invoice.payments" :key="p.id" class="rounded-control border border-line p-3 flex items-start justify-between gap-3">
        <div class="min-w-0 space-y-0.5">
          <p class="text-sm">
            <span class="font-mono font-medium">{{ formatUSD(p.amountCents) }}</span>
            · {{ seededLabel('method', p.methodType, p.methodName) }} · <span class="font-mono text-muted">{{ p.paidOn }}</span>
          </p>
          <p v-if="p.reference" class="text-xs text-muted">{{ $t('col.reference') }}: {{ p.reference }}</p>
          <p v-if="p.note" class="text-xs text-muted italic">{{ p.note }}</p>
          <p class="text-xs text-muted">{{ $t('invoices.recordedBy', { name: p.user }) }}</p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button v-if="p.attachment && isImage(p.attachment)" type="button" class="rounded-control border border-line overflow-hidden w-12 h-12" :aria-label="$t('invoices.viewProof')" @click="viewing = p.attachment">
            <img :src="p.attachment" alt="" class="w-full h-full object-cover" />
          </button>
          <a v-else-if="p.attachment" :href="p.attachment" target="_blank" rel="noopener noreferrer" class="p-1.5 text-primary-text hover:underline text-xs flex items-center gap-1">
            <ExternalLink class="w-3.5 h-3.5" /> {{ $t('invoices.viewProof') }}
          </a>
          <ConfirmDelete v-if="canManage && open" :item-label="$t('invoices.payment')" :item-name="formatUSD(p.amountCents)" @confirm="emit('deletePayment', p.id)" />
        </div>
      </div>

      <InvoicePaymentForm
        v-if="canManage && open && invoice.balanceCents > 0"
        :balance-cents="invoice.balanceCents"
        :reset-key="invoice.paidCents"
        :payment-methods="paymentMethods"
        :busy="busy"
        @submit="(p) => emit('addPayment', p)"
      />
    </section>

    <div class="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
      <div class="flex gap-2">
        <button v-if="canManage && open && invoice.paidCents === 0" type="button" class="btn-secondary text-danger-strong" :disabled="busy" @click="cancelInvoice">{{ $t('invoices.cancelInvoice') }}</button>
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary flex items-center gap-2" @click="emit('print')"><Printer class="w-4 h-4" /> {{ $t('invoices.print') }}</button>
        <button v-if="canManage && open" type="button" class="btn-primary flex items-center gap-2" :disabled="busy" @click="emit('edit')"><Pencil class="w-4 h-4" /> {{ $t('invoices.edit') }}</button>
      </div>
    </div>

    <div v-if="viewing" class="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" @mousedown.self="viewing = null">
      <img :src="viewing" :alt="$t('invoices.proof')" class="max-w-full max-h-full rounded-control" />
      <button type="button" class="absolute top-4 right-4 bg-surface rounded-full p-2" :aria-label="$t('common.closeDialog')" @click="viewing = null"><X class="w-5 h-5" /></button>
    </div>
  </div>
</template>
