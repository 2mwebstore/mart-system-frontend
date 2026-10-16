<script setup lang="ts">
// POS Tables board: every table in the till's branch as a tile, coloured by
// what it needs — a new order to accept, an open bill (accepted, not paid
// yet), or nothing (free). Built from the table list and the open orders the
// POS already polls (useTableOrders), so it updates on the same 8 s cycle.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ShoppingCart } from 'lucide-vue-next'
import { t } from '@/i18n'
import { formatUSD } from '@/utils/format'
import type { TableBoardEntry, TableOrder } from '@/types/domain'

const props = defineProps<{ tables: TableBoardEntry[]; orders: TableOrder[]; cartTableOrderIds: number[]; loading?: boolean }>()
const emit = defineEmits<{ open: [BoardTile] }>()

export interface BoardTile {
  key: string
  tableId: number | null
  name: string
  active: boolean
  orders: TableOrder[]
  state: 'new' | 'open' | 'free'
  totalCents: number
  oldestAt: string | null
  inCart: boolean
}

// Ticks so "12 min" keeps moving between polls.
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => (tick = setInterval(() => (now.value = Date.now()), 30000)))
onUnmounted(() => clearInterval(tick))

function tileFor(key: string, tableId: number | null, name: string, active: boolean, orders: TableOrder[]): BoardTile {
  const state = orders.some((o) => o.status === 'NEW') ? 'new' : orders.length ? 'open' : 'free'
  const oldestAt = orders.reduce<string | null>((min, o) => (!min || o.createdAt < min ? o.createdAt : min), null)
  return {
    key,
    tableId,
    name,
    active,
    orders,
    state,
    totalCents: orders.reduce((n, o) => n + o.totalCents, 0),
    oldestAt,
    inCart: orders.some((o) => props.cartTableOrderIds.includes(o.id)),
  }
}

const tiles = computed<BoardTile[]>(() => {
  const byTable = new Map<number, TableOrder[]>()
  const orphans = new Map<string, TableOrder[]>() // the table was deleted after ordering
  const known = new Set(props.tables.map((x) => x.id))
  for (const o of props.orders) {
    if (o.tableId !== null && known.has(o.tableId)) byTable.set(o.tableId, [...(byTable.get(o.tableId) ?? []), o])
    else orphans.set(o.tableName, [...(orphans.get(o.tableName) ?? []), o])
  }
  return [
    ...props.tables.map((x) => tileFor(`t${x.id}`, x.id, x.name, x.active, byTable.get(x.id) ?? [])),
    ...[...orphans].map(([name, list]) => tileFor(`n${name}`, null, name, false, list)),
  ]
})

type Filter = 'all' | 'new' | 'open' | 'free'
const filter = ref<Filter>('all')
const counts = computed(() => ({
  all: tiles.value.length,
  new: tiles.value.filter((x) => x.state === 'new').length,
  open: tiles.value.filter((x) => x.state === 'open').length,
  free: tiles.value.filter((x) => x.state === 'free').length,
}))
const shown = computed(() => (filter.value === 'all' ? tiles.value : tiles.value.filter((x) => x.state === filter.value)))
const filters = computed<{ key: Filter; label: string }[]>(() => [
  { key: 'all', label: t('tableBoard.all') },
  { key: 'new', label: t('tableBoard.new') },
  { key: 'open', label: t('tableBoard.open') },
  { key: 'free', label: t('tableBoard.free') },
])

function minutes(iso: string | null) {
  if (!iso) return ''
  const m = Math.max(0, Math.round((now.value - new Date(iso).getTime()) / 60000))
  return m < 1 ? t('pos.justNow') : t('tableBoard.minutes', { n: m })
}
function stateLabel(x: BoardTile) {
  if (x.state === 'free') return x.active ? t('tableBoard.free') : t('tables.paused')
  return x.state === 'new' ? t('tableBoard.new') : t('tableBoard.open')
}
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col gap-3">
    <div class="flex gap-2 overflow-x-auto pb-1" role="tablist" :aria-label="$t('tableBoard.filter')">
      <button
        v-for="f in filters"
        :key="f.key"
        type="button"
        role="tab"
        :aria-selected="filter === f.key"
        class="px-3 py-1.5 rounded-control text-sm whitespace-nowrap shrink-0 flex items-center gap-1.5"
        :class="filter === f.key ? 'bg-primary text-primary-ink' : 'bg-surface border border-line text-muted hover:text-ink'"
        @click="filter = f.key"
      >
        <span
          v-if="f.key !== 'all'"
          class="w-2 h-2 rounded-full"
          :class="f.key === 'new' ? 'bg-primary' : f.key === 'open' ? 'bg-success-text' : 'bg-line'"
          aria-hidden="true"
        />
        {{ f.label }} <span class="font-mono text-xs opacity-80">{{ counts[f.key] }}</span>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-3 content-start pb-20 md:pb-0">
      <button
        v-for="x in shown"
        :key="x.key"
        type="button"
        class="relative rounded-card border p-3 text-left flex flex-col gap-1 min-h-[7.5rem] transition hover:shadow-sm"
        :class="[
          x.state === 'new' ? 'border-primary bg-primary-tint' : x.state === 'open' ? 'border-success-text/40 bg-success' : 'border-line bg-surface',
          !x.active && x.state === 'free' ? 'opacity-60' : '',
          x.inCart ? 'ring-2 ring-primary ring-offset-1' : '',
        ]"
        :aria-label="$t('tableBoard.tileAria', { table: x.name, state: stateLabel(x) })"
        @click="emit('open', x)"
      >
        <span class="flex items-start justify-between gap-2">
          <span class="font-heading text-2xl leading-none truncate">{{ x.name }}</span>
          <span v-if="x.state === 'new'" class="relative flex h-3 w-3 mt-1" aria-hidden="true">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span class="relative inline-flex rounded-full h-3 w-3 bg-primary" />
          </span>
        </span>
        <span class="text-sm" :class="x.state === 'new' ? 'text-primary-text font-medium' : x.state === 'open' ? 'text-success-text font-medium' : 'text-muted'">
          {{ stateLabel(x) }}
        </span>
        <span v-if="x.orders.length" class="mt-auto flex items-end justify-between gap-2">
          <span class="text-xs text-muted">
            {{ $t('tableBoard.orders', { n: x.orders.length }, x.orders.length) }}<template v-if="x.oldestAt"> · {{ minutes(x.oldestAt) }}</template>
          </span>
          <span class="font-mono font-medium">{{ formatUSD(x.totalCents) }}</span>
        </span>
        <span v-if="x.inCart" class="absolute top-2 right-2 inline-flex items-center gap-1 rounded-control bg-primary text-primary-ink text-[10px] px-1.5 py-0.5">
          <ShoppingCart class="w-3 h-3" /> {{ $t('tableBoard.inCart') }}
        </span>
      </button>
      <p v-if="!loading && tiles.length === 0" class="col-span-full py-10 text-center text-muted">{{ $t('tableBoard.noTables') }}</p>
      <p v-else-if="shown.length === 0" class="col-span-full py-10 text-center text-muted">{{ $t('tableBoard.noneInFilter') }}</p>
    </div>
  </div>
</template>
