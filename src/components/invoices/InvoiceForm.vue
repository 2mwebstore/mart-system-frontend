<script setup lang="ts">
// Create / edit an invoice (back-office sale). Items are added with the same
// search box as the purchase-order form; each line has its own price (filled
// with the catalog price, editable for wholesale), % or $ discount and note.
// The server re-checks everything and owns the totals.
import { computed, ref } from 'vue'
import { X } from 'lucide-vue-next'
import SearchableSelect from '@/components/SearchableSelect.vue'
import SearchAddInput from '@/components/SearchAddInput.vue'
import DiscountInput from '@/components/DiscountInput.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import InvoicePaymentForm from '@/components/invoices/InvoicePaymentForm.vue'
import type { DiscountType } from '@/composables/useCart'
import { useSettingsStore } from '@/stores/settings'
import { localName, t } from '@/i18n'
import { formatKHR, formatUSD } from '@/utils/format'
import { usdCentsToRiel } from '@/utils/money'
import type { Customer, Invoice, InvoiceInput, InvoicePaymentInput, PaymentMethodRow, Product } from '@/types/domain'

const props = defineProps<{
  invoice: Invoice | null
  branchId: number
  products: Product[]
  customers: Customer[]
  // For the optional "Payment received" section on a new invoice.
  paymentMethods?: PaymentMethodRow[]
  saving?: boolean
}>()
const emit = defineEmits<{ save: [InvoiceInput]; cancel: [] }>()
const settings = useSettingsStore()

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number)
  return isoDay(new Date(y, m - 1, d + n))
}

interface Line {
  productId: number
  name: string
  sku: string
  qty: number
  priceDollars: number
  discountType: DiscountType
  discountValue: number
  note: string
}

const customerId = ref<number | null>(props.invoice?.customerId ?? null)
const invoiceDate = ref(props.invoice?.invoiceDate ?? isoDay(new Date()))
const dueDate = ref(props.invoice?.dueDate ?? '')
const lines = ref<Line[]>(
  (props.invoice?.items ?? []).map((i) => ({
    productId: i.productId,
    name: localName(i.nameEn, i.nameKm),
    sku: i.sku,
    qty: i.qty,
    priceDollars: i.unitPriceCents / 100,
    discountType: 'amount',
    discountValue: i.discountCents / 100,
    note: i.note,
  })),
)
const discountType = ref<DiscountType>('amount')
const discountValue = ref((props.invoice?.discountCents ?? 0) / 100)
const shippingDollars = ref((props.invoice?.shippingCents ?? 0) / 100)
const note = ref(props.invoice?.note ?? '')

const customerOptions = computed(() => props.customers.map((c) => ({ value: c.id, label: c.name, sub: c.phone })))
// Sellable lines: active, and not a family parent (its variants are sold instead).
const productOptions = computed(() =>
  props.products
    .filter((p) => p.active && p.variantCount === 0)
    .map((p) => ({
      value: p.id,
      label: localName(p.nameEn, p.nameKm),
      sub: [p.sku, formatUSD(p.priceCents), p.productType === 'SERVICE' ? '' : t('invoices.inStock', { n: p.qty })].filter(Boolean).join(' · '),
    })),
)
// Same as the PO form: the product picked lands on top; picking one already on
// the invoice adds one to it instead of a second line.
function addItem(productId: string | number) {
  const p = props.products.find((x) => x.id === productId)
  if (!p) return
  const i = lines.value.findIndex((l) => l.productId === p.id)
  if (i !== -1) {
    const [l] = lines.value.splice(i, 1)
    l.qty += 1
    lines.value.unshift(l)
    return
  }
  lines.value.unshift({
    productId: p.id,
    name: localName(p.nameEn, p.nameKm),
    sku: p.sku,
    qty: 1,
    priceDollars: p.priceCents / 100,
    discountType: 'amount',
    discountValue: 0,
    note: '',
  })
}
function removeLine(productId: number) {
  lines.value = lines.value.filter((l) => l.productId !== productId)
}

