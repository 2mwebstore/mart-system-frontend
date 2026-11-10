import { computed, reactive, ref, watch, type WatchSource } from 'vue'

// Search, filters and pages for a list the server sends whole (branches,
// tills, payment methods, roles, dining tables…) — short lists that dropdowns
// elsewhere need complete. Same footer and behaviour as a server-paged list
// (usePagedList + Pagination), worked out in the browser.
//
// `text` is what the search box matches (any case); `filter` any other
// narrowing, with the refs it reads in `deps` so changing one goes back to
// page 1, as typing in the search box does.
export function useLocalList<T>(
  source: () => T[],
  options: { text: (row: T) => string; filter?: (row: T) => boolean; deps?: WatchSource[]; perPage?: number },
) {
  const search = ref('')
  const page = ref(1)
  const perPage = options.perPage ?? 10

  const matching = computed(() => {
    const q = search.value.trim().toLowerCase()
    return source().filter((row) => (!options.filter || options.filter(row)) && (!q || options.text(row).toLowerCase().includes(q)))
  })
  const total = computed(() => matching.value.length)
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage)))
  const rows = computed(() => matching.value.slice((page.value - 1) * perPage, page.value * perPage))

  watch([search, ...(options.deps ?? [])], () => (page.value = 1))
  // A row removed (or a narrower search) can leave the page past the end.
  watch(totalPages, (n) => {
    if (page.value > n) page.value = n
  })

  return reactive({ search, page, perPage, total, totalPages, rows })
}
