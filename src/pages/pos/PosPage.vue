<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Minus, Pencil, Plus, Search, Trash2, X } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useShiftStore, type HeldSale } from '@/stores/shift'
import { useCart, type DiscountType } from '@/composables/useCart'
import * as catalogApi from '@/api/catalog'
import { listCustomers } from '@/api/people'
import type { Category, CreateSaleInput, Customer, Product, Sale } from '@/types/domain'
import { formatUSD, initialsOf } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import SearchableSelect from '@/components/SearchableSelect.vue'
import PaymentModal from '@/components/pos/PaymentModal.vue'
import ReceiptModal from '@/components/pos/ReceiptModal.vue'
import CashMovementModal from '@/components/pos/CashMovementModal.vue'
import RecentSalesModal from '@/components/pos/RecentSalesModal.vue'
import HeldSalesModal from '@/components/pos/HeldSalesModal.vue'
import VariantPickerModal from '@/components/pos/VariantPickerModal.vue'
import LineEditModal from '@/components/pos/LineEditModal.vue'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import { localName, t } from '@/i18n'

const auth = useAuthStore()
const shift = useShiftStore()
const router = useRouter()
const toast = useToast()
const cart = useCart()
const settings = useSettingsStore()

const canDiscount = auth.hasPermission('pos.discount')

// Catalog, stock and customers come from the API for this till's branch.
const products = ref<Product[]>([])
const categories = ref<Category[]>([])
const customers = ref<Customer[]>([])
const loadProducts = async () => void (products.value = await catalogApi.listProducts(shift.branchId))
onMounted(async () => {
  try {
    const [cats, custs] = await Promise.all([catalogApi.listCategories(), listCustomers(), loadProducts()])
    categories.value = cats
    customers.value = custs
  } catch {
    // the API client already toasted the reason
  }
})

const search = ref('')
const categoryFilter = ref<number | 'all'>('all')
const categoryOptions = computed(() => [{ id: 'all' as const, nameEn: t('common.all'), nameKm: t('common.all') }, ...categories.value])

// hideWhenOutOfStock (per-product) removes a product from the POS grid
// entirely once it's out of stock, rather than just greying its tile out.
// settings.app.allowOutOfStockSale (store-wide, Settings > System) is the
// opposite knob — it lets a sale go through anyway; see familyOutOfStock
// below. SERVICE is exempt from both (never stocked, always sellable).
function isHiddenFromPos(p: Product) {
  return p.hideWhenOutOfStock && p.productType !== 'SERVICE' && p.qty <= 0
}
// Variant rows never get their own tile — they're reached through the
// merged parent card's picker (see pickerFor below). Grouped once here so
// the grid, search, stock badge and price-range display can all reuse it. A
// variant that's hidden-when-out-of-stock is left out of the picker too.
const variantsByParent = computed(() => {
  const map = new Map<number, Product[]>()
  for (const p of products.value) {
    if (p.parentProductId === null || isHiddenFromPos(p)) continue
    const list = map.get(p.parentProductId) ?? []
    list.push(p)
    map.set(p.parentProductId, list)
  }
  return map
})
function matchesQuery(p: Product, q: string) {
  return `${p.nameEn} ${p.nameKm} ${p.sku} ${p.barcode ?? ''}`.toLowerCase().includes(q)
}
const filteredProducts = computed(() => {
  const q = search.value.trim().toLowerCase()
  return products.value.filter((p) => {
    if (p.parentProductId !== null) return false
    if (!p.active) return false
    if (categoryFilter.value !== 'all' && p.categoryId !== categoryFilter.value) return false
    // A family card with every variant hidden has nothing left to pick —
    // drop it too, same as a standalone hidden product.
    if (p.variantCount > 0) {
      if ((variantsByParent.value.get(p.id) ?? []).length === 0) return false
    } else if (isHiddenFromPos(p)) {
      return false
    }
    if (q) {
      const variants = variantsByParent.value.get(p.id) ?? []
      if (!matchesQuery(p, q) && !variants.some((v) => matchesQuery(v, q))) return false
    }
    return true
  })
})
// A family card's own price/stock aren't shown once it has variants — each
// variant has its own, and the card itself is never added to the cart
// directly (see pickVariant below).
function priceRangeLabel(variants: Product[]) {
  const prices = variants.map((v) => v.priceCents)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatUSD(min) : `${formatUSD(min)}–${formatUSD(max)}`
}
function isOutOfStock(p: Product) {
  if (settings.app.allowOutOfStockSale) return false
  return p.productType !== 'SERVICE' && p.qty <= 0
}
function familyOutOfStock(variants: Product[]) {
  return variants.every((v) => isOutOfStock(v))
}

