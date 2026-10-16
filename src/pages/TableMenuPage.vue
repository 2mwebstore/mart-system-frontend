<script setup lang="ts">
// What a table's QR code opens: the branch's menu, an order the customer
// builds and sends with no sign-in, and the status of what they've sent
// (polled). The table token in the URL is the only key; prices on the server
// are authoritative. See handlers/table_orders.go and docs/DECISIONS.md.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { CheckCircle2, ChefHat, Clock, Minus, Plus, Search, ShoppingBag, X, XCircle } from 'lucide-vue-next'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { useBrandingStore } from '@/stores/branding'
import { getPublicTableOrder, getTableMenu, placeTableOrder } from '@/api/tableOrders'
import { i18n, t } from '@/i18n'
import { apiErrorMessage } from '@/i18n/apiErrors'
import { formatKHR, formatUSD, initialsOf } from '@/utils/format'
import { usdCentsToRiel } from '@/utils/money'
import type { MenuItem, PublicTableOrder, TableMenu } from '@/types/domain'

const route = useRoute()
const token = String(route.params.token ?? '')

const menu = ref<TableMenu | null>(null)
const loadError = ref('')
const loading = ref(true)

function nameOf(x: { nameEn: string; nameKm: string }) {
  return i18n.global.locale.value === 'km' && x.nameKm ? x.nameKm : x.nameEn
}
function categoryOf(x: MenuItem) {
  return (i18n.global.locale.value === 'km' && x.categoryNameKm ? x.categoryNameKm : x.categoryName) ?? ''
}

// ---- Menu: families (a parent with variants) show as one card ---------------
const variantsByParent = computed(() => {
  const m = new Map<number, MenuItem[]>()
  for (const it of menu.value?.items ?? []) {
    if (it.parentProductId) m.set(it.parentProductId, [...(m.get(it.parentProductId) ?? []), it])
  }
  return m
})
// Top-level cards: standalone products and family parents.
const cards = computed(() => (menu.value?.items ?? []).filter((it) => !it.parentProductId))
const categories = computed(() => {
  const seen = new Map<number, string>()
  for (const c of cards.value) if (c.categoryId && !seen.has(c.categoryId)) seen.set(c.categoryId, categoryOf(c))
  return [...seen].map(([id, name]) => ({ id, name }))
})
const category = ref<number | 'all'>('all')
const search = ref('')
const shownCards = computed(() => {
  const q = search.value.trim().toLowerCase()
  return cards.value.filter((c) => {
    if (category.value !== 'all' && c.categoryId !== category.value) return false
    if (!q) return true
    const family = [c, ...(variantsByParent.value.get(c.id) ?? [])]
    return family.some((x) => x.nameEn.toLowerCase().includes(q) || x.nameKm.toLowerCase().includes(q))
  })
})
function familyOf(c: MenuItem) {
  return variantsByParent.value.get(c.id) ?? []
}
function isFamily(c: MenuItem) {
  return c.variantCount > 0 && familyOf(c).length > 0
}
function cardAvailable(c: MenuItem) {
  return isFamily(c) ? familyOf(c).some((v) => v.available) : c.available
}
function priceLabel(c: MenuItem) {
  if (!isFamily(c)) return formatUSD(c.priceCents)
  const prices = familyOf(c).map((v) => v.priceCents)
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  return lo === hi ? formatUSD(lo) : `${formatUSD(lo)}–${formatUSD(hi)}`
}
const brokenImages = ref(new Set<string>())
function showImage(url: string) {
  return !!url && !brokenImages.value.has(url)
}
function markBroken(url: string) {
  brokenImages.value = new Set(brokenImages.value).add(url)
}

// ---- The order being built (kept per table on this phone) --------------------
interface OrderLine {
  productId: number
  qty: number
  note: string
}
const cartKey = `com-mart-table-cart:${token}`
const lines = ref<OrderLine[]>(readJSON<OrderLine[]>(cartKey, []))
const orderNote = ref('')
watch(lines, (v) => writeJSON(cartKey, v), { deep: true })

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // private mode etc. — the order still works, it just isn't remembered
  }
}

