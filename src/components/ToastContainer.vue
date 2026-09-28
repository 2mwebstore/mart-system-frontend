<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()

const typeClasses: Record<string, string> = {
  success: 'bg-success text-success-text',
  error: 'bg-danger text-danger-text',
  info: 'bg-surface text-ink border border-line',
}
</script>

<template>
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :class="[typeClasses[toast.type], 'rounded-control px-4 py-3 shadow-sm flex items-start justify-between gap-3']"
      role="status"
    >
      <span class="text-sm">{{ toast.message }}</span>
      <button
        type="button"
        class="text-current opacity-60 hover:opacity-100"
        :aria-label="$t('common.dismiss')"
        @click="dismiss(toast.id)"
      >
        &times;
      </button>
    </div>
  </div>
</template>