// New items land at the top of the cart (see useCart.addProduct) — if the
// cashier had scrolled the list down, scroll back up so the item they just
// picked is actually visible.
const cartListRef = ref<HTMLElement | null>(null)
function addProduct(p: Product) {
  cart.addProduct(p)
  nextTick(() => cartListRef.value?.scrollTo({ top: 0 }))
}

function onSearchEnter() {
  const q = search.value.trim().toLowerCase()
  if (!q) return
  const exact = products.value.find((p) => p.sku.toLowerCase() === q || p.barcode === q)
  if (exact) {
    addProduct(exact)
    search.value = ''
  }
}

// --- Variant picker: a family card always opens this instead of adding
// directly (the parent itself isn't sellable once it has variants — see
// docs/DECISIONS.md). A non-variant card has no popup at all any more —
// one click, straight into the cart. ---
const pickerFor = ref<Product | null>(null)
function openCard(p: Product) {
  if (p.variantCount > 0) {
    pickerFor.value = p
  } else {
    addProduct(p)
  }
}
function pickVariant(v: Product) {
  addProduct(v)
  pickerFor.value = null
}

// --- Customer select ---
const customerOptions = computed(() => customers.value.map((c) => ({ value: c.id, label: c.name, sub: `${c.tier} · ${c.phone}` })))

// --- Per-line discount + note, edited together in one popup (one pencil icon) ---
function lineDiscountLabel(line: { discountType: DiscountType; discountValue: number }) {
  if (!line.discountValue) return ''
  return line.discountType === 'percent' ? t('pos.percentOff', { v: line.discountValue }) : t('pos.amountOff', { v: formatUSD(Math.round(line.discountValue * 100)) })
}
const editingLineFor = ref<number | null>(null)
const editingLine = computed(() => cart.lines.find((l) => l.productId === editingLineFor.value) ?? null)
function saveLineEdit(v: { discountType: DiscountType; discountValue: number; note: string }) {
  if (editingLineFor.value === null) return
  cart.setLineDiscount(editingLineFor.value, v.discountType, v.discountValue)
  cart.setLineNote(editingLineFor.value, v.note)
  editingLineFor.value = null
}

// --- Modals ---
const showPayment = ref(false)
const showCashMovement = ref(false)
const showRecentSales = ref(false)
const showHeldSales = ref(false)
const completedSale = ref<Sale | null>(null)
const submitting = ref(false)
// One key per payment attempt: a retry after a network hiccup re-sends the
// same key, so the server returns the first sale instead of charging twice.
let idempotencyKey = ''

function openPayment() {
  if (cart.lines.length === 0) return
  idempotencyKey = crypto.randomUUID()
  showPayment.value = true
}

async function onPaid(payment: CreateSaleInput['payment']) {
  submitting.value = true
  try {
    const sale = await shift.recordSale({
      deviceKey: auth.deviceKey,
      idempotencyKey,
      customerId: cart.customerId.value,
      items: cart.lines.map((l) => ({ productId: l.productId, qty: l.qty, discountCents: cart.lineDiscountCents(l), note: l.note })),
      discountCents: cart.cartDiscountCents.value,
      payment,
    })
    showPayment.value = false
    cart.clear()
    completedSale.value = sale
    // Stock changed and the customer may have earned points.
    void Promise.all([loadProducts(), listCustomers().then((c) => (customers.value = c))]).catch(() => {})
  } catch {
    // the API client already toasted the reason (e.g. not enough stock); the
    // payment modal stays open so the cashier can adjust
  } finally {
    submitting.value = false
  }
}

