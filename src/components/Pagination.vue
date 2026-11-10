<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next'

// Footer for every paged list: "41–50 of 132 products", then the pages. From
// sm up, numbered pages (first, last and those around the current one); on a
// phone, ‹ 2 / 10 ›. Emits the new page; the parent owns the page number and
// refetches (usePagedList) or re-slices (useLocalList).
const props = defineProps<{ page: number; totalPages: number; total: number; perPage: number; noun?: string }>()
const { t } = useI18n()
const emit = defineEmits<{ 'update:page': [number] }>()

const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.perPage + 1))
const to = computed(() => Math.min(props.total, props.page * props.perPage))
const go = (n: number) => {
  const next = Math.min(Math.max(1, n), Math.max(1, props.totalPages))
  if (next !== props.page) emit('update:page', next)
}

// 1 … 4 5 6 … 20: the ends, and one either side of the current page.
const pages = computed<(number | 'gap')[]>(() => {
  const last = props.totalPages
  const keep = new Set([1, last, props.page - 1, props.page, props.page + 1].filter((n) => n >= 1 && n <= last))
  const out: (number | 'gap')[] = []
  let prev = 0
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev === 2) out.push(n - 1)
    else if (n - prev > 2) out.push('gap')
    out.push(n)
    prev = n
  }
  return out
})
</script>

<template>
  <div class="flex flex-col gap-3 pt-3 text-sm text-muted sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
    <span aria-live="polite">
      {{
        total === 0
          ? t('pagination.none', { noun: noun ?? t('pagination.results') })
          : t('pagination.range', { from, to, total, noun: noun ?? t('pagination.results') })
      }}
    </span>
    <nav v-if="totalPages > 1" class="flex items-center justify-between gap-1.5 sm:justify-end" :aria-label="t('pagination.label')">
      <button type="button" class="page-btn hidden sm:inline-flex" :disabled="page <= 1" :aria-label="t('pagination.first')" @click="go(1)">
        <ChevronsLeft :stroke-width="2" class="h-4 w-4" />
      </button>
      <button type="button" class="page-btn" :disabled="page <= 1" :aria-label="t('pagination.prev')" @click="go(page - 1)">
        <ChevronLeft :stroke-width="2" class="h-4 w-4" />
        <span class="sm:hidden">{{ t('pagination.prev') }}</span>
      </button>

      <span class="px-2 font-medium tabular-nums text-ink sm:hidden">{{ page }} / {{ totalPages }}</span>
      <template v-for="(p, i) in pages" :key="`${p}-${i}`">
        <span v-if="p === 'gap'" class="hidden px-1 sm:inline" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          class="page-btn hidden tabular-nums sm:inline-flex"
          :class="{ 'is-current': p === page }"
          :aria-current="p === page ? 'page' : undefined"
          :aria-label="t('pagination.goTo', { page: p })"
          @click="go(p)"
        >
          {{ p }}
        </button>
      </template>

      <button type="button" class="page-btn" :disabled="page >= totalPages" :aria-label="t('pagination.next')" @click="go(page + 1)">
        <span class="sm:hidden">{{ t('pagination.next') }}</span>
        <ChevronRight :stroke-width="2" class="h-4 w-4" />
      </button>
      <button type="button" class="page-btn hidden sm:inline-flex" :disabled="page >= totalPages" :aria-label="t('pagination.last')" @click="go(totalPages)">
        <ChevronsRight :stroke-width="2" class="h-4 w-4" />
      </button>
    </nav>
  </div>
</template>

<style scoped>
.page-btn {
  @apply h-9 min-w-[2.25rem] items-center justify-center gap-1 rounded-control border border-line bg-surface px-2.5 text-ink transition;
  @apply hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface;
  @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40;
}
.page-btn:not(.hidden) {
  display: inline-flex;
}
.page-btn.is-current {
  @apply border-primary bg-primary font-semibold text-primary-ink hover:bg-primary;
}
</style>
