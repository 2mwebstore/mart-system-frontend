<script setup lang="ts">
// The POS's queue of open QR table orders (oldest first). Accept tells the
// customer it's being prepared; "Load & take payment" puts it in the cart so
// the normal Pay flow books the sale and marks the order paid; Reject closes
// it with an optional reason the customer sees.
import { computed, onUnmounted, ref, watch } from 'vue'
import { ArrowRightLeft, ChefHat, Clock, Receipt } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { localName, t } from '@/i18n'
import { formatUSD } from '@/utils/format'
import type { TableOrder } from '@/types/domain'

// title / emptyText let the Tables board reuse this for one table's orders;
// moveTargets (the free tables) turns on "Move to table" for all of them, and
// payAll the table's total with one "Load table & take payment".
const props = defineProps<{
  orders: TableOrder[]
  title?: string
  emptyText?: string
  moveTargets?: { value: number; label: string }[]
  payAll?: boolean
}>()
const emit = defineEmits<{
  close: []
  accept: [number]
  reject: [number, string]
  load: [TableOrder]
  move: [number]
  loadAll: []
}>()
const tableTotal = computed(() => props.orders.reduce((n, o) => n + o.totalCents, 0))

// Newest at the top, like the customer's "Your orders". An order that arrives
// while this is open slides in there and is highlighted for a few seconds.
const sorted = computed(() => [...props.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id))
const seen = new Set(props.orders.map((o) => o.id))
const fresh = ref(new Set<number>())
const timers: ReturnType<typeof setTimeout>[] = []
watch(
  () => props.orders.map((o) => o.id),
  (ids) => {
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      fresh.value = new Set(fresh.value).add(id)
      timers.push(
        setTimeout(() => {
          const next = new Set(fresh.value)
          next.delete(id)
          fresh.value = next
        }, 6000),
      )
    }
  },
)
onUnmounted(() => timers.forEach(clearTimeout))

const moveTo = ref<number | null>(null)
function setMoveTo(v: string | number | null) {
  moveTo.value = v === null ? null : Number(v)
}
const canMove = () => props.moveTargets !== undefined && props.orders.length > 0

const busyId = ref<number | null>(null)
async function run(id: number, fn: () => unknown) {
  busyId.value = id
  try {
    await fn()
  } finally {
    busyId.value = null
  }
}
function reject(o: TableOrder) {
  const reason = window.prompt(t('pos.rejectReasonPrompt', { table: o.tableName }), '')
  if (reason === null) return
  void run(o.id, () => emit('reject', o.id, reason.trim()))
}
function minutesAgo(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 1 ? t('pos.justNow') : t('pos.minutesAgo', { n: m })
}
</script>

<template>
  <Modal :title="title ?? $t('pos.tableOrders')" wide @close="emit('close')">
    <p v-if="orders.length === 0" class="py-8 text-center text-muted">{{ emptyText ?? $t('pos.tableOrdersEmpty') }}</p>
    <div v-else class="space-y-3">
      <!-- The whole table in one bill (2+ orders; with one, its own button does it) -->
      <div v-if="payAll && orders.length > 1" class="rounded-card bg-surface-subtle p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm text-muted">{{ $t('tableBoard.tableTotal', { n: orders.length }, orders.length) }}</p>
          <p class="font-mono text-2xl font-medium">{{ formatUSD(tableTotal) }}</p>
        </div>
        <button type="button" class="btn-primary flex items-center gap-2" @click="emit('loadAll')">
          <Receipt :stroke-width="1.8" class="w-4 h-4" /> {{ $t('tableBoard.payTable', { amount: formatUSD(tableTotal) }) }}
        </button>
      </div>
      <div v-if="canMove()" class="rounded-card border border-dashed border-line p-3 space-y-2">
        <p class="text-sm text-muted">{{ $t('tableBoard.moveHint') }}</p>
        <p v-if="!moveTargets?.length" class="text-sm">{{ $t('tableBoard.noFreeTables') }}</p>
        <div v-else class="flex flex-wrap items-end gap-2">
          <SearchableSelect
            :model-value="moveTo"
            class="flex-1 min-w-[12rem]"
            :label="$t('tableBoard.moveTo')"
            :options="moveTargets ?? []"
            :placeholder="$t('tableBoard.movePick')"
            :clearable="false"
            @update:model-value="setMoveTo"
          />
          <button type="button" class="btn-secondary flex items-center gap-2" :disabled="moveTo === null" @click="moveTo !== null && emit('move', moveTo)">
            <ArrowRightLeft :stroke-width="1.8" class="w-4 h-4" /> {{ $t('tableBoard.move') }}
          </button>
        </div>
      </div>
      <TransitionGroup name="order-list" tag="div" class="space-y-3">
      <div
        v-for="o in sorted"
        :key="o.id"
        class="rounded-card border p-4 space-y-3 transition-shadow duration-500"
        :class="[o.status === 'NEW' ? 'border-primary bg-primary-tint/40' : 'border-line', fresh.has(o.id) ? 'ring-2 ring-primary shadow-lg' : '']"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-heading text-lg leading-tight">{{ $t('pos.tableLabel', { table: o.tableName }) }}</p>
            <p class="text-xs text-muted flex items-center gap-1">
              <component :is="o.status === 'NEW' ? Clock : ChefHat" :stroke-width="1.8" class="w-3.5 h-3.5" />
              #{{ o.id }} · {{ minutesAgo(o.createdAt) }}<template v-if="o.handledBy"> · {{ o.handledBy }}</template>
            </p>
          </div>
          <StatusBadge :tone="o.status === 'NEW' ? 'warning' : 'success'" :label="$t(`tableOrderStatus.${o.status}`)" />
        </div>
        <ul class="text-sm space-y-1">
          <li v-for="(it, i) in o.items" :key="i" class="flex justify-between gap-3">
            <span class="min-w-0">
              <span class="font-mono">{{ it.qty }}×</span> {{ localName(it.nameEn, it.nameKm) }}
              <span v-if="it.note" class="block text-xs text-muted italic">↳ {{ it.note }}</span>
            </span>
            <span class="font-mono shrink-0">{{ formatUSD(it.qty * it.unitPriceCents) }}</span>
          </li>
        </ul>
        <p v-if="o.note" class="text-sm rounded-control bg-surface-subtle px-3 py-2">{{ $t('pos.customerNote', { note: o.note }) }}</p>
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span class="font-mono font-medium">{{ formatUSD(o.totalCents) }}</span>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary text-sm px-3 py-1.5" :disabled="busyId === o.id" @click="reject(o)">{{ $t('pos.reject') }}</button>
            <button v-if="o.status === 'NEW'" type="button" class="btn-secondary text-sm px-3 py-1.5" :disabled="busyId === o.id" @click="run(o.id, () => emit('accept', o.id))">
              {{ $t('pos.accept') }}
            </button>
            <button type="button" class="btn-primary text-sm px-3 py-1.5" :disabled="busyId === o.id" @click="emit('load', o)">{{ $t('pos.loadToCart') }}</button>
          </div>
        </div>
      </div>
      </TransitionGroup>
    </div>
  </Modal>
</template>

<style scoped>
/* A newly arrived order slides in at the top; the rest move down smoothly. */
.order-list-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.order-list-enter-active,
.order-list-move {
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}
.order-list-leave-active {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  .order-list-enter-active,
  .order-list-move {
    transition: none;
  }
}
</style>
