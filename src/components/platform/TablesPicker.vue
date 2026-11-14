<script setup lang="ts">
// Whether a company uses tables, as the super admin sets it when making or
// editing a company: dining tables with QR codes customers scan to order, and
// the Tables view at the till; or nothing about tables at all. Turned off,
// the company's tables are kept (and its QR codes stop working) until it's
// turned on again.

// name: the radio group's name, one per form.
defineProps<{ name: string }>()
const on = defineModel<boolean>({ required: true })
const OPTIONS = [
  { value: true, key: 'On' },
  { value: false, key: 'Off' },
] as const
</script>

<template>
  <fieldset class="space-y-2" data-tables>
    <legend class="sr-only">{{ $t('platform.tables') }}</legend>
    <p class="text-sm font-medium" aria-hidden="true">{{ $t('platform.tables') }}</p>
    <p class="text-xs text-muted">{{ $t('platform.tablesHint') }}</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label
        v-for="o in OPTIONS"
        :key="o.key"
        class="flex gap-2.5 rounded-control border p-3 cursor-pointer transition-colors"
        :class="on === o.value ? 'border-primary bg-primary-tint' : 'border-line hover:bg-surface-subtle'"
      >
        <input v-model="on" type="radio" :name="name" :value="o.value" class="mt-0.5 shrink-0" :data-tables-option="o.key.toLowerCase()" />
        <span>
          <span class="block text-sm font-medium">{{ $t(`platform.tables${o.key}`) }}</span>
          <span class="block text-xs text-muted mt-0.5">{{ $t(`platform.tables${o.key}Hint`) }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>
