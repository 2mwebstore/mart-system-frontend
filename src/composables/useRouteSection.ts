import { computed, watch, type WritableComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// A page split into several, each with its own address (Inventory > Products
// at /inventory/products, > Stock moves at /inventory/stock-moves…), all drawn
// by one component: the route's meta.section says which part it shows (see
// router/index.ts). Moving between them keeps the component, so what it has
// loaded stays.
//
// `allowed` gives the parts this person may see, the first one the default:
// opening another (e.g. Settings > System without system.manage) goes to it.
// Setting the value opens that part's page.
export function useRouteSection(allowed: () => string[]): WritableComputedRef<string> {
  const route = useRoute()
  const router = useRouter()
  const page = route.meta.page
  // While the page is being left the route already belongs to the next one;
  // keep the last part then rather than flicking back to the first.
  let last = ''

  const current = computed(() => {
    if (route.meta.page !== page) return last
    const keys = allowed()
    const asked = route.meta.section ?? ''
    last = keys.includes(asked) ? asked : (keys[0] ?? '')
    return last
  })

  function routeOf(section: string) {
    return router.getRoutes().find((r) => r.meta.page === page && r.meta.section === section)?.name
  }

  // Keep the address on the part shown.
  watch(
    [current, () => route.meta.section],
    ([shown, asked]) => {
      if (route.meta.page !== page || !shown || asked === shown) return
      const name = routeOf(shown)
      if (name) void router.replace({ name })
    },
    { immediate: true },
  )

  return computed({
    get: () => current.value,
    set: (section: string) => {
      const name = section === current.value ? undefined : routeOf(section)
      if (name) void router.push({ name })
    },
  })
}
