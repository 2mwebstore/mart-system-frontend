<script setup lang="ts">
// New purchase order / edit one as its own page (/inventory/purchase-orders/new,
// /inventory/purchase-orders/:id/edit) rather than a popup: the form is long
// (supplier, branch, every item with its cost and discount, shipping, tax,
// note). Saving, or Cancel, goes back to the purchase orders list.
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, X } from 'lucide-vue-next'
import * as catalogApi from '@/api/catalog'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import { useMoney } from '@/composables/useMoney'
import type { DiscountType } from '@/composables/useCart'
import { nameFor, percentFor, startingRate, taxCents, taxTitle } from '@/utils/tax'
import SearchableSelect from '@/components/SearchableSelect.vue'
import SearchAddInput from '@/components/SearchAddInput.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import DiscountInput from '@/components/DiscountInput.vue'
import TaxSelect from '@/components/TaxSelect.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { label, localName, t } from '@/i18n'
import type { Product, PurchaseOrder, Supplier } from '@/types/domain'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const settings = useSettingsStore()
const toast = useToast()
const { money, toMinor, toMajor, symbol, currency } = useMoney()

const editId = computed(() => (route.params.id ? Number(route.params.id) : null))
// The order being edited: it keeps its own tax rate as it was.
const po = ref<PurchaseOrder | null>(null)
const suppliers = ref<Supplier[]>([])
const products = ref<Product[]>([])
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)

interface PoFormItem {
  productId: number
  name: string
  sku: string
  qty: number
  unitCostDollars: number // in the main currency's major unit; sent as minor units
  // % or an amount off the whole line (qty × unit cost); sent as minor units.
  discountType: DiscountType
  discountValue: number
}

// A new order goes to the branch picked in the header.
const form = reactive<{
  supplierId: number | null
  branchId: number | null
  status: string
  note: string
  shippingDollars: number
  taxRateId: number | null
  items: PoFormItem[]
}>({
  supplierId: null,
  branchId: auth.activeBranchId ?? auth.branches[0]?.id ?? null,
  status: 'DRAFT',
  note: '',
  shippingDollars: 0,
  taxRateId: startingRate(settings.app.taxDefaults?.purchase, settings.taxRates),
  items: [],
})

function fillFrom(order: PurchaseOrder) {
  Object.assign(form, {
    supplierId: order.supplierId,
    branchId: order.branchId,
    status: order.status,
    note: order.note,
    shippingDollars: toMajor(order.shippingCents),
    taxRateId: order.taxRateId,
    items: order.items.map((i) => ({
      productId: i.productId,
      name: localName(i.productName, i.productNameKm),
      sku: i.sku,
      qty: i.qtyOrdered,
      unitCostDollars: toMajor(i.unitCostCents),
      discountType: 'amount' as DiscountType,
      discountValue: toMajor(i.discountCents || 0),
    })),
  })
}

onMounted(async () => {
  try {
    if (editId.value !== null) {
      po.value = await catalogApi.getPurchaseOrder(editId.value)
      // Receiving moved its stock; it can't change any more.
      if (po.value.status === 'RECEIVED') {
        loadError.value = t('apiErrors.poLockedEdit')
        return
      }
      fillFrom(po.value)
    }
    // The picker searches every product, not one page of them.
    const branch = form.branchId ?? auth.branches[0]?.id ?? 1
    const [s, p] = await Promise.all([
      auth.hasPermission('supplier.view') ? catalogApi.listSuppliers() : Promise.resolve([]),
      auth.hasPermission('product.view') ? catalogApi.listProducts(branch) : Promise.resolve([]),
    ])
    suppliers.value = s
    products.value = p
  } catch {
    loadError.value = t('inventory.poLoadFailed')
  } finally {
    loading.value = false
  }
})

