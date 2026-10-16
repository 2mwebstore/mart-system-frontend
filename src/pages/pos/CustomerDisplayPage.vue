<script setup lang="ts">
// Customer-facing screen: the order as the cashier builds it (image, name,
// note, discount, price per line, then the totals), and the payment result
// once it's paid. Everything comes from the POS tab in this same browser —
// see composables/useCustomerDisplay.ts. Opened from the POS header.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CheckCircle2, Maximize } from 'lucide-vue-next'
import { useCustomerDisplayReceiver, type CartMessage, type DisplayLine, type PaidMessage, type PaymentDraft } from '@/composables/useCustomerDisplay'
import { i18n, label, setLocale, type Locale } from '@/i18n'
import BrandLogo from '@/components/BrandLogo.vue'
import { useBrandingStore } from '@/stores/branding'
import { formatKHR, formatUSD, initialsOf } from '@/utils/format'

const state = ref<CartMessage | PaidMessage | null>(null)
// The line that just changed (added or qty up) is briefly highlighted.
const highlightId = ref<number | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | undefined
// Images that failed to load fall back to initials.
const brokenImages = ref(new Set<string>())

function onMessage(msg: CartMessage | PaidMessage) {
  if (msg.locale && msg.locale !== i18n.global.locale.value) setLocale(msg.locale as Locale)
  if (msg.type === 'cart' && state.value?.type === 'cart') {
    const before = new Map(state.value.lines.map((l) => [l.productId, l.qty]))
    const changed = msg.lines.find((l) => (before.get(l.productId) ?? 0) < l.qty)
    if (changed) {
      highlightId.value = changed.productId
      clearTimeout(highlightTimer)
      highlightTimer = setTimeout(() => (highlightId.value = null), 1500)
    }
  }
  state.value = msg
}

const receiver = useCustomerDisplayReceiver(onMessage)

const cart = computed(() => (state.value?.type === 'cart' ? state.value : null))
const paid = computed(() => (state.value?.type === 'paid' ? state.value : null))
const branding = useBrandingStore()
const storeName = computed(() => state.value?.storeName || branding.shortName)

// The customer reads in the till's language; the other one goes underneath
// when the product has both.
function primaryName(l: DisplayLine) {
  return i18n.global.locale.value === 'km' && l.nameKm ? l.nameKm : l.nameEn
}
function secondaryName(l: DisplayLine) {
  const other = i18n.global.locale.value === 'km' ? l.nameEn : l.nameKm
  return other && other !== primaryName(l) ? other : ''
}
function showImage(l: DisplayLine) {
  return !!l.imageUrl && !brokenImages.value.has(l.imageUrl)
}
function markBroken(url: string) {
  brokenImages.value = new Set(brokenImages.value).add(url)
}

function hasTender(p: PaymentDraft) {
  return p.receivedUsdCents > 0 || p.receivedKhrRiel > 0
}
// "$20.00", "៛50,000" or "$5.00 + ៛8,000"; a dash until something is entered.
function tenderedText(p: PaymentDraft) {
  const parts = [p.receivedUsdCents > 0 ? formatUSD(p.receivedUsdCents) : '', p.receivedKhrRiel > 0 ? formatKHR(p.receivedKhrRiel) : ''].filter(Boolean)
  return parts.length ? parts.join(' + ') : '—'
}

const isFullscreen = ref(false)
function syncFullscreen() {
  isFullscreen.value = !!document.fullscreenElement
}
function enterFullscreen() {
  void document.documentElement.requestFullscreen?.().catch(() => {})
}
onMounted(() => document.addEventListener('fullscreenchange', syncFullscreen))
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  clearTimeout(highlightTimer)
  receiver.close()
})
</script>

