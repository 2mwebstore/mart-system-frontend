<script setup lang="ts">
// A searchable, teleported-dropdown select. Ported from a reference
// component the user supplied (same structure/behavior: Teleport to
// <body> with a viewport-aware position calc so the dropdown is never
// clipped by an ancestor's overflow, search-to-filter, clearable, keyboard-
// safe option clicks via @mousedown.prevent) — recolored onto this app's
// design tokens (primary/surface-subtle/line/ink/muted instead of
// rust/cream-dark) and used throughout the CRUD forms in place of a plain
// <select>, which is the only way to search a longer list (products,
// suppliers, branches) instead of scrolling a native dropdown.
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { X, ChevronDown, Search, Check } from 'lucide-vue-next'
import { t } from '@/i18n'

export interface SearchableSelectOption {
  value: string | number
  label: string
  sub?: string
  [key: string]: unknown
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null
    options: SearchableSelectOption[]
    label?: string
    required?: boolean
    placeholder?: string
    allLabel?: string
    showAll?: boolean
    clearable?: boolean
    searchable?: boolean
    disabled?: boolean
  }>(),
  {
    label: '',
    required: false,
    placeholder: undefined,
    allLabel: '— All —',
    showAll: false,
    clearable: true,
    searchable: true,
    disabled: false,
  },
)
const emit = defineEmits<{ 'update:modelValue': [string | number | null] }>()

const open = ref(false)
const query = ref('')
const wrapper = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const dropStyle = ref<Record<string, string>>({})

const hasValue = computed(() => props.modelValue !== null && props.modelValue !== undefined && props.modelValue !== '')

// Default follows the language; a caller-supplied placeholder wins.
const shownPlaceholder = computed(() => props.placeholder ?? t('common.select'))

function isSelected(val: string | number) {
  return String(props.modelValue) === String(val)
}

function labelOf(val: string | number | null) {
  if (val === null || val === undefined || val === '') return shownPlaceholder.value
  // Compared as strings deliberately — a caller may pass '5' where options
  // use the number 5 (or vice versa); without this a type mismatch here
  // silently fails to find the option and falls back to the raw value.
  const item = props.options.find((o) => String(o.value) === String(val))
  return item ? item.label : String(val)
}

const filtered = computed(() => {
  if (!query.value) return props.options
  const q = query.value.toLowerCase()
  return props.options.filter(
    (o) => o.label.toLowerCase().includes(q) || String(o.sub ?? '').toLowerCase().includes(q),
  )
})

function calcDropStyle() {
  if (!wrapper.value) return
  const r = wrapper.value.getBoundingClientRect()
  // When this select lives inside a modal (e.g. a row in "Add item"), the
  // relevant "bottom of the screen" for deciding open-up-vs-down is the
  // modal's own bottom edge, not the full browser viewport below it —
  // otherwise a select near the bottom of a short modal opens downward
  // (there's technically room in the viewport) and spills over the rest of
  // the modal's own fields instead of opening upward into the modal's own
  // free space above it.
  const boundary = wrapper.value.closest('[role="dialog"]')
  const boundaryBottom = boundary ? boundary.getBoundingClientRect().bottom : window.innerHeight
  const spaceBelow = boundaryBottom - r.bottom
  const above = spaceBelow < 280

  dropStyle.value = {
    width: Math.max(r.width, 220) + 'px',
    left: r.left + 'px',
    ...(above
      ? { bottom: window.innerHeight - r.top + 4 + 'px', top: 'auto' }
      : { top: r.bottom + 4 + 'px', bottom: 'auto' }),
  }
}

async function toggle() {
  if (props.disabled) return
  if (open.value) {
    open.value = false
    return
  }
  calcDropStyle()
  open.value = true
  query.value = ''
  await nextTick()
  searchRef.value?.focus()
}

function pick(val: string | number | null) {
  emit('update:modelValue', val)
  open.value = false
  query.value = ''
}

function clear() {
  emit('update:modelValue', null)
}

function onOutside(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (wrapper.value?.contains(target)) return
  const drop = document.querySelector('[data-searchable-drop]')
  if (drop?.contains(target)) return
  open.value = false
}

function onResize() {
  if (open.value) calcDropStyle()
}

onMounted(() => {
  document.addEventListener('mousedown', onOutside)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onResize, true)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onOutside)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onResize, true)
})
</script>

<template>
  <div ref="wrapper" class="relative">
    <span v-if="label" class="mb-1 block text-sm text-muted">
      {{ label }} <span v-if="required" class="text-danger-strong">*</span>
    </span>

    <button
      type="button"
      class="input flex w-full items-center justify-between gap-2 text-left"
      :class="open ? 'border-primary ring-2 ring-primary/20' : ''"
      :disabled="disabled"
      @click="toggle"
    >
      <span :class="hasValue ? 'text-ink' : 'text-muted'" class="flex items-center gap-2 min-w-0">
        <span class="truncate">{{ hasValue ? labelOf(modelValue) : shownPlaceholder }}</span>
      </span>
      <span class="flex shrink-0 items-center gap-1">
        <button v-if="hasValue && clearable" type="button" class="p-0.5 text-muted hover:text-ink" :aria-label="$t('common.clearSelection')" @click.stop="clear">
          <X class="h-3.5 w-3.5" />
        </button>
        <ChevronDown class="h-4 w-4 text-muted transition-transform" :class="open ? 'rotate-180' : ''" />
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        :style="dropStyle"
        data-searchable-drop
        class="fixed z-[9000] overflow-hidden rounded-card border border-line bg-surface shadow-lg"
      >
        <div v-if="searchable" class="border-b border-line px-2.5 pb-1.5 pt-2.5">
          <div class="flex items-center gap-2 rounded-control border border-input-border bg-surface-subtle px-2.5 py-1.5">
            <Search class="h-3.5 w-3.5 flex-shrink-0 text-muted" />
            <input ref="searchRef" v-model="query" class="flex-1 bg-transparent text-sm text-ink outline-none" :placeholder="$t('common.search')" />
            <button v-if="query" type="button" class="text-muted hover:text-ink" :aria-label="$t('common.clearSearch')" @click="query = ''">
              <X class="h-3 w-3" />
            </button>
          </div>
        </div>

        <div class="overflow-y-auto" style="max-height: 220px">
          <div v-if="!filtered.length" class="px-3 py-4 text-center text-sm text-muted">{{ $t('common.noResults') }}</div>

          <button
            v-if="showAll"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-subtle"
            :class="!hasValue ? 'bg-primary-tint font-medium text-primary-text' : 'text-ink/70'"
            @mousedown.prevent="pick(null)"
          >
            <Check class="h-3 w-3 flex-shrink-0" :class="!hasValue ? 'opacity-100' : 'opacity-0'" />
            {{ allLabel }}
          </button>

          <button
            v-for="item in filtered"
            :key="item.value"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-subtle"
            :class="isSelected(item.value) ? 'bg-primary-tint font-medium text-primary-text' : 'text-ink'"
            @mousedown.prevent="pick(item.value)"
          >
            <Check class="h-3 w-3 flex-shrink-0" :class="isSelected(item.value) ? 'opacity-100' : 'opacity-0'" />
            <span class="truncate">{{ item.label }}</span>
            <span v-if="item.sub" class="ml-auto truncate text-xs text-muted">{{ item.sub }}</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