const supplierOptions = computed(() => suppliers.value.map((s) => ({ value: s.id, label: s.name, sub: s.phone })))
const branchOptions = computed(() => auth.branches.map((b) => ({ value: b.id, label: b.name, sub: b.code })))
// A purchase order orders stock, so only STANDARD products are offered.
const productOptions = computed(() =>
  products.value
    .filter((p) => p.active && p.productType !== 'SERVICE')
    .map((p) => ({ value: p.id, label: localName(p.nameEn, p.nameKm), sub: [p.sku, p.nameEn, p.nameKm].filter(Boolean).join(' · ') })),
)
// RECEIVED is reached only through the Receive action (it moves stock), so
// it isn't offered as a status to pick by hand.
const statusOptions = computed(() => ['DRAFT', 'SENT', 'PARTIAL', 'CANCELLED'].map((v) => ({ value: v, label: label('poStatus', v) })))

// Picked from the search box. The product just picked always lands at the
// top; one already on the order gets one more and moves to the top instead of
// being added twice. Its unit cost starts at the product's current cost.
function addProduct(productId: string | number) {
  const product = products.value.find((p) => p.id === productId)
  if (!product) return
  const idx = form.items.findIndex((i) => i.productId === product.id)
  if (idx !== -1) {
    const [existing] = form.items.splice(idx, 1)
    existing.qty += 1
    form.items.unshift(existing)
  } else {
    form.items.unshift({
      productId: product.id,
      name: localName(product.nameEn, product.nameKm),
      sku: product.sku,
      qty: 1,
      unitCostDollars: toMajor(product.costCents),
      discountType: 'amount',
      discountValue: 0,
    })
  }
}
function removeItem(productId: number) {
  const idx = form.items.findIndex((i) => i.productId === productId)
  if (idx !== -1) form.items.splice(idx, 1)
}
function lineGrossCents(i: PoFormItem) {
  return (Number(i.qty) || 0) * toMinor(Number(i.unitCostDollars) || 0)
}
// Same % / amount rule as the sale editor, held to the line's cost.
function lineDiscountCents(i: PoFormItem) {
  const gross = lineGrossCents(i)
  const v = Math.max(0, Number(i.discountValue) || 0)
  const raw = i.discountType === 'percent' ? Math.round((gross * Math.min(v, 100)) / 100) : toMinor(v)
  return Math.min(raw, gross)
}
const discountCents = computed(() => form.items.reduce((sum, i) => sum + lineDiscountCents(i), 0))
const itemsCents = computed(() => form.items.reduce((sum, i) => sum + lineGrossCents(i) - lineDiscountCents(i), 0))
const shippingCents = computed(() => toMinor(form.shippingDollars))
// Tax on the items after discounts plus shipping, as the server works it out.
const taxPercent = computed(() => percentFor(form.taxRateId, settings.taxRates, po.value))
const taxName = computed(() => nameFor(form.taxRateId, settings.taxRates, po.value))
const taxAmountCents = computed(() => taxCents(itemsCents.value + shippingCents.value, taxPercent.value))
const totalCents = computed(() => itemsCents.value + shippingCents.value + taxAmountCents.value)

function back() {
  router.push({ name: 'inventory-po' })
}

