<script setup lang="ts">
// Whether a company works in shifts, as the super admin sets it when making or
// editing a company: shifts opened and closed with a cash count, or none at
// all (the till keeps one open by itself and nothing about shifts shows).
import type { ShiftMode } from '@/types/domain'

// name: the radio group's name, one per form.
defineProps<{ name: string }>()
const mode = defineModel<ShiftMode>({ required: true })
const MODES: ShiftMode[] = ['REQUIRED', 'SKIP']
</script>

<template>
  <fieldset class="space-y-2" data-shift-mode>
    <!-- Drawn like the form's other sections (Limits): a legend sits in the fieldset's top border. -->
    <legend class="sr-only">{{ $t('platform.shiftMode') }}</legend>
    <p class="text-sm font-medium" aria-hidden="true">{{ $t('platform.shiftMode') }}</p>
    <p class="text-xs text-muted">{{ $t('platform.shiftModeHint') }}</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label
        v-for="m in MODES"
        :key="m"
        class="flex gap-2.5 rounded-control border p-3 cursor-pointer transition-colors"
        :class="mode === m ? 'border-primary bg-primary-tint' : 'border-line hover:bg-surface-subtle'"
      >
        <input v-model="mode" type="radio" :name="name" :value="m" class="mt-0.5 shrink-0" :data-shift-mode-option="m" />
        <span>
          <span class="block text-sm font-medium">{{ $t(`platform.shiftMode${m}`) }}</span>
          <span class="block text-xs text-muted mt-0.5">{{ $t(`platform.shiftMode${m}Hint`) }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>