const itemById = computed(() => new Map((menu.value?.items ?? []).map((it) => [it.id, it])))
// Drop lines for products no longer on the menu (or no longer available).
const validLines = computed(() => lines.value.filter((l) => itemById.value.get(l.productId)?.available))
function qtyOf(productId: number) {
  return lines.value.find((l) => l.productId === productId)?.qty ?? 0
}
function add(productId: number) {
  const l = lines.value.find((x) => x.productId === productId)
  if (l) l.qty = Math.min(99, l.qty + 1)
  else lines.value.push({ productId, qty: 1, note: '' })
}
function dec(productId: number) {
  const i = lines.value.findIndex((x) => x.productId === productId)
  if (i === -1) return
  if (lines.value[i].qty <= 1) lines.value.splice(i, 1)
  else lines.value[i].qty -= 1
}
const itemCount = computed(() => validLines.value.reduce((n, l) => n + l.qty, 0))
const totalCents = computed(() => validLines.value.reduce((n, l) => n + l.qty * (itemById.value.get(l.productId)?.priceCents ?? 0), 0))
const rate = computed(() => menu.value?.exchangeRate ?? 0)

// ---- Sheets ---------------------------------------------------------------------
const pickerFor = ref<MenuItem | null>(null)
const showOrder = ref(false)
function openCard(c: MenuItem) {
  if (!cardAvailable(c)) return
  if (isFamily(c)) pickerFor.value = c
  else add(c.id)
}

// ---- Sending + tracking ------------------------------------------------------------
const sending = ref(false)
const sendError = ref('')
const sentKey = `com-mart-table-sent:${token}`
const sentTokens = ref<string[]>(readJSON<string[]>(sentKey, []))
const sentOrders = ref<PublicTableOrder[]>([])

async function sendOrder() {
  if (validLines.value.length === 0 || sending.value) return
  sending.value = true
  sendError.value = ''
  try {
    const order = await placeTableOrder(token, {
      items: validLines.value.map((l) => ({ productId: l.productId, qty: l.qty, note: l.note.trim() })),
      note: orderNote.value.trim(),
    })
    sentTokens.value = [order.token, ...sentTokens.value].slice(0, 10)
    writeJSON(sentKey, sentTokens.value)
    lastStatus.set(order.token, order.status)
    sentOrders.value = [order, ...sentOrders.value]
    lines.value = []
    orderNote.value = ''
    showOrder.value = false
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (err) {
    sendError.value = apiErrorMessage(err, 'tableMenu.sendFailed')
  } finally {
    sending.value = false
  }
}

// Once an order is paid the table starts fresh: a just-paid order stays up
// as "Paid — thank you!" for a moment, then this phone forgets it. One that
// was already paid when the page opened isn't shown at all.
const PAID_LINGER_MS = 8000
const lastStatus = new Map<string, string>()
const lingerTimers = new Map<string, ReturnType<typeof setTimeout>>()

function forget(tokens: string[]) {
  if (tokens.length === 0) return
  const drop = new Set(tokens)
  sentTokens.value = sentTokens.value.filter((tk) => !drop.has(tk))
  writeJSON(sentKey, sentTokens.value)
  sentOrders.value = sentOrders.value.filter((o) => !drop.has(o.token))
  tokens.forEach((tk) => lastStatus.delete(tk))
}

// Orders from this phone that are still in progress get re-checked.
async function refreshSent() {
  if (sentTokens.value.length === 0) {
    sentOrders.value = []
    return
  }
  const results = await Promise.all(sentTokens.value.map(async (tk) => [tk, await getPublicTableOrder(tk).catch(() => null)] as const))
  const today = new Date().toDateString()
  const gone: string[] = []
  const kept: PublicTableOrder[] = []
  for (const [tk, o] of results) {
    if (!sentTokens.value.includes(tk)) continue // forgotten while this check was in flight
    // Not found any more, or from an earlier day: nothing to follow.
    if (!o || new Date(o.createdAt).toDateString() !== today) {
      gone.push(tk)
      continue
    }
    if (o.status === 'PAID') {
      const was = lastStatus.get(tk)
      if (was === undefined) {
        gone.push(tk)
        continue
      }
      if (was !== 'PAID') {
        lingerTimers.set(
          tk,
          setTimeout(() => {
            lingerTimers.delete(tk)
            forget([tk])
          }, PAID_LINGER_MS),
        )
      }
    }
    lastStatus.set(tk, o.status)
    kept.push(o)
  }
  sentOrders.value = kept
  forget(gone)
}
const anyOpen = computed(() => sentOrders.value.some((o) => o.status === 'NEW' || o.status === 'ACCEPTED'))
let poll: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  try {
    menu.value = await getTableMenu(token)
  } catch (err) {
    loadError.value = apiErrorMessage(err, 'tableMenu.notFound')
  } finally {
    loading.value = false
  }
  await refreshSent()
  poll = setInterval(() => {
    if (anyOpen.value) void refreshSent()
  }, 5000)
})
onUnmounted(() => {
  clearInterval(poll)
  lingerTimers.forEach((timer) => clearTimeout(timer))
})

