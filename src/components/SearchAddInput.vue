<script setup lang="ts">
// A select2-style "type to search, pick from the dropdown" input: ONE text
// input (not a button that opens a search box), a floating result list under
// it, and picking a result emits `select` and clears the input so it's ready
// for the next one. Unlike SearchableSelect it holds no value of its own —
// it's for *adding* things to a list that lives next to it (PO line items).
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Search } from 'lucide-vue-next'

interface Option {
  value: string | number
  label: string
  sub?: string
}

const props = withDefaults(defineProps<{ options: Option[]; label?: string; placeholder?: string }>(), {
  label: '',
  placeholder: undefined,
})
const emit = defineEmits<{ select: [string | number] }>()

const query = ref('')
const open = ref(false)
const active = ref(0)
const wrapper = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const dropStyle = ref<Record<string, string>>({})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter((o) => o.label.toLowerCase().includes(q) || String(o.sub ?? '').toLowerCase().includes(q))
})

function calcDropStyle() {
  if (!wrapper.value) return
  const r = wrapper.value.getBoundingClientRect()
  // Same rule as SearchableSelect: inside a modal, the modal's own bottom
  // edge is the boundary, not the browser viewport.
  const boundary = wrapper.value.closest('[role="dialog"]')
  const boundaryBottom = boundary ? boundary.getBoundingClientRect().bottom : window.innerHeight
  const above = boundaryBottom - r.bottom < 280
  dropStyle.value = {
    width: Math.max(r.width, 220) + 'px',
    left: r.left + 'px',
    ...(above ? { bottom: window.innerHeight - r.top + 4 + 'px', top: 'auto' } : { top: r.bottom + 4 + 'px', bottom: 'auto' }),
  }
}

function openList() {
  calcDropStyle()
  open.value = true
}
function onInput() {
  active.value = 0
  openList()
}

function pick(opt: Option) {
  emit('select', opt.value)
  query.value = ''
  active.value = 0
  open.value = false
}

async function move(delta: number) {
  if (!open.value) {
    openList()
    return
  }
  if (filtered.value.length === 0) return
  active.value = (active.value + delta + filtered.value.length) % filtered.value.length
  await nextTick()
  listRef.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
}
function onEnter() {
  const opt = filtered.value[active.value]
  if (open.value && opt) pick(opt)
}
function onEscape(e: KeyboardEvent) {
  // Only swallow Escape when it's closing this list — otherwise let it reach
  // the surrounding Modal so it can still be dismissed from the keyboard.
  if (open.value) {
    e.stopPropagation()
    open.value = false
  }
}

function onReposition() {
  if (open.value) calcDropStyle()
}
onMounted(() => {
  window.addEventListener('resize', onReposition)
  window.addEventListener('scroll', onReposition, true)
})
onUnmounted(() => {
  window.removeEventListener('resize', onReposition)
  window.removeEventListener('scroll', onReposition, true)
})
</script>

<template>
  <div ref="wrapper" class="relative">
    <span v-if="label" class="mb-1 block text-sm text-muted">{{ label }}</span>
    <Search :stroke-width="1.8" class="pointer-events-none absolute left-3 h-4 w-4 text-muted" :class="label ? 'top-[2.35rem]' : 'top-1/2 -translate-y-1/2'" />
    <input
      v-model="query"
      type="text"
      class="input pl-9"
      :placeholder="placeholder ?? $t('common.search')"
      autocomplete="off"
      role="combobox"
      :aria-expanded="open"
      @focus="openList"
      @click="openList"
      @input="onInput"
      @blur="open = false"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="onEnter"
      @keydown.esc="onEscape"
    />

    <Teleport to="body">
      <div
        v-if="open"
        :style="dropStyle"
        data-combobox-drop
        class="fixed z-[9000] overflow-hidden rounded-card border border-line bg-surface shadow-lg"
      >
        <div ref="listRef" class="overflow-y-auto" style="max-height: 240px">
          <div v-if="!filtered.length" class="px-3 py-4 text-center text-sm text-muted">{{ $t('common.noResults') }}</div>
          <button
            v-for="(item, i) in filtered"
            :key="item.value"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
            :class="i === active ? 'bg-primary-tint text-primary-text' : 'text-ink hover:bg-surface-subtle'"
            :data-active="i === active"
            @mousedown.prevent="pick(item)"
            @mousemove="active = i"
          >
            <span class="truncate">{{ item.label }}</span>
            <span v-if="item.sub" class="ml-auto truncate text-xs text-muted">{{ item.sub }}</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