function cents(dollars: number) {
  return Math.max(0, Math.round((Number(dollars) || 0) * 100))
}
function discountOf(base: number, type: DiscountType, value: number) {
  const v = Math.max(0, Number(value) || 0)
  const raw = type === 'percent' ? Math.round((base * Math.min(v, 100)) / 100) : Math.round(v * 100)
  return Math.min(raw, base)
}
const gross = (l: Line) => (Number(l.qty) || 0) * cents(l.priceDollars)
const lineDiscount = (l: Line) => discountOf(gross(l), l.discountType, l.discountValue)
const subtotal = computed(() => lines.value.reduce((n, l) => n + gross(l), 0))
const lineDiscounts = computed(() => lines.value.reduce((n, l) => n + lineDiscount(l), 0))
const invoiceDiscount = computed(() => discountOf(subtotal.value - lineDiscounts.value, discountType.value, discountValue.value))
const shipping = computed(() => cents(shippingDollars.value))
const total = computed(() => subtotal.value - lineDiscounts.value - invoiceDiscount.value + shipping.value)
const paid = computed(() => props.invoice?.paidCents ?? 0)

// Money received when the invoice is made (new invoices only; optional).
const payNow = ref<{ payment: InvoicePaymentInput | null; problem: string }>({ payment: null, problem: '' })

const problems = computed(() => {
  const out: string[] = []
  if (!customerId.value) out.push(t('invoices.needCustomer'))
  if (lines.value.length === 0) out.push(t('invoices.needItems'))
  if (lines.value.some((l) => !Number.isInteger(Number(l.qty)) || Number(l.qty) < 1)) out.push(t('invoices.needQty'))
  if (dueDate.value && dueDate.value < invoiceDate.value) out.push(t('invoices.dueBeforeDate'))
  if (total.value < paid.value) out.push(t('invoices.belowPaid', { paid: formatUSD(paid.value) }))
  if (!props.invoice && payNow.value.problem) out.push(payNow.value.problem)
  return out
})

