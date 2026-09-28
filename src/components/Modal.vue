<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const dialogRef = ref<HTMLElement | null>(null)

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'Tab' && dialogRef.value) {
    const focusables = dialogRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  dialogRef.value?.querySelector<HTMLElement>('button, input, select, textarea')?.focus()
})
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="fixed !mt-0 inset-0 z-40 flex items-center justify-center bg-ink/40 px-4" @mousedown.self="emit('close')">
    <div
      ref="dialogRef"
      role="dialog"
      aria-modal="true"
      :aria-label="props.title"
      class="bg-surface rounded-modal border border-line shadow-lg w-full max-h-[90vh] overflow-y-auto"
      :class="wide ? 'max-w-2xl' : 'max-w-md'"
    >
      <div class="flex items-center justify-between px-5 py-4 border-b border-line">
        <h2 class="font-heading text-lg">{{ title }}</h2>
        <button type="button" class="text-muted hover:text-ink" :aria-label="$t('common.closeDialog')" @click="emit('close')">
          &times;
        </button>
      </div>
      <div class="p-5">
        <slot />
      </div>
    </div>
  </div>
</template>
