<script setup lang="ts">
// Multi-pick version of SearchableSelect: same trigger look, same teleported,
// viewport-aware dropdown with search, but the value is an array and the
// dropdown stays open while options are toggled. Picked options show as chips
// in the trigger, each removable on its own.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Check, ChevronDown, Search, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import type { SearchableSelectOption } from '@/components/SearchableSelect.vue'

type Value = string | number

const props = withDefaults(
  defineProps<{
    modelValue: Value[]
    options: SearchableSelectOption[]
    label?: string
    required?: boolean
    placeholder?: string
    // Shows a "select all / clear all" row at the top of the list.
    selectAll?: boolean
    disabled?: boolean
  }>(),
  { label: '', required: false, placeholder: undefined, selectAll: true, disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [Value[]] }>()

const open = ref(false)
const query = ref('')
const wrapper = ref<HTMLElement | null>(null)
const dropRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const dropStyle = ref<Record<string, string>>({})

const shownPlaceholder = computed(() => props.placeholder ?? t('common.select'))
// Compared as strings, same as SearchableSelect (5 vs '5').
const selectedKeys = computed(() => new Set(props.modelValue.map(String)))
const isSelected = (v: Value) => selectedKeys.value.has(String(v))
const selectedOptions = computed(() => props.options.filter((o) => isSelected(o.value)))
const allSelected = computed(() => props.options.length > 0 && props.options.every((o) => isSelected(o.value)))

const filtered = computed(() => {
  if (!query.value) return props.options
  const q = query.value.toLowerCase()
  return props.options.filter((o) => o.label.toLowerCase().includes(q) || String(o.sub ?? '').toLowerCase().includes(q))
})

function toggle(v: Value) {
  emit('update:modelValue', isSelected(v) ? props.modelValue.filter((x) => String(x) !== String(v)) : [...props.modelValue, v])
}
function remove(v: Value) {
  emit('update:modelValue', props.modelValue.filter((x) => String(x) !== String(v)))
}
function toggleAll() {
  emit('update:modelValue', allSelected.value ? [] : props.options.map((o) => o.value))
}

function calcDropStyle() {
  if (!wrapper.value) return
  const r = wrapper.value.getBoundingClientRect()
  // Same open-up-vs-down rule as SearchableSelect, including the modal edge.
  const boundary = wrapper.value.closest('[role="dialog"]')
  const boundaryBottom = boundary ? boundary.getBoundingClientRect().bottom : window.innerHeight
  const above = boundaryBottom - r.bottom < 300
  dropStyle.value = {
    width: Math.max(r.width, 220) + 'px',
    left: r.left + 'px',
    ...(above ? { bottom: window.innerHeight - r.top + 4 + 'px', top: 'auto' } : { top: r.bottom + 4 + 'px', bottom: 'auto' }),
  }
}

async function openDrop() {
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

function onOutside(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (wrapper.value?.contains(target) || dropRef.value?.contains(target)) return
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

    <div
      role="button"
      tabindex="0"
      class="input flex w-full min-h-[2.5rem] h-auto items-center justify-between gap-2 text-left cursor-pointer"
      :class="[open ? 'border-primary ring-2 ring-primary/20' : '', disabled ? 'opacity-60 cursor-not-allowed' : '']"
      :aria-expanded="open"
      :aria-disabled="disabled"
      @click="openDrop"
      @keydown.enter.prevent="openDrop"
      @keydown.space.prevent="openDrop"
    >
      <div class="flex flex-wrap items-center gap-1 min-w-0">
        <span v-if="selectedOptions.length === 0" class="text-muted">{{ shownPlaceholder }}</span>
        <span
          v-for="o in selectedOptions"
          :key="o.value"
          class="inline-flex items-center gap-1 rounded-control bg-primary-tint text-primary-text text-xs px-2 py-0.5 max-w-full"
        >
          <span class="truncate">{{ o.label }}</span>
          <button
            v-if="!disabled"
            type="button"
            class="hover:text-ink"
            :aria-label="$t('common.removeItem', { name: o.label })"
            @click.stop="remove(o.value)"
          >
            <X class="h-3 w-3" />
          </button>
        </span>
      </div>
      <ChevronDown class="h-4 w-4 shrink-0 text-muted transition-transform" :class="open ? 'rotate-180' : ''" />
    </div>

    <Teleport to="body">
      <div
        v-if="open"
        ref="dropRef"
        :style="dropStyle"
        data-multi-select-drop
        class="fixed z-[9000] overflow-hidden rounded-card border border-line bg-surface shadow-lg"
      >
        <div class="border-b border-line px-2.5 pb-1.5 pt-2.5">
          <div class="flex items-center gap-2 rounded-control border border-input-border bg-surface-subtle px-2.5 py-1.5">
            <Search class="h-3.5 w-3.5 flex-shrink-0 text-muted" />
            <input ref="searchRef" v-model="query" class="flex-1 bg-transparent text-sm text-ink outline-none" :placeholder="$t('common.search')" />
            <button v-if="query" type="button" class="text-muted hover:text-ink" :aria-label="$t('common.clearSearch')" @click="query = ''">
              <X class="h-3 w-3" />
            </button>
          </div>
        </div>

        <div class="overflow-y-auto" style="max-height: 240px">
          <button
            v-if="selectAll && !query && options.length > 1"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm border-b border-line hover:bg-surface-subtle"
            :class="allSelected ? 'font-medium text-primary-text' : 'text-ink/70'"
            @mousedown.prevent="toggleAll"
          >
            <span class="flex h-4 w-4 items-center justify-center rounded border" :class="allSelected ? 'bg-primary border-primary text-primary-ink' : 'border-line'">
              <Check v-if="allSelected" class="h-3 w-3" />
            </span>
            {{ allSelected ? $t('common.clearAll') : $t('common.selectAll') }}
          </button>

          <div v-if="!filtered.length" class="px-3 py-4 text-center text-sm text-muted">{{ $t('common.noResults') }}</div>

          <button
            v-for="item in filtered"
            :key="item.value"
            type="button"
            role="option"
            :aria-selected="isSelected(item.value)"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-subtle"
            :class="isSelected(item.value) ? 'bg-primary-tint font-medium text-primary-text' : 'text-ink'"
            @mousedown.prevent="toggle(item.value)"
          >
            <span
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
              :class="isSelected(item.value) ? 'bg-primary border-primary text-primary-ink' : 'border-line'"
            >
              <Check v-if="isSelected(item.value)" class="h-3 w-3" />
            </span>
            <span class="truncate">{{ item.label }}</span>
            <span v-if="item.sub && item.sub !== item.label" class="ml-auto truncate text-xs text-muted">{{ item.sub }}</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