function save() {
  if (problems.value.length || props.saving || customerId.value === null) return
  emit('save', {
    branchId: props.branchId,
    customerId: customerId.value,
    invoiceDate: invoiceDate.value,
    dueDate: dueDate.value,
    items: lines.value.map((l) => ({
      productId: l.productId,
      qty: Number(l.qty),
      unitPriceCents: cents(l.priceDollars),
      discountCents: lineDiscount(l),
      note: l.note.trim(),
    })),
    discountCents: invoiceDiscount.value,
    shippingCents: shipping.value,
    note: note.value,
    ...(!props.invoice && payNow.value.payment ? { payment: payNow.value.payment } : {}),
  })
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="save">
    <SearchableSelect
      :model-value="customerId"
      :label="$t('invoices.customer')"
      :options="customerOptions"
      :placeholder="$t('invoices.pickCustomer')"
      :clearable="false"
      required
      @update:model-value="(v) => (customerId = v === null ? null : Number(v))"
    />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block text-sm text-muted mb-1" for="inv-date">{{ $t('invoices.invoiceDate') }}</label>
        <input id="inv-date" v-model="invoiceDate" type="date" class="input" required />
      </div>
      <div>
        <label class="block text-sm text-muted mb-1" for="inv-due">{{ $t('invoices.dueDate') }}</label>
        <input id="inv-due" v-model="dueDate" type="date" class="input" :min="invoiceDate" />
        <div class="flex flex-wrap gap-1 mt-1">
          <button v-for="n in [7, 15, 30]" :key="n" type="button" class="text-xs px-2 py-0.5 rounded-control border border-line text-muted hover:text-ink" @click="dueDate = addDays(invoiceDate, n)">
            {{ $t('invoices.inDays', { n }) }}
          </button>
          <button v-if="dueDate" type="button" class="text-xs px-2 py-0.5 text-muted hover:text-ink" @click="dueDate = ''">{{ $t('invoices.noDueDate') }}</button>
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <SearchAddInput :label="$t('inventory.items')" :options="productOptions" :placeholder="$t('inventory.itemsSearchHint')" @select="addItem" />
      <p v-if="lines.length === 0" class="rounded-control border border-dashed border-line py-4 text-center text-sm text-muted">{{ $t('inventory.noItemsYet') }}</p>
      <div v-for="l in lines" :key="l.productId" class="rounded-control border border-line p-3 space-y-2">
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ l.name }}</p>
            <p class="text-xs text-muted font-mono">{{ l.sku }}</p>
          </div>
          <button type="button" class="p-1.5 -m-1 text-muted hover:text-danger-strong" :aria-label="$t('inventory.removeItem')" @click="removeLine(l.productId)">
            <X class="w-4 h-4" />
          </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div>
            <label class="block text-xs text-muted mb-1">{{ $t('inventory.qty') }}</label>
            <input v-model.number="l.qty" type="number" min="1" step="1" class="input" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">{{ $t('invoices.unitPrice') }}</label>
            <input v-model.number="l.priceDollars" type="number" min="0" step="0.01" class="input" />
          </div>
          <DiscountInput v-model:type="l.discountType" v-model:value="l.discountValue" class="col-span-2 sm:col-span-1" :label="$t('pos.discount')" small />
        </div>
        <input v-model="l.note" type="text" maxlength="255" class="input text-sm" :placeholder="$t('invoices.lineNoteHint')" :aria-label="$t('common.note')" />
        <p class="text-right text-sm font-mono">
          <span v-if="lineDiscount(l)" class="text-muted line-through mr-2">{{ formatUSD(gross(l)) }}</span>
          {{ formatUSD(gross(l) - lineDiscount(l)) }}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <DiscountInput v-model:type="discountType" v-model:value="discountValue" :label="$t('inventory.invoiceDiscount')" />
      <div>
        <label class="block text-sm text-muted mb-1" for="inv-ship">{{ $t('invoices.shipping') }}</label>
        <input id="inv-ship" v-model.number="shippingDollars" type="number" min="0" step="0.01" class="input" />
      </div>
    </div>

    <RichTextEditor id="inv-note" v-model="note" :label="$t('common.note')" :placeholder="$t('invoices.noteHint')" />

    <div class="rounded-control bg-surface-subtle p-3 space-y-1 text-sm">
      <div class="flex justify-between"><span class="text-muted">{{ $t('pos.subtotal') }}</span><span class="font-mono">{{ formatUSD(subtotal) }}</span></div>
      <div v-if="lineDiscounts" class="flex justify-between"><span class="text-muted">{{ $t('inventory.itemDiscounts') }}</span><span class="font-mono">−{{ formatUSD(lineDiscounts) }}</span></div>
      <div v-if="invoiceDiscount" class="flex justify-between"><span class="text-muted">{{ $t('inventory.invoiceDiscount') }}</span><span class="font-mono">−{{ formatUSD(invoiceDiscount) }}</span></div>
      <div v-if="shipping" class="flex justify-between"><span class="text-muted">{{ $t('invoices.shippingLine') }}</span><span class="font-mono">{{ formatUSD(shipping) }}</span></div>
      <div class="flex justify-between font-medium border-t border-line pt-1">
        <span>{{ $t('col.total') }}</span>
        <span class="font-mono">{{ formatUSD(total) }} <span class="text-muted font-normal">({{ formatKHR(usdCentsToRiel(total, settings.rate)) }})</span></span>
      </div>
      <div v-if="paid" class="flex justify-between text-muted"><span>{{ $t('invoices.alreadyPaid') }}</span><span class="font-mono">{{ formatUSD(paid) }}</span></div>
    </div>

    <section v-if="!invoice && paymentMethods?.length" class="space-y-2">
      <div>
        <h3 class="font-medium text-sm">{{ $t('invoices.paymentNow') }}</h3>
        <p class="text-xs text-muted">{{ $t('invoices.paymentNowHint') }}</p>
      </div>
      <InvoicePaymentForm embedded :balance-cents="total" :payment-methods="paymentMethods" @change="(v) => (payNow = v)" />
    </section>

    <ul v-if="problems.length && (lines.length || customerId)" class="text-sm text-danger-strong space-y-0.5" role="alert">
      <li v-for="p in problems" :key="p">{{ p }}</li>
    </ul>

    <div class="flex justify-end gap-2">
      <button type="button" class="btn-secondary" @click="emit('cancel')">{{ $t('common.cancel') }}</button>
      <button type="submit" class="btn-primary" :disabled="saving || problems.length > 0">
        {{ invoice ? $t('common.save') : $t('invoices.create') }}
      </button>
    </div>
  </form>
</template>