const statusSteps = ['NEW', 'ACCEPTED', 'PAID'] as const
function statusIcon(s: string) {
  return s === 'PAID' ? CheckCircle2 : s === 'CANCELLED' ? XCircle : s === 'ACCEPTED' ? ChefHat : Clock
}
function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString(i18n.global.locale.value === 'km' ? 'km-KH' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
}
const branding = useBrandingStore()
const title = computed(() => menu.value?.storeName || branding.shortName)
watch(title, (v) => (document.title = v), { immediate: true })
</script>

<template>
  <div class="min-h-screen bg-page text-ink pb-28">
    <header class="sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-line">
      <div class="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <BrandLogo class="h-9 max-w-[4.5rem]" />
          <div class="min-w-0">
          <p class="font-heading text-lg truncate leading-tight">{{ title }}</p>
          <p v-if="menu" class="text-xs text-muted truncate">{{ $t('tableMenu.tableAt', { table: menu.table.name, branch: menu.branch.name }) }}</p>
          </div>
        </div>
        <LanguageSwitch />
      </div>
    </header>

    <div v-if="loading" class="py-24 text-center text-muted">{{ $t('tableMenu.loading') }}</div>

    <div v-else-if="loadError || !menu" class="max-w-md mx-auto px-6 py-24 text-center space-y-2">
      <XCircle :stroke-width="1.5" class="w-12 h-12 mx-auto text-muted" />
      <p class="font-heading text-xl">{{ $t('tableMenu.unavailableTitle') }}</p>
      <p class="text-muted">{{ loadError }}</p>
    </div>

    <main v-else class="max-w-5xl mx-auto px-4 pt-4 space-y-4">
      <!-- Orders sent from this phone -->
      <section v-if="sentOrders.length" class="space-y-2" :aria-label="$t('tableMenu.yourOrders')">
        <h2 class="font-heading text-base">{{ $t('tableMenu.yourOrders') }}</h2>
        <div v-for="o in sentOrders" :key="o.token" class="card p-4 space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <component
                :is="statusIcon(o.status)"
                :stroke-width="1.8"
                class="w-5 h-5"
                :class="o.status === 'PAID' ? 'text-success-text' : o.status === 'CANCELLED' ? 'text-danger-strong' : 'text-primary-text'"
              />
              <div>
                <p class="font-medium">{{ $t(`tableMenu.status.${o.status}`) }}</p>
                <p class="text-xs text-muted">{{ $t(`tableMenu.statusHint.${o.status}`) }}</p>
              </div>
            </div>
            <span class="flex items-center gap-1 shrink-0">
              <span class="text-xs text-muted font-mono">{{ timeOf(o.createdAt) }}</span>
              <button
                v-if="o.status === 'CANCELLED'"
                type="button"
                class="p-1 -mr-1 text-muted hover:text-ink"
                :aria-label="$t('tableMenu.dismiss')"
                :title="$t('tableMenu.dismiss')"
                @click="forget([o.token])"
              >
                <X class="w-4 h-4" />
              </button>
            </span>
          </div>
          <!-- progress: sent -> preparing -> paid -->
          <div v-if="o.status !== 'CANCELLED'" class="flex gap-1.5" aria-hidden="true">
            <span
              v-for="(s, i) in statusSteps"
              :key="s"
              class="h-1.5 flex-1 rounded-full"
              :class="statusSteps.indexOf(o.status as (typeof statusSteps)[number]) >= i ? 'bg-primary' : 'bg-line'"
            />
          </div>
          <p v-if="o.status === 'CANCELLED' && o.cancelReason" class="text-sm text-danger-strong">{{ o.cancelReason }}</p>
          <ul class="text-sm space-y-1">
            <li v-for="(it, i) in o.items" :key="i" class="flex justify-between gap-3">
              <span class="min-w-0">
                {{ it.qty }} × {{ nameOf(it) }}
                <span v-if="it.note" class="block text-xs text-muted italic">↳ {{ it.note }}</span>
              </span>
              <span class="font-mono shrink-0">{{ formatUSD(it.qty * it.unitPriceCents) }}</span>
            </li>
          </ul>
          <div class="flex justify-between border-t border-line pt-2 text-sm font-medium">
            <span>{{ $t('col.total') }}</span>
            <span class="font-mono">{{ formatUSD(o.totalCents) }}</span>
          </div>
        </div>
      </section>

      <!-- Search + categories -->
      <div class="sticky top-14 z-10 -mx-4 px-4 py-2 bg-page space-y-2">
        <div class="relative">
          <Search :stroke-width="1.8" class="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input v-model="search" type="search" class="input pl-9" :placeholder="$t('tableMenu.search')" />
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1" role="tablist">
          <button
            type="button"
            role="tab"
            class="px-3 py-1.5 rounded-control text-sm whitespace-nowrap shrink-0"
            :class="category === 'all' ? 'bg-primary text-primary-ink' : 'bg-surface border border-line text-muted'"
            :aria-selected="category === 'all'"
            @click="category = 'all'"
          >
            {{ $t('common.all') }}
          </button>
          <button
            v-for="c in categories"
            :key="c.id"
            type="button"
            role="tab"
            class="px-3 py-1.5 rounded-control text-sm whitespace-nowrap shrink-0"
            :class="category === c.id ? 'bg-primary text-primary-ink' : 'bg-surface border border-line text-muted'"
            :aria-selected="category === c.id"
            @click="category = c.id"
          >
            {{ c.name }}
          </button>
        </div>
      </div>

      <!-- Menu -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div v-for="c in shownCards" :key="c.id" class="card p-3 flex flex-col gap-2" :class="cardAvailable(c) ? '' : 'opacity-50'">
          <button type="button" class="flex flex-col gap-2 text-left" :disabled="!cardAvailable(c)" @click="openCard(c)">
            <span class="w-full aspect-square rounded-control bg-primary-tint flex items-center justify-center overflow-hidden">
              <img v-if="showImage(c.imageUrl)" :src="c.imageUrl" :alt="nameOf(c)" class="w-full h-full object-contain" loading="lazy" @error="markBroken(c.imageUrl)" />
              <span v-else class="text-primary-tint-text font-heading text-2xl">{{ initialsOf(c.nameEn) }}</span>
            </span>
            <span class="text-sm font-medium leading-tight line-clamp-2">{{ nameOf(c) }}</span>
          </button>
          <div class="mt-auto flex items-center justify-between gap-2">
            <span class="font-mono font-medium text-sm">{{ priceLabel(c) }}</span>
            <span v-if="!cardAvailable(c)" class="text-xs text-muted">{{ $t('tableMenu.soldOut') }}</span>
            <button v-else-if="isFamily(c)" type="button" class="btn-secondary text-xs px-2.5 py-1" @click="openCard(c)">{{ $t('tableMenu.choose') }}</button>
            <div v-else-if="qtyOf(c.id) > 0" class="flex items-center gap-1">
              <button type="button" class="w-8 h-8 rounded-control border border-line flex items-center justify-center" :aria-label="$t('pos.decreaseQty')" @click="dec(c.id)">
                <Minus class="w-3.5 h-3.5" />
              </button>
              <span class="w-6 text-center font-mono text-sm">{{ qtyOf(c.id) }}</span>
              <button type="button" class="w-8 h-8 rounded-control bg-primary text-primary-ink flex items-center justify-center" :aria-label="$t('pos.increaseQty')" @click="add(c.id)">
                <Plus class="w-3.5 h-3.5" />
              </button>
            </div>
            <button v-else type="button" class="w-8 h-8 rounded-control bg-primary text-primary-ink flex items-center justify-center" :aria-label="$t('tableMenu.addItem', { name: nameOf(c) })" @click="add(c.id)">
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>
        <p v-if="shownCards.length === 0" class="col-span-full py-10 text-center text-muted">{{ $t('tableMenu.noItems') }}</p>
      </div>
    </main>

    <!-- Bottom bar -->
    <div v-if="menu && itemCount > 0 && !showOrder" class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3">
      <button type="button" class="btn-primary w-full max-w-5xl mx-auto flex items-center justify-between gap-3 py-3" @click="showOrder = true">
        <span class="flex items-center gap-2"><ShoppingBag :stroke-width="1.8" class="w-5 h-5" /> {{ $t('tableMenu.viewOrder', { n: itemCount }, itemCount) }}</span>
        <span class="font-mono text-lg">{{ formatUSD(totalCents) }}</span>
      </button>
    </div>

    <!-- Variant picker -->
    <div v-if="pickerFor" class="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-ink/40" @mousedown.self="pickerFor = null">
      <div role="dialog" aria-modal="true" :aria-label="nameOf(pickerFor)" class="w-full sm:max-w-md bg-surface rounded-t-card sm:rounded-card p-4 space-y-3 max-h-[80vh] overflow-y-auto">
        <div class="flex items-center justify-between">
          <p class="font-heading text-lg">{{ nameOf(pickerFor) }}</p>
          <button type="button" class="p-2 -mr-2 text-muted" :aria-label="$t('common.closeDialog')" @click="pickerFor = null"><X class="w-5 h-5" /></button>
        </div>
        <div v-for="v in familyOf(pickerFor)" :key="v.id" class="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0" :class="v.available ? '' : 'opacity-50'">
          <div class="min-w-0">
            <p class="font-medium truncate">{{ v.variantName || nameOf(v) }}</p>
            <p class="text-sm font-mono text-muted">{{ formatUSD(v.priceCents) }}</p>
          </div>
          <span v-if="!v.available" class="text-xs text-muted">{{ $t('tableMenu.soldOut') }}</span>
          <div v-else-if="qtyOf(v.id) > 0" class="flex items-center gap-1">
            <button type="button" class="w-9 h-9 rounded-control border border-line flex items-center justify-center" :aria-label="$t('pos.decreaseQty')" @click="dec(v.id)"><Minus class="w-4 h-4" /></button>
            <span class="w-6 text-center font-mono">{{ qtyOf(v.id) }}</span>
            <button type="button" class="w-9 h-9 rounded-control bg-primary text-primary-ink flex items-center justify-center" :aria-label="$t('pos.increaseQty')" @click="add(v.id)"><Plus class="w-4 h-4" /></button>
          </div>
          <button v-else type="button" class="btn-primary text-sm px-3 py-1.5" @click="add(v.id)">{{ $t('tableMenu.add') }}</button>
        </div>
        <button type="button" class="btn-secondary w-full" @click="pickerFor = null">{{ $t('tableMenu.done') }}</button>
      </div>
    </div>

    <!-- Order sheet -->
    <div v-if="showOrder" class="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-ink/40" @mousedown.self="showOrder = false">
      <div role="dialog" aria-modal="true" :aria-label="$t('tableMenu.yourOrder')" class="w-full sm:max-w-lg bg-surface rounded-t-card sm:rounded-card flex flex-col max-h-[92vh]">
        <div class="flex items-center justify-between px-4 h-14 border-b border-line shrink-0">
          <p class="font-heading text-lg">{{ $t('tableMenu.yourOrder') }} · {{ menu?.table.name }}</p>
          <button type="button" class="p-2 -mr-2 text-muted" :aria-label="$t('common.closeDialog')" @click="showOrder = false"><X class="w-5 h-5" /></button>
        </div>
        <div class="flex-1 overflow-y-auto divide-y divide-line">
          <div v-for="l in validLines" :key="l.productId" class="p-4 space-y-2">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium leading-snug">{{ nameOf(itemById.get(l.productId)!) }}</p>
                <p class="text-xs text-muted font-mono">{{ $t('pos.each', { price: formatUSD(itemById.get(l.productId)!.priceCents) }) }}</p>
              </div>
              <p class="font-mono shrink-0">{{ formatUSD(l.qty * itemById.get(l.productId)!.priceCents) }}</p>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" class="w-9 h-9 rounded-control border border-line flex items-center justify-center" :aria-label="$t('pos.decreaseQty')" @click="dec(l.productId)"><Minus class="w-4 h-4" /></button>
              <span class="w-8 text-center font-mono">{{ l.qty }}</span>
              <button type="button" class="w-9 h-9 rounded-control border border-line flex items-center justify-center" :aria-label="$t('pos.increaseQty')" @click="add(l.productId)"><Plus class="w-4 h-4" /></button>
              <input v-model="l.note" type="text" maxlength="120" class="input flex-1 py-1.5 text-sm" :placeholder="$t('pos.notePlaceholder')" :aria-label="$t('common.note')" />
            </div>
          </div>
          <div class="p-4">
            <label class="block text-sm text-muted mb-1" for="order-note">{{ $t('tableMenu.orderNote') }}</label>
            <textarea id="order-note" v-model="orderNote" rows="2" maxlength="255" class="input" :placeholder="$t('tableMenu.orderNoteHint')" />
          </div>
        </div>
        <div class="border-t border-line p-4 space-y-3 shrink-0">
          <div class="flex justify-between items-baseline">
            <span class="text-muted">{{ $t('col.total') }}</span>
            <span class="text-right">
              <span class="font-mono text-2xl font-medium">{{ formatUSD(totalCents) }}</span>
              <span v-if="rate" class="block text-sm text-muted font-mono">{{ formatKHR(usdCentsToRiel(totalCents, rate)) }}</span>
            </span>
          </div>
          <p class="text-xs text-muted">{{ $t('tableMenu.payHint') }}</p>
          <p v-if="sendError" class="text-sm text-danger-strong" role="alert">{{ sendError }}</p>
          <button type="button" class="btn-primary w-full py-3 text-lg" :disabled="sending || validLines.length === 0" @click="sendOrder">
            {{ sending ? $t('tableMenu.sending') : $t('tableMenu.send') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
