<script setup lang="ts">
// The search box every list uses: a magnifier, the text, and a × to clear it.
// `label` puts a caption above, lining it up with labelled filters beside it;
// without one, the placeholder is its accessible name. Width: full on phones,
// 16rem from sm (override with a class).
import { Search, X } from 'lucide-vue-next'

const model = defineModel<string>({ required: true })
defineProps<{ placeholder?: string; label?: string }>()
</script>

<template>
  <label class="block w-full sm:w-64">
    <span v-if="label" class="mb-1 block text-sm text-muted">{{ label }}</span>
    <span class="relative block">
      <Search :stroke-width="1.8" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        v-model="model"
        type="search"
        class="search-input input pl-9 pr-9"
        :placeholder="placeholder"
        :aria-label="label ? undefined : placeholder"
      />
      <button
        v-if="model"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition hover:bg-surface-subtle hover:text-ink"
        :aria-label="$t('common.clearSearch')"
        @click="model = ''"
      >
        <X :stroke-width="2" class="h-4 w-4" />
      </button>
    </span>
  </label>
</template>

<style scoped>
/* The × above replaces the browser's own. */
.search-input::-webkit-search-cancel-button {
  display: none;
}
</style>
