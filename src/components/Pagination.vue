<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Footer for every server-paged list: "41–50 of 132 products", Prev / Page x of
// y / Next. Emits the new page; the parent owns the page number and refetches.
const props = defineProps<{ page: number; totalPages: number; total: number; perPage: number; noun?: string }>()
const { t } = useI18n()
const emit = defineEmits<{ 'update:page': [number] }>()

const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.perPage + 1))
const to = computed(() => Math.min(props.total, props.page * props.perPage))
const go = (n: number) => emit('update:page', Math.min(Math.max(1, n), Math.max(1, props.totalPages)))
</script>

<template>
  <div class="flex items-center justify-between gap-3 text-sm text-muted pt-3">
    <span>
      {{
        total === 0
          ? t('pagination.none', { noun: noun ?? t('pagination.results') })
          : t('pagination.range', { from, to, total, noun: noun ?? t('pagination.results') })
      }}
    </span>
    <div v-if="totalPages > 1" class="flex items-center gap-2">
      <button type="button" class="btn-secondary px-3 py-1" :disabled="page <= 1" :aria-label="t('pagination.first')" @click="go(1)">«</button>
      <button type="button" class="btn-secondary px-3 py-1" :disabled="page <= 1" @click="go(page - 1)">{{ t('pagination.prev') }}</button>
      <span>{{ t('pagination.page', { page, total: totalPages }) }}</span>
      <button type="button" class="btn-secondary px-3 py-1" :disabled="page >= totalPages" @click="go(page + 1)">{{ t('pagination.next') }}</button>
      <button type="button" class="btn-secondary px-3 py-1" :disabled="page >= totalPages" :aria-label="t('pagination.last')" @click="go(totalPages)">»</button>
    </div>
  </div>
</template>
