<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Minus, Monitor, MoreVertical, Pencil, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-vue-next'
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
import { i18n, localName, t } from '@/i18n'
import { usdCentsToRiel } from '@/utils/money'
import { openCustomerDisplay, useCustomerDisplaySender, type CartMessage, type PaidMessage, type PaymentDraft } from '@/composables/useCustomerDisplay'

const auth = useAuthStore()
const shift = useShiftStore()
const router = useRouter()
const toast = useToast()
const cart = useCart()
const settings = useSettingsStore()

const canDiscount = auth.hasPermission('pos.discount')

// Phones: the cart is a full-screen sheet (closed by default) and the header
// actions live in a menu. See the template.
const cartOpen = ref(false)
const showMenu = ref(false)
const menuRef = ref<HTMLElement | null>(null)
function menu(action: () => void) {
  showMenu.value = false
  action()
}
function onDocMouseDown(e: MouseEvent) {
  if (showMenu.value && menuRef.value && !menuRef.value.contains(e.target as Node)) showMenu.value = false
}
// Paid, held or cleared: back to the products.
watch(
  () => cart.lines.length,
  (n) => {
    if (n === 0) cartOpen.value = false
  },
)
onMounted(() => document.addEventListener('mousedown', onDocMouseDown))
onUnmounted(() => document.removeEventListener('mousedown', onDocMouseDown))

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
// Live tender/change from the open payment window (customer display only).
const paymentDraft = ref<PaymentDraft | null>(null)
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

