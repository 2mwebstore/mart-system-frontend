<script setup lang="ts">
// Edit form for a paid sale on a still-open shift (Inventory → Sales). It
// sends the sale's full desired state; the server re-prices it and owns the
// final totals and change. The numbers shown here use the same maths as the
// server (calculateChange mirrors CalculateChange) so the cashier sees the
// result before saving.
import { computed, onMounted, ref } from 'vue'
import SearchAddInput from '@/components/SearchAddInput.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import DiscountInput from '@/components/DiscountInput.vue'
import { listPaymentMethods } from '@/api/settings'
import type { EditSaleInput } from '@/api/pos'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { localName, seededLabel } from '@/i18n'
import { calculateChange, usdCentsToRiel } from '@/utils/money'
import { formatKHR, formatUSD } from '@/utils/format'
import { X } from 'lucide-vue-next'
import type { Product, Sale } from '@/types/domain'
import type { DiscountType } from '@/composables/useCart'

const props = defineProps<{ sale: Sale; products: Product[]; saving?: boolean }>()
const emit = defineEmits<{ save: [EditSaleInput]; cancel: [] }>()

const auth = useAuthStore()
const settings = useSettingsStore()
const rate = computed(() => settings.rate)
const canDiscount = auth.hasPermission('pos.discount')

// --- Lines -----------------------------------------------------------------
// Discounts can be typed as % or $ (same rule as the POS cart: a line % is of
// the line's gross, the cart % is of what's left after line discounts). The
// server only stores cents, so a saved sale reopens in $.
interface EditLine {
  productId: number
  name: string
  sku: string
  qty: number
  unitPriceCents: number
  discountType: DiscountType
  discountValue: number
  note: string
}
const lines = ref<EditLine[]>(
  props.sale.items.map((i) => ({
    productId: i.productId,
    name: localName(i.name, i.nameKm),
    sku: i.sku,
    qty: i.qty,
    unitPriceCents: i.unitPriceCents,
    discountType: 'amount' as DiscountType,
    discountValue: i.discountCents / 100,
    note: i.note,
  })),
)
// The sale stores line and cart discounts together; the cart part is what's left.
const lineDiscountsStored = props.sale.items.reduce((n, i) => n + i.discountCents, 0)
const cartDiscountType = ref<DiscountType>('amount')
const cartDiscountValue = ref(Math.max(0, props.sale.discountCents - lineDiscountsStored) / 100)

const productOptions = computed(() =>
  props.products
    .filter((p) => p.active)
    .map((p) => ({ value: p.id, label: localName(p.nameEn, p.nameKm), sub: [p.sku, p.nameEn, p.nameKm].filter(Boolean).join(' · ') })),
)
function addItem(productId: string | number) {
  const product = props.products.find((p) => p.id === productId)
  if (!product) return
  const existing = lines.value.find((l) => l.productId === product.id)
  if (existing) {
    existing.qty += 1
    return
  }
  lines.value.push({
    productId: product.id,
    name: localName(product.nameEn, product.nameKm),
    sku: product.sku,
    qty: 1,
    unitPriceCents: product.priceCents,
    discountType: 'amount',
    discountValue: 0,
    note: '',
  })
}
function removeLine(productId: number) {
  lines.value = lines.value.filter((l) => l.productId !== productId)
}

// --- Payment ---------------------------------------------------------------
type PayType = EditSaleInput['payment']['method']
const currentType = props.sale.payment.method
// Until the configured methods load, offer Cash and the sale's own method.
const fallbackMethods: { id: number; name: string; type: PayType }[] = [
  { id: 0, name: 'Cash', type: 'CASH' },
  ...(currentType === 'CASH' ? [] : [{ id: 1, name: currentType, type: currentType }]),
]
const methods = ref(fallbackMethods)
const methodId = ref(fallbackMethods.find((m) => m.type === currentType)?.id ?? 0)
onMounted(async () => {
  try {
    const rows = (await listPaymentMethods()).filter((m) => m.enabled && m.type !== 'OTHER') as { id: number; name: string; type: PayType }[]
    if (rows.length) {
      methods.value = rows
      methodId.value = (rows.find((m) => m.type === currentType) ?? rows.find((m) => m.type === 'CASH') ?? rows[0]).id
    }
  } catch {
    // keep the fallback list; the API client already toasted
  }
})
const methodOptions = computed(() => methods.value.map((m) => ({ value: m.id, label: seededLabel('method', m.type, m.name) })))
const methodType = computed<PayType>(() => methods.value.find((m) => m.id === methodId.value)?.type ?? 'CASH')
const isCash = computed(() => methodType.value === 'CASH')

