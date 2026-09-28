// Keeps a page's date range in sync with the URL query (`?from=...&to=...`)
// per build spec §8.3, so the range survives a refresh/share and each
// report page doesn't reimplement the same wiring. Defaults to the last 14
// days ending today.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

function isoDay(d: Date): string {
  // en-CA formats as YYYY-MM-DD in the browser's local timezone.
  return d.toLocaleDateString('en-CA')
}

export function defaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 13)
  return { from: isoDay(from), to: isoDay(to) }
}

export function useDateRangeQuery() {
  const route = useRoute()
  const router = useRouter()

  const range = computed({
    get: () => {
      const d = defaultRange()
      return {
        from: (route.query.from as string) || d.from,
        to: (route.query.to as string) || d.to,
      }
    },
    set: (value: { from: string; to: string }) => {
      router.replace({ query: { ...route.query, from: value.from, to: value.to } })
    },
  })

  return { range }
}