// --- Customer display (second window facing the customer) -------------------
// The order as it's built, then the payment result while the receipt is up.
// See composables/useCustomerDisplay.ts.
function displayState(): CartMessage | PaidMessage {
  const common = { storeName: settings.app.receiptHeader || t('app.brand'), tillName: auth.tillName, locale: String(i18n.global.locale.value) }
  const sale = completedSale.value
  if (cart.lines.length === 0 && sale) {
    return {
      type: 'paid',
      ...common,
      receiptNo: sale.receiptNo,
      method: sale.payment.method,
      totalCents: sale.totalCents,
      totalRiel: sale.totalRiel,
      receivedUsdCents: sale.payment.receivedUsdCents,
      receivedKhrRiel: sale.payment.receivedKhrRiel,
      changeUsdCents: sale.payment.changeUsdCents,
      changeKhrRiel: sale.payment.changeKhrRiel,
      pointsEarned: sale.pointsEarned,
      customerName: sale.customerName,
    }
  }
  return {
    type: 'cart',
    ...common,
    lines: cart.lines.map((l) => ({
      productId: l.productId,
      nameEn: l.nameEn,
      nameKm: l.nameKm ?? '',
      imageUrl: l.imageUrl,
      qty: l.qty,
      unitPriceCents: l.unitPriceCents,
      discountCents: cart.lineDiscountCents(l),
      discountPercent: l.discountType === 'percent' && cart.lineDiscountCents(l) > 0 ? l.discountValue : null,
      note: l.note,
      lineTotalCents: cart.lineNetCents(l),
    })),
    itemCount: cart.itemCount.value,
    subtotalCents: cart.subtotalCents.value,
    lineDiscountsCents: cart.discountCentsCapped.value - cart.cartDiscountCents.value,
    cartDiscountCents: cart.cartDiscountCents.value,
    cartDiscountPercent: cart.cartDiscountType.value === 'percent' && cart.cartDiscountCents.value > 0 ? cart.cartDiscountValue.value : null,
    totalCents: cart.totalCents.value,
    totalRiel: usdCentsToRiel(cart.totalCents.value, settings.rate),
    customerName: customers.value.find((c) => c.id === cart.customerId.value)?.name ?? '',
    payment: showPayment.value ? paymentDraft.value : null,
  }
}
const customerDisplay = useCustomerDisplaySender(displayState)
watchEffect(() => customerDisplay.send(displayState()))
onUnmounted(() => {
  // Leaving the sale screen (close shift, back office): show the welcome screen.
  customerDisplay.send({ ...(displayState() as CartMessage), type: 'cart', lines: [], itemCount: 0, subtotalCents: 0, lineDiscountsCents: 0, cartDiscountCents: 0, cartDiscountPercent: null, totalCents: 0, totalRiel: 0, customerName: '', payment: null })
  customerDisplay.close()
})

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
  <div class="h-screen h-dvh flex flex-col">
    <header class="h-14 shrink-0 flex items-center justify-between gap-3 border-b border-line bg-surface px-3 sm:px-4">
      <div class="flex items-center gap-3 min-w-0">
        <p class="font-heading text-lg truncate">{{ settings.app.receiptHeader || $t('app.brand') }}</p>
        <span class="hidden sm:inline text-muted text-sm truncate">{{ auth.tillName }} · {{ auth.user?.full_name }}</span>
      </div>
      <!-- Wide screens: every action inline -->
      <div class="hidden xl:flex items-center gap-2 shrink-0">
        <LanguageSwitch class="mr-2" />
        <button type="button" class="btn-secondary text-sm px-3 py-1.5 relative" @click="showHeldSales = true">
          {{ $t('pos.heldSales') }}<span v-if="shift.heldSales.length" class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-ink text-[10px]">
            {{ shift.heldSales.length }}
          </span>
        </button>
        <button type="button" class="btn-secondary text-sm px-3 py-1.5" @click="showRecentSales = true">{{ $t('pos.sales') }}</button>
        <button type="button" class="btn-secondary text-sm px-3 py-1.5" @click="showCashMovement = true">{{ $t('shifts.cashMovement') }}</button>
        <button type="button" class="btn-secondary text-sm px-3 py-1.5" @click="goToCloseShift">{{ $t('shifts.closeShift') }}</button>
        <button type="button" class="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5" :title="$t('pos.customerDisplayHint')" @click="openCustomerDisplay">
          <Monitor :stroke-width="1.8" class="w-4 h-4" /> {{ $t('pos.customerDisplay') }}
        </button>
        <RouterLink :to="{ name: 'dashboard' }" class="btn-secondary text-sm px-3 py-1.5">{{ $t('pos.backOffice') }}</RouterLink>
      </div>
      <!-- Narrower screens: held sales stays one tap away, the rest go in a menu -->
      <div class="flex xl:hidden items-center gap-2 shrink-0">
        <button type="button" class="btn-secondary text-sm px-3 py-1.5 relative" @click="showHeldSales = true">
          {{ $t('pos.heldSales') }}<span v-if="shift.heldSales.length" class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-ink text-[10px]">
            {{ shift.heldSales.length }}
          </span>
        </button>
        <div ref="menuRef" class="relative">
          <button
            type="button"
            class="btn-secondary p-2"
            :aria-label="$t('pos.moreActions')"
            :aria-expanded="showMenu"
            @click="showMenu = !showMenu"
          >
            <MoreVertical :stroke-width="1.8" class="w-5 h-5" />
          </button>
          <div v-if="showMenu" class="absolute right-0 top-full mt-2 z-40 w-60 rounded-card border border-line bg-surface shadow-lg py-1" role="menu">
            <p class="sm:hidden px-4 py-2 text-xs text-muted border-b border-line">{{ auth.tillName }} · {{ auth.user?.full_name }}</p>
            <button type="button" role="menuitem" class="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-subtle" @click="menu(() => (showRecentSales = true))">{{ $t('pos.sales') }}</button>
            <button type="button" role="menuitem" class="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-subtle" @click="menu(() => (showCashMovement = true))">{{ $t('shifts.cashMovement') }}</button>
            <button type="button" role="menuitem" class="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-subtle" @click="menu(goToCloseShift)">{{ $t('shifts.closeShift') }}</button>
            <button type="button" role="menuitem" class="hidden md:block w-full text-left px-4 py-2.5 text-sm hover:bg-surface-subtle" @click="menu(openCustomerDisplay)">{{ $t('pos.customerDisplay') }}</button>
            <RouterLink :to="{ name: 'dashboard' }" role="menuitem" class="block px-4 py-2.5 text-sm hover:bg-surface-subtle">{{ $t('pos.backOffice') }}</RouterLink>
            <div class="px-4 py-2 border-t border-line"><LanguageSwitch /></div>
          </div>
        </div>
      </div>
    </header>

    <div class="flex-1 flex min-h-0 relative">
      <!-- Cart: a side panel from md up; on phones a full-screen sheet opened from the bottom bar -->
      <div
        class="bg-surface flex-col min-h-0 md:static md:z-auto md:flex md:w-80 lg:w-96 md:shrink-0 md:border-r md:border-line"
        :class="cartOpen ? 'fixed inset-0 z-30 flex' : 'hidden'"
      >
        <div class="md:hidden flex items-center justify-between gap-3 h-14 shrink-0 px-4 border-b border-line">
          <p class="font-heading text-lg">{{ $t('pos.cartTitle', { n: cart.itemCount.value }) }}</p>
          <button type="button" class="p-2 -mr-2 text-muted hover:text-ink" :aria-label="$t('pos.backToProducts')" @click="cartOpen = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-4 border-b border-line">
          <SearchableSelect v-model="cart.customerId.value" :label="$t('pos.customer')" :options="customerOptions" :placeholder="$t('pos.walkIn')" />
        </div>

        <div ref="cartListRef" class="flex-1 overflow-y-auto divide-y divide-line">
          <div v-if="cart.lines.length === 0" class="text-center text-muted py-10 px-4 text-sm">{{ $t('pos.cartEmpty') }}</div>
          <div v-for="line in cart.lines" :key="line.productId" class="p-3 space-y-1.5">
            <!-- Name and line total on top, controls underneath, so the name
                 isn't cut to a few letters in a narrow cart (phones, tablets). -->
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium leading-snug line-clamp-2">{{ localName(line.nameEn, line.nameKm) }}</p>
                <p class="text-xs text-muted font-mono">{{ $t('pos.each', { price: formatUSD(line.unitPriceCents) }) }}</p>
              </div>
              <p class="text-right font-mono text-sm font-medium shrink-0">{{ formatUSD(cart.lineNetCents(line)) }}</p>
            </div>
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <button type="button" class="w-9 h-9 md:w-7 md:h-7 rounded-control border border-line flex items-center justify-center hover:bg-surface-subtle" :aria-label="$t('pos.decreaseQty')" @click="cart.decQty(line.productId)">
                  <Minus class="w-3.5 h-3.5" />
                </button>
                <span class="w-8 text-center font-mono text-sm">{{ line.qty }}</span>
                <button type="button" class="w-9 h-9 md:w-7 md:h-7 rounded-control border border-line flex items-center justify-center hover:bg-surface-subtle" :aria-label="$t('pos.increaseQty')" @click="cart.incQty(line.productId)">
                  <Plus class="w-3.5 h-3.5" />
                </button>
              </div>
              <div class="flex items-center gap-1">
                <button type="button" class="p-2 md:p-1 text-muted hover:text-ink" :aria-label="$t('pos.editLineAria')" @click="editingLineFor = line.productId">
                  <Pencil class="w-4 h-4" />
                </button>
                <button type="button" class="p-2 md:p-1 text-muted hover:text-danger-strong" :aria-label="$t('inventory.removeItem')" @click="cart.removeLine(line.productId)">
                  <X class="w-4 h-4" />
                </button>
              </div>
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
      <div class="flex-1 flex flex-col min-w-0 p-3 sm:p-4 gap-3">
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

        <div class="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-3 content-start pb-20 md:pb-0">
          <div
            v-for="p in filteredProducts"
            :key="p.id"
            class="card p-3 flex flex-col gap-2"
            :class="(p.variantCount > 0 ? familyOutOfStock(variantsByParent.get(p.id) ?? []) : isOutOfStock(p)) ? 'opacity-50' : ''"
          >
            <button type="button" class="w-full flex flex-col gap-2 text-left hover:opacity-75 transition" @click="openCard(p)">
              <span class="w-full aspect-square rounded-control bg-primary-tint flex items-center justify-center overflow-hidden">
                <img v-if="p.imageUrl" :src="p.imageUrl" :alt="localName(p.nameEn, p.nameKm)" class="w-auto h-full" />
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

      <!-- Phones: cart summary bar; tap to open the cart -->
      <div v-if="!cartOpen" class="md:hidden absolute inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3">
        <button
          type="button"
          class="btn-primary w-full flex items-center justify-between gap-3 py-3"
          :aria-label="$t('pos.viewCart')"
          @click="cartOpen = true"
        >
          <span class="flex items-center gap-2">
            <ShoppingCart :stroke-width="1.8" class="w-5 h-5" />
            {{ $t('pos.itemsCount', { n: cart.itemCount.value }) }}
          </span>
          <span class="font-mono text-lg">{{ formatUSD(cart.totalCents.value) }}</span>
        </button>
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
    <PaymentModal
      v-if="showPayment"
      :total-cents="cart.totalCents.value"
      :submitting="submitting"
      @close="showPayment = false"
      @paid="onPaid"
      @draft="paymentDraft = $event"
    />
    <ReceiptModal v-if="completedSale" :sale="completedSale" @close="closeReceipt" />
    <CashMovementModal v-if="showCashMovement" @close="showCashMovement = false" />
    <RecentSalesModal v-if="showRecentSales" @close="showRecentSales = false" @voided="loadProducts" />
    <HeldSalesModal v-if="showHeldSales" @close="showHeldSales = false" @resume="onResumeHeld" />
  </div>
</template>