async function submit() {
  if (form.supplierId === null || form.branchId === null || form.items.length === 0) {
    toast.error(t('inventory.pickPoFields'))
    return
  }
  const input = {
    supplierId: form.supplierId,
    branchId: form.branchId,
    status: form.status,
    note: form.note,
    shippingCents: shippingCents.value,
    taxRateId: form.taxRateId,
    items: form.items.map((i) => ({
      productId: i.productId,
      qty: Number(i.qty),
      unitCostCents: toMinor(i.unitCostDollars),
      discountCents: lineDiscountCents(i),
    })),
  }
  saving.value = true
  try {
    if (po.value) await catalogApi.updatePurchaseOrder(po.value.id, input)
    else await catalogApi.createPurchaseOrder(input)
    toast.success(po.value ? t('inventory.poUpdated') : t('inventory.poCreated'))
    back()
  } catch {
    // toasted by the API client
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="space-y-2">
      <RouterLink :to="{ name: 'inventory-po' }" class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft class="w-4 h-4" /> {{ $t('inventory.backToPos') }}
      </RouterLink>
      <h1 class="font-heading text-2xl">{{ po ? $t('inventory.editPo', { code: po.code }) : $t('inventory.newPo') }}</h1>
    </div>

    <p v-if="loading" class="text-muted">{{ $t('tableMenu.loading') }}</p>
    <div v-else-if="loadError" class="card space-y-3">
      <p class="text-danger-strong">{{ loadError }}</p>
      <button type="button" class="btn-secondary" @click="back">{{ $t('inventory.backToPos') }}</button>
    </div>
    <!-- Large screens: the items on the left, who and how much on the right. -->
    <form v-else class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start" data-po-form @submit.prevent="submit">
      <div class="card space-y-3 lg:col-start-3 lg:row-start-1">
        <SearchableSelect v-model="form.supplierId" :label="$t('common.supplier')" :options="supplierOptions" required />
        <SearchableSelect v-model="form.branchId" :label="$t('common.branch')" :options="branchOptions" required />
        <SearchableSelect
          v-if="po"
          v-model="form.status"
          :label="$t('common.status')"
          :options="statusOptions"
          :searchable="false"
          :clearable="false"
        />
      </div>

      <div class="card space-y-4 lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <div>
          <SearchAddInput :label="$t('inventory.items')" :options="productOptions" :placeholder="$t('inventory.itemsSearchHint')" @select="addProduct" />
          <div class="mt-2 space-y-2">
            <p v-if="form.items.length === 0" class="rounded-control border border-dashed border-line py-6 text-center text-sm text-muted">
              {{ $t('inventory.noItemsYet') }}
            </p>
            <div v-for="item in form.items" :key="item.productId" class="rounded-control border border-line p-3 space-y-2" data-po-item>
              <div class="flex items-start gap-2">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ item.name }}</p>
                  <p class="text-xs text-muted font-mono">{{ item.sku }}</p>
                </div>
                <button type="button" class="p-1.5 -m-1 text-muted hover:text-danger-strong" :aria-label="$t('inventory.removeItem')" @click="removeItem(item.productId)">
                  <X class="w-4 h-4" />
                </button>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                <div>
                  <label class="block text-xs text-muted mb-1">{{ $t('inventory.qty') }}</label>
                  <input v-model.number="item.qty" type="number" min="1" class="input" />
                </div>
                <div>
                  <label class="block text-xs text-muted mb-1">{{ $t('inventory.unitCostUsd', { currency: symbol }) }}</label>
                  <MoneyInput v-model="item.unitCostDollars" :currency="currency" />
                </div>
                <DiscountInput v-model:type="item.discountType" v-model:value="item.discountValue" :label="$t('pos.discount')" small />
                <p class="text-right text-sm font-mono pb-2" data-po-line-total>
                  <span v-if="lineDiscountCents(item)" class="text-muted line-through mr-2">{{ money(lineGrossCents(item)) }}</span>
                  {{ money(lineGrossCents(item) - lineDiscountCents(item)) }}
                </p>
              </div>
            </div>
          </div>
          <p v-if="discountCents" class="text-sm text-right font-mono mt-2 text-muted">{{ $t('inventory.itemDiscounts') }}: −{{ money(discountCents) }}</p>
          <p class="text-sm text-right font-mono mt-2">{{ $t('inventory.itemsTotal', { amount: money(itemsCents) }) }}</p>
        </div>

        <RichTextEditor id="po-note" v-model="form.note" :label="$t('common.note')" :placeholder="$t('inventory.poNoteHint')" />
      </div>

      <div class="card space-y-3 lg:col-start-3 lg:row-start-2">
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('inventory.shippingUsd', { currency: symbol }) }}</label>
          <MoneyInput v-model="form.shippingDollars" :currency="currency" />
        </div>
        <TaxSelect v-model="form.taxRateId" :kept="po" />
        <div class="space-y-1 border-t border-line pt-3 text-right">
          <p v-if="form.taxRateId" class="text-sm font-mono text-muted" data-tax-line>
            {{ $t('tax.line', { name: taxTitle(taxName, taxPercent) }) }}: {{ money(taxAmountCents) }}
          </p>
          <p class="font-mono font-medium" data-po-total>{{ $t('inventory.totalLine', { amount: money(totalCents) }) }}</p>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-secondary" @click="back">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ po ? $t('common.save') : $t('settings.create') }}</button>
        </div>
      </div>
    </form>
  </div>
</template>