<template>
  <div class="h-screen flex flex-col bg-page text-ink select-none">
    <header class="h-16 shrink-0 flex items-center justify-between gap-4 border-b border-line bg-surface px-6">
      <div class="flex items-center gap-3 min-w-0">
        <BrandLogo class="h-11 max-w-[6rem]" />
        <p class="font-heading text-2xl truncate">{{ storeName }}</p>
      </div>
      <div class="flex items-center gap-4">
        <span v-if="state?.tillName" class="text-muted">{{ state.tillName }}</span>
        <button v-if="!isFullscreen" type="button" class="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5" @click="enterFullscreen">
          <Maximize :stroke-width="1.8" class="w-4 h-4" /> {{ $t('customerDisplay.fullScreen') }}
        </button>
      </div>
    </header>

    <!-- Not connected yet -->
    <div v-if="!receiver.supported || !state" class="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
      <p class="font-heading text-3xl">{{ $t('customerDisplay.waiting') }}</p>
      <p class="text-muted text-lg">{{ receiver.supported ? $t('customerDisplay.waitingHint') : $t('customerDisplay.unsupported') }}</p>
    </div>

    <!-- Paid: thank you + change -->
    <div v-else-if="paid" class="flex-1 flex items-center justify-center p-6">
      <div class="card w-full max-w-xl text-center space-y-5 py-10">
        <CheckCircle2 :stroke-width="1.5" class="w-16 h-16 mx-auto text-success-text" />
        <p class="font-heading text-4xl">{{ $t('customerDisplay.thankYou') }}</p>
        <p v-if="paid.customerName" class="text-muted text-lg">{{ paid.customerName }}</p>
        <div class="space-y-2 text-lg text-left max-w-sm mx-auto">
          <div class="flex justify-between">
            <span class="text-muted">{{ $t('col.total') }}</span>
            <span class="font-mono">{{ formatUSD(paid.totalCents) }} · {{ formatKHR(paid.totalRiel) }}</span>
          </div>
          <template v-if="paid.method === 'CASH'">
            <div class="flex justify-between">
              <span class="text-muted">{{ $t('pos.tendered') }}</span>
              <span class="font-mono">{{ formatUSD(paid.receivedUsdCents) }}{{ paid.receivedKhrRiel ? ` + ${formatKHR(paid.receivedKhrRiel)}` : '' }}</span>
            </div>
            <div class="flex justify-between items-baseline border-t border-line pt-3">
              <span class="font-medium">{{ $t('pos.change') }}</span>
              <span class="font-mono text-3xl font-medium">
                {{ formatUSD(paid.changeUsdCents) }}<span v-if="paid.changeKhrRiel" class="block text-xl text-right">+ {{ formatKHR(paid.changeKhrRiel) }}</span>
              </span>
            </div>
          </template>
          <div v-else class="flex justify-between">
            <span class="text-muted">{{ $t('pos.paidBy') }}</span>
            <span>{{ label('method', paid.method) }}</span>
          </div>
          <div v-if="paid.pointsEarned > 0" class="flex justify-between">
            <span class="text-muted">{{ $t('customerDisplay.pointsEarned') }}</span>
            <span class="font-mono">+{{ paid.pointsEarned }}</span>
          </div>
        </div>
        <p class="text-muted font-mono">{{ paid.receiptNo }}</p>
      </div>
    </div>

    <!-- Empty cart: welcome -->
    <div v-else-if="cart && cart.lines.length === 0" class="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <BrandLogo class="h-32 max-w-[20rem] mb-2" />
      <p class="font-heading text-5xl">{{ $t('customerDisplay.welcome') }}</p>
      <p class="text-muted text-xl">{{ storeName }}</p>
    </div>

    <!-- The order -->
    <div v-else-if="cart" class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3">
      <ul class="lg:col-span-2 min-h-0 overflow-y-auto p-4 lg:p-6 space-y-3" :aria-label="$t('customerDisplay.yourOrder')">
        <li
          v-for="line in cart.lines"
          :key="line.productId"
          class="flex items-center gap-4 rounded-card border border-line p-3 transition-colors duration-700"
          :class="highlightId === line.productId ? 'bg-primary-tint' : 'bg-surface'"
        >
          <div class="w-20 h-20 shrink-0 rounded-control bg-surface-subtle border border-line overflow-hidden flex items-center justify-center">
            <img
              v-if="showImage(line)"
              :src="line.imageUrl"
              :alt="primaryName(line)"
              class="w-full h-full object-contain"
              @error="markBroken(line.imageUrl)"
            />
            <span v-else class="font-heading text-xl text-muted">{{ initialsOf(line.nameEn) }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xl font-medium truncate">{{ primaryName(line) }}</p>
            <p v-if="secondaryName(line)" class="text-sm text-muted truncate">{{ secondaryName(line) }}</p>
            <p class="text-muted font-mono">{{ line.qty }} × {{ formatUSD(line.unitPriceCents) }}</p>
            <p v-if="line.note" class="text-muted italic truncate">{{ $t('pos.itemNoteLine', { note: line.note }) }}</p>
          </div>
          <div class="shrink-0 text-right">
            <p v-if="line.discountCents" class="text-sm text-muted font-mono line-through">{{ formatUSD(line.qty * line.unitPriceCents) }}</p>
            <p class="text-2xl font-mono font-medium">{{ formatUSD(line.lineTotalCents) }}</p>
            <p v-if="line.discountCents" class="inline-block mt-1 rounded-control bg-success px-2 py-0.5 text-sm text-success-text font-mono">
              −{{ formatUSD(line.discountCents) }}<template v-if="line.discountPercent !== null"> ({{ line.discountPercent }}%)</template>
            </p>
          </div>
        </li>
      </ul>

      <aside class="border-t lg:border-t-0 lg:border-l border-line bg-surface p-6 flex flex-col gap-4">
        <p v-if="cart.customerName" class="text-lg">{{ $t('customerDisplay.customer', { name: cart.customerName }) }}</p>
        <div class="space-y-2 text-lg">
          <div class="flex justify-between">
            <span class="text-muted">{{ $t('customerDisplay.items', { n: cart.itemCount }, cart.itemCount) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">{{ $t('pos.subtotal') }}</span>
            <span class="font-mono">{{ formatUSD(cart.subtotalCents) }}</span>
          </div>
          <div v-if="cart.lineDiscountsCents" class="flex justify-between">
            <span class="text-muted">{{ $t('inventory.itemDiscounts') }}</span>
            <span class="font-mono text-success-text">−{{ formatUSD(cart.lineDiscountsCents) }}</span>
          </div>
          <div v-if="cart.cartDiscountCents" class="flex justify-between">
            <span class="text-muted">
              {{ $t('inventory.invoiceDiscount') }}<template v-if="cart.cartDiscountPercent !== null"> ({{ cart.cartDiscountPercent }}%)</template>
            </span>
            <span class="font-mono text-success-text">−{{ formatUSD(cart.cartDiscountCents) }}</span>
          </div>
        </div>
        <div class="mt-auto border-t border-line pt-4">
          <p class="text-muted text-lg">{{ cart.payment ? $t('pos.amountDue') : $t('col.total') }}</p>
          <p class="font-mono text-5xl font-medium">{{ formatUSD(cart.totalCents) }}</p>
          <p class="font-mono text-2xl text-muted mt-1">{{ formatKHR(cart.totalRiel) }}</p>
        </div>

        <!-- Live while the cashier is taking payment -->
        <div v-if="cart.payment" class="rounded-card border border-line bg-surface-subtle p-4 space-y-2 text-lg" aria-live="polite">
          <div class="flex justify-between">
            <span class="text-muted">{{ $t('pos.paymentMethod') }}</span>
            <span>{{ label('method', cart.payment.method) }}</span>
          </div>
          <template v-if="cart.payment.method === 'CASH'">
            <div class="flex justify-between">
              <span class="text-muted">{{ $t('pos.tendered') }}</span>
              <span class="font-mono">{{ tenderedText(cart.payment) }}</span>
            </div>
            <div v-if="hasTender(cart.payment) && cart.payment.shortCents > 0" class="flex justify-between items-baseline border-t border-line pt-2">
              <span class="font-medium">{{ $t('pos.remaining') }}</span>
              <span class="font-mono text-2xl font-medium text-danger-strong text-right">
                {{ formatUSD(cart.payment.shortCents) }}<span class="block text-base">{{ formatKHR(cart.payment.shortRiel) }}</span>
              </span>
            </div>
            <div v-else-if="hasTender(cart.payment)" class="flex justify-between items-baseline border-t border-line pt-2">
              <span class="font-medium">{{ $t('pos.changeDue') }}</span>
              <span class="font-mono text-3xl font-medium text-success-text text-right">
                {{ formatUSD(cart.payment.changeUsdCents) }}<span v-if="cart.payment.changeKhrRiel" class="block text-xl">+ {{ formatKHR(cart.payment.changeKhrRiel) }}</span>
              </span>
            </div>
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>
