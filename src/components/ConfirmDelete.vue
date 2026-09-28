<script setup lang="ts">
// A small trash-icon button that opens an anchored, teleported confirm
// popover before emitting `confirm` — so every delete action in the app
// (table rows, cards) gets the same "are you sure" guard without each
// page hand-rolling its own modal. Positioning follows the same
// Teleport-to-body + bounding-rect technique as SearchableSelect /
// DateRangePicker, so it's never clipped inside a scrolling table.
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Trash2 } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    itemLabel: string // e.g. "supplier", "purchase order"
    itemName?: string // e.g. "Golden Delta Distribution" — shown if given
    size?: 'sm' | 'md'
  }>(),
  { itemName: '', size: 'sm' },
)
const emit = defineEmits<{ confirm: [] }>()

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const popRef = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})

function calcPosition() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const width = 260
  const margin = 12
  let left = rect.right - width
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
  const spaceBelow = window.innerHeight - rect.bottom
  const openUpward = spaceBelow < 140

  popStyle.value = {
    left: `${left}px`,
    width: `${width}px`,
    ...(openUpward
      ? { bottom: `${window.innerHeight - rect.top + 6}px`, top: 'auto' }
      : { top: `${rect.bottom + 6}px`, bottom: 'auto' }),
  }
}

async function toggle() {
  if (open.value) {
    open.value = false
    return
  }
  open.value = true
  await nextTick()
  calcPosition()
}

function confirm() {
  open.value = false
  emit('confirm')
}

function onOutside(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (triggerRef.value?.contains(target)) return
  if (popRef.value?.contains(target)) return
  open.value = false
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
function onViewportChange() {
  if (open.value) calcPosition()
}

onMounted(() => {
  document.addEventListener('mousedown', onOutside)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onOutside)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <span ref="triggerRef" class="inline-block">
    <button
      type="button"
      class="inline-flex items-center justify-center rounded-control text-muted hover:text-danger-strong hover:bg-danger transition"
      :class="size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'"
      :aria-label="itemName ? $t('confirmDelete.ariaNamed', { label: itemLabel, name: itemName }) : $t('confirmDelete.aria', { label: itemLabel })"
      @click.stop="toggle"
    >
      <Trash2 :stroke-width="1.8" :class="size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="popRef"
        :style="popStyle"
        class="fixed z-[9100] rounded-card border border-line bg-surface p-3.5 shadow-lg"
      >
        <p class="text-sm text-ink">
          {{ itemName ? $t('confirmDelete.titleNamed', { label: itemLabel, name: itemName }) : $t('confirmDelete.title', { label: itemLabel }) }}
        </p>
        <p class="text-xs text-muted mt-1">{{ $t('confirmDelete.warning') }}</p>
        <div class="flex justify-end gap-2 mt-3">
          <button type="button" class="btn-secondary px-3 py-1.5 text-sm" @click="open = false">{{ $t('common.cancel') }}</button>
          <button
            type="button"
            class="rounded-control bg-danger-strong text-white px-3 py-1.5 text-sm font-medium hover:opacity-90 transition"
            @click="confirm"
          >
            {{ $t('common.delete') }}
          </button>
        </div>
      </div>
    </Teleport>
  </span>
</template>