const tenderUSD = ref(props.sale.payment.receivedUsdCents / 100)
const tenderKHR = ref(props.sale.payment.receivedKhrRiel)
const reference = ref(props.sale.payment.reference)

// --- Totals (preview; the server is authoritative) --------------------------
function toCents(dollars: number) {
  return Math.max(0, Math.round((Number(dollars) || 0) * 100))
}
// Cents off `base` for a % or $ discount, clamped to 0..base.
function discountOf(base: number, type: DiscountType, value: number) {
  const v = Math.max(0, Number(value) || 0)
  const raw = type === 'percent' ? Math.round((base * Math.min(v, 100)) / 100) : Math.round(v * 100)
  return Math.min(raw, base)
}
const itemsSubtotal = computed(() => lines.value.reduce((n, l) => n + l.qty * l.unitPriceCents, 0))
function lineDiscount(l: EditLine) {
  return discountOf(l.qty * l.unitPriceCents, l.discountType, l.discountValue)
}
const lineDiscountTotal = computed(() => lines.value.reduce((n, l) => n + lineDiscount(l), 0))
const afterLines = computed(() => itemsSubtotal.value - lineDiscountTotal.value)
const cartDiscountCents = computed(() => discountOf(afterLines.value, cartDiscountType.value, cartDiscountValue.value))
const totalCents = computed(() => afterLines.value - cartDiscountCents.value)
const totalRiel = computed(() => usdCentsToRiel(totalCents.value, rate.value))

const tenderUSDCents = computed(() => toCents(tenderUSD.value))
const tenderKHRRiel = computed(() => Math.max(0, Math.round(Number(tenderKHR.value) || 0)))
const change = computed(() => calculateChange(totalCents.value, tenderUSDCents.value, tenderKHRRiel.value, rate.value))
const cashShort = computed(() => isCash.value && change.value.shortCents > 0)

const canSave = computed(
  () =>
    lines.value.length > 0 &&
    lines.value.every((l) => Number.isInteger(Number(l.qty)) && Number(l.qty) >= 1) &&
    !cashShort.value &&
    !props.saving,
)

function save() {
  if (!canSave.value) return
  emit('save', {
    items: lines.value.map((l) => ({
      productId: l.productId,
      qty: Number(l.qty),
      discountCents: lineDiscount(l),
      note: l.note.trim(),
    })),
    discountCents: cartDiscountCents.value,
    payment: {
      method: methodType.value,
      receivedUsdCents: isCash.value ? tenderUSDCents.value : 0,
      receivedKhrRiel: isCash.value ? tenderKHRRiel.value : 0,
      reference: isCash.value ? '' : reference.value.trim(),
    },
  })
}
</script>