function closeReceipt() {
  completedSale.value = null
}

function holdCurrentSale() {
  if (cart.lines.length === 0) return
  shift.holdSale({
    label: '', // shown as a summary computed from the items, so it follows the language
    items: cart.lines.map((l) => ({
      productId: l.productId,
      nameEn: l.nameEn,
      nameKm: l.nameKm,
      sku: l.sku,
      qty: l.qty,
      unitPriceCents: l.unitPriceCents,
      discountType: l.discountType,
      discountValue: l.discountValue,
      note: l.note,
    })),
    discountType: cart.cartDiscountType.value,
    discountValue: cart.cartDiscountValue.value,
    customerId: cart.customerId.value,
  })
  cart.clear()
  toast.success(t('pos.saleHeld'))
}

function voidCurrentSale() {
  if (cart.lines.length === 0) return
  if (window.confirm(t('pos.confirmClear'))) {
    cart.clear()
  }
}

function onResumeHeld(held: HeldSale) {
  cart.clear()
  // addProduct puts each item on top, so walk the held items backwards to
  // end up with the original order.
  for (const item of [...held.items].reverse()) {
    const product = products.value.find((p) => p.id === item.productId)
    if (!product) continue
    for (let i = 0; i < item.qty; i++) cart.addProduct(product)
    if (item.discountType && item.discountValue) {
      cart.setLineDiscount(item.productId, item.discountType, item.discountValue)
    }
    if (item.note) cart.setLineNote(item.productId, item.note)
  }
  cart.cartDiscountType.value = held.discountType
  cart.cartDiscountValue.value = held.discountValue
  cart.customerId.value = held.customerId
  showHeldSales.value = false
  toast.info(t('pos.heldResumed'))
}

function goToCloseShift() {
  router.push({ name: 'pos-close-shift' })
}
</script>

