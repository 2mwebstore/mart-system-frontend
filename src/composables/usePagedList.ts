import { onMounted, ref, watch, type Ref, type WatchSource } from 'vue'
import type { Paged, PageQuery } from '@/api/http'

// Debounced copy of a ref — used for search boxes so each keystroke doesn't
// hit the API.
export function useDebounced<T>(source: Ref<T>, ms = 300): Ref<T> {
  const out = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(source, (v) => {
    clearTimeout(timer)
    timer = setTimeout(() => (out.value = v), ms)
  })
  return out
}

// State for one server-paged list. `fetcher` receives {page, perPage} and
// returns the page; `deps` are the filters — changing any of them jumps back
// to page 1 and refetches. `reload()` refetches the current page (call it
// after a create / edit / delete), stepping back a page if the current one
// has just become empty.
export function usePagedList<T, S = undefined>(
  fetcher: (q: PageQuery) => Promise<Paged<T[], S>>,
  options: { perPage?: number; deps?: WatchSource[] } = {},
) {
  const perPage = options.perPage ?? 10
  const rows = ref([]) as Ref<T[]>
  const page = ref(1)
  const total = ref(0)
  const totalPages = ref(1)
  const summary = ref() as Ref<S | undefined>
  const loading = ref(false)
  let seq = 0

  async function load() {
    const mine = ++seq
    loading.value = true
    try {
      const res = await fetcher({ page: page.value, perPage })
      if (mine !== seq) return // a newer request superseded this one
      rows.value = res.data
      total.value = res.meta.total
      totalPages.value = res.meta.totalPages
      summary.value = res.meta.summary
      if (res.data.length === 0 && page.value > 1 && res.meta.total > 0) {
        page.value = res.meta.totalPages
        await load()
      }
    } catch {
      // the API client already toasted the reason
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  onMounted(load)
  watch(page, load)
  if (options.deps?.length) {
    watch(options.deps, () => {
      if (page.value !== 1) page.value = 1 // the page watcher refetches
      else void load()
    })
  }

  return { rows, page, perPage, total, totalPages, summary, loading, reload: load }
}