<template>
  <div class="space-y-4">
    <SearchAddInput :label="$t('inventory.items')" :options="productOptions" :placeholder="$t('inventory.itemsSearchHint')" @select="addItem" />

    <div class="space-y-2">
      <p v-if="lines.length === 0" class="rounded-control border border-dashed border-line py-4 text-center text-sm text-muted">
        {{ $t('inventory.noItemsYet') }}
      </p>
      <div v-for="line in lines" :key="line.productId" class="rounded-control border border-line p-3 space-y-2">
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ line.name }}</p>
            <p class="text-xs text-muted font-mono">{{ line.sku }} · {{ formatUSD(line.unitPriceCents) }}</p>
          </div>
          <button type="button" class="p-1.5 text-muted hover:text-danger-strong" :aria-label="$t('inventory.removeItem')" @click="removeLine(line.productId)">
            <X class="w-4 h-4" />
          </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div>
            <label class="block text-xs text-muted mb-1">{{ $t('inventory.qty') }}</label>
            <input v-model.number="line.qty" type="number" min="1" step="1" class="input" />
          </div>
          <DiscountInput
            v-model:type="line.discountType"
            v-model:value="line.discountValue"
            :label="$t('pos.discount')"
            :disabled="!canDiscount"
            small
          />
          <div class="col-span-2 sm:col-span-1">
            <label class="block text-xs text-muted mb-1">{{ $t('common.note') }}</label>
            <input v-model="line.note" type="text" maxlength="255" class="input" :placeholder="$t('pos.notePlaceholder')" />
          </div>
        </div>
        <p class="text-right text-sm font-mono">
          <span v-if="lineDiscount(line)" class="text-muted mr-2">−{{ formatUSD(lineDiscount(line)) }}</span>
          {{ formatUSD(line.qty * line.unitPriceCents - lineDiscount(line)) }}
        </p>
      </div>
    </div>

    <div class="max-w-xs">
      <DiscountInput v-model:type="cartDiscountType" v-model:value="cartDiscountValue" :label="$t('pos.totalDiscount')" :disabled="!canDiscount" />
      <p v-if="cartDiscountCents" class="mt-1 text-xs text-muted font-mono">−{{ formatUSD(cartDiscountCents) }}</p>
      <p v-if="!canDiscount" class="mt-1 text-xs text-muted">{{ $t('inventory.discountNoPermHint') }}</p>
    </div>

    <div class="rounded-control bg-surface-subtle p-3 space-y-1 text-sm">
      <div class="flex justify-between">
        <span class="text-muted">{{ $t('pos.subtotal') }}</span>
        <span class="font-mono">{{ formatUSD(itemsSubtotal) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted">{{ $t('pos.discount') }}</span>
        <span class="font-mono">−{{ formatUSD(lineDiscountTotal + cartDiscountCents) }}</span>
      </div>
      <div class="flex justify-between font-medium">
        <span>{{ $t('col.total') }}</span>
        <span class="font-mono">{{ formatUSD(totalCents) }} ({{ formatKHR(totalRiel) }})</span>
      </div>
    </div>

    <SearchableSelect v-model="methodId" :label="$t('pos.paymentMethod')" :options="methodOptions" :searchable="false" :clearable="false" />

    <div v-if="isCash" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block text-sm text-muted mb-1">{{ $t('pos.tenderedUsd') }}</label>
        <input v-model.number="tenderUSD" type="number" min="0" step="0.01" class="input" />
      </div>
      <div>
        <label class="block text-sm text-muted mb-1">{{ $t('pos.tenderedKhr') }}</label>
        <input v-model.number="tenderKHR" type="number" min="0" step="100" class="input" />
      </div>
      <p class="sm:col-span-2 text-sm" :class="cashShort ? 'text-danger-strong' : 'text-muted'">
        <template v-if="cashShort">{{ $t('inventory.saleStillOwed') }}: {{ formatUSD(change.shortCents) }}</template>
        <template v-else>{{ $t('pos.changeDue') }}: {{ formatUSD(change.usdCents) }} · {{ formatKHR(change.khrRiel) }}</template>
      </p>
    </div>
    <div v-else>
      <label class="block text-sm text-muted mb-1">{{ $t('col.reference') }}</label>
      <input v-model="reference" type="text" maxlength="120" class="input" :placeholder="$t('pos.noteHintKhqr')" />
    </div>

    <p class="text-xs text-muted">{{ $t('inventory.saleEditHint') }}</p>
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" class="btn-secondary" @click="emit('cancel')">{{ $t('common.cancel') }}</button>
      <button type="button" class="btn-primary" :disabled="!canSave" @click="save">{{ $t('common.save') }}</button>
    </div>
  </div>
</template>