<template>
  <div class="h-screen flex flex-col">
    <header class="h-14 shrink-0 flex items-center justify-between gap-4 border-b border-line bg-surface px-4">
      <div class="flex items-center gap-3">
        <p class="font-heading text-lg">{{ settings.app.receiptHeader || $t('app.brand') }}</p>
        <span class="text-muted text-sm">{{ auth.tillName }} · {{ auth.user?.full_name }}</span>
      </div>
      <div class="flex items-center gap-2">
        <LanguageSwitch class="mr-2" />
        <button type="button" class="btn-secondary text-sm px-3 py-1.5 relative" @click="showHeldSales = true">
          {{ $t('pos.heldSales') }}<span v-if="shift.heldSales.length" class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-ink text-[10px]">
            {{ shift.heldSales.length }}
          </span>
        </button>
        <button type="button" class="btn-secondary text-sm px-3 py-1.5" @click="showRecentSales = true">{{ $t('pos.sales') }}</button>
        <button type="button" class="btn-secondary text-sm px-3 py-1.5" @click="showCashMovement = true">{{ $t('shifts.cashMovement') }}</button>
        <button type="button" class="btn-secondary text-sm px-3 py-1.5" @click="goToCloseShift">{{ $t('shifts.closeShift') }}</button>
        <RouterLink :to="{ name: 'dashboard' }" class="btn-secondary text-sm px-3 py-1.5">{{ $t('pos.backOffice') }}</RouterLink>
      </div>
    </header>

    <div class="flex-1 flex min-h-0">
      <!-- Cart -->
      <div class="w-96 shrink-0 border-l border-line bg-surface flex flex-col min-h-0">
        <div class="p-4 border-b border-line">
          <SearchableSelect v-model="cart.customerId.value" :label="$t('pos.customer')" :options="customerOptions" :placeholder="$t('pos.walkIn')" />
        </div>

        <div ref="cartListRef" class="flex-1 overflow-y-auto divide-y divide-line">
          <div v-if="cart.lines.length === 0" class="text-center text-muted py-10 px-4 text-sm">{{ $t('pos.cartEmpty') }}</div>
          <div v-for="line in cart.lines" :key="line.productId" class="p-3 space-y-1.5">
            <div class="flex items-center gap-2">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ localName(line.nameEn, line.nameKm) }}</p>
                <p class="text-xs text-muted font-mono">{{ $t('pos.each', { price: formatUSD(line.unitPriceCents) }) }}</p>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" class="w-7 h-7 rounded-control border border-line flex items-center justify-center hover:bg-surface-subtle" @click="cart.decQty(line.productId)">
                  <Minus class="w-3.5 h-3.5" />
                </button>
                <span class="w-6 text-center font-mono text-sm">{{ line.qty }}</span>
                <button type="button" class="w-7 h-7 rounded-control border border-line flex items-center justify-center hover:bg-surface-subtle" @click="cart.incQty(line.productId)">
                  <Plus class="w-3.5 h-3.5" />
                </button>
              </div>
              <p class="w-16 text-right font-mono text-sm shrink-0">{{ formatUSD(cart.lineNetCents(line)) }}</p>
              <button type="button" class="p-1 text-muted hover:text-ink shrink-0" :aria-label="$t('pos.editLineAria')" @click="editingLineFor = line.productId">
                <Pencil class="w-4 h-4" />
              </button>
              <button type="button" class="p-1 text-muted hover:text-danger-strong shrink-0" :aria-label="$t('inventory.removeItem')" @click="cart.removeLine(line.productId)">
                <X class="w-4 h-4" />
              </button>
            </div>

            <div v-if="line.discountValue > 0 || line.note" class="flex items-center justify-between gap-2 pl-0.5 text-xs text-muted">
              <span class="truncate">{{ line.note }}</span>
              <span v-if="line.discountValue > 0" class="shrink-0">{{ lineDiscountLabel(line) }} (-{{ formatUSD(cart.lineDiscountCents(line)) }})</span>
            </div>
          </div>
        </div>

        <div class="border-t border-line p-4 space-y-3">
          <div v-if="canDiscount" class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="text-xs text-muted">{{ $t('pos.totalDiscount') }}</label>
              <div class="flex rounded-control border border-line overflow-hidden text-xs">
                <button
                  type="button"
                  class="px-2 py-1"
                  :class="cart.cartDiscountType.value === 'percent' ? 'bg-primary text-primary-ink' : 'text-muted'"
                  @click="cart.cartDiscountType.value = 'percent'"
                >
                  %
                </button>
                <button
                  type="button"
                  class="px-2 py-1"
                  :class="cart.cartDiscountType.value === 'amount' ? 'bg-primary text-primary-ink' : 'text-muted'"
                  @click="cart.cartDiscountType.value = 'amount'"
                >
                  $
                </button>
              </div>
            </div>
            <input
              v-model.number="cart.cartDiscountValue.value"
              type="number"
              min="0"
              class="input py-1.5 text-sm"
              :placeholder="cart.cartDiscountType.value === 'percent' ? $t('pos.discountHintPercent') : $t('pos.discountHintAmount')"
            />
          </div>

          <div class="space-y-1 text-sm">
            <div class="flex justify-between"><span class="text-muted">{{ $t('pos.subtotal') }}</span><span class="font-mono">{{ formatUSD(cart.subtotalCents.value) }}</span></div>
            <div v-if="cart.discountCentsCapped.value > 0" class="flex justify-between"><span class="text-muted">{{ $t('pos.discount') }}</span><span class="font-mono">-{{ formatUSD(cart.discountCentsCapped.value) }}</span></div>
            <div class="flex justify-between text-lg font-medium border-t border-line pt-2"><span>{{ $t('pos.total') }}</span><span class="font-mono">{{ formatUSD(cart.totalCents.value) }}</span></div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn-secondary" :disabled="cart.lines.length === 0" @click="holdCurrentSale">{{ $t('pos.hold') }}</button>
            <button type="button" class="btn-secondary flex items-center justify-center gap-1.5" :disabled="cart.lines.length === 0" @click="voidCurrentSale">
              <Trash2 :stroke-width="1.8" class="w-4 h-4" /> {{ $t('pos.clear') }}
            </button>
          </div>
          <button type="button" class="btn-primary w-full text-lg py-3" :disabled="cart.lines.length === 0" @click="openPayment">
            {{ $t('pos.payAmount', { amount: formatUSD(cart.totalCents.value) }) }}
          </button>
        </div>
      </div>
      <!-- Product browsing -->
      <div class="flex-1 flex flex-col min-w-0 p-4 gap-3">
        <div class="relative">
          <Search :stroke-width="1.8" class="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="search"
            type="search"
            :placeholder="$t('pos.searchPlaceholder')"
            class="input pl-9"
            @keydown.enter="onSearchEnter"
          />
        </div>

        <div class="flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="c in categoryOptions"
            :key="c.id"
            type="button"
            class="px-3 py-1.5 rounded-control text-sm whitespace-nowrap shrink-0"
            :class="categoryFilter === c.id ? 'bg-primary text-primary-ink' : 'bg-surface border border-line text-muted hover:text-ink'"
            @click="categoryFilter = c.id as number | 'all'"
          >
            {{ localName(c.nameEn, c.nameKm) }}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
          <div
            v-for="p in filteredProducts"
            :key="p.id"
            class="card p-3 flex flex-col gap-2"
            :class="(p.variantCount > 0 ? familyOutOfStock(variantsByParent.get(p.id) ?? []) : isOutOfStock(p)) ? 'opacity-50' : ''"
          >
            <button type="button" class="w-full flex flex-col gap-2 text-left hover:opacity-75 transition" @click="openCard(p)">
              <span class="w-full aspect-square rounded-control bg-primary-tint flex items-center justify-center overflow-hidden">
                <img v-if="p.imageUrl" :src="p.imageUrl" :alt="localName(p.nameEn, p.nameKm)" class="w-full h-full object-cover" />
                <span v-else class="text-primary-tint-text font-heading text-2xl">{{ initialsOf(p.nameEn) }}</span>
              </span>
              <span class="flex flex-col gap-0.5">
                <span class="text-sm font-medium leading-tight">{{ localName(p.nameEn, p.nameKm) }}</span>
                <span class="text-xs text-muted font-mono">{{ p.sku }}</span>
                <span class="font-mono font-medium">
                  {{ p.variantCount > 0 ? priceRangeLabel(variantsByParent.get(p.id) ?? []) : formatUSD(p.priceCents) }}
                </span>
                <span v-if="p.variantCount > 0" class="text-xs text-muted">{{ $t('pos.variantsAvailable', { n: p.variantCount }, p.variantCount) }}</span>
              </span>
            </button>
          </div>
          <p v-if="filteredProducts.length === 0" class="col-span-full text-center text-muted py-8">{{ $t('pos.noProducts') }}</p>
        </div>
      </div>
    </div>

    <VariantPickerModal
      v-if="pickerFor"
      :product="pickerFor"
      :variants="variantsByParent.get(pickerFor.id) ?? []"
      @close="pickerFor = null"
      @add="pickVariant"
    />
    <LineEditModal
      v-if="editingLine"
      :title="localName(editingLine.nameEn, editingLine.nameKm)"
      :discount-type="editingLine.discountType"
      :discount-value="editingLine.discountValue"
      :note="editingLine.note"
      :can-discount="canDiscount"
      @close="editingLineFor = null"
      @save="saveLineEdit"
    />
    <PaymentModal v-if="showPayment" :total-cents="cart.totalCents.value" :submitting="submitting" @close="showPayment = false" @paid="onPaid" />
    <ReceiptModal v-if="completedSale" :sale="completedSale" @close="closeReceipt" />
    <CashMovementModal v-if="showCashMovement" @close="showCashMovement = false" />
    <RecentSalesModal v-if="showRecentSales" @close="showRecentSales = false" @voided="loadProducts" />
    <HeldSalesModal v-if="showHeldSales" @close="showHeldSales = false" @resume="onResumeHeld" />
  </div>
</template>
