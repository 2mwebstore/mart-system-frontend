// The "can't delete, it's still used" alert, shared by the whole app: the API
// client opens it for a single refused delete, and a bulk delete opens it once
// for every row it couldn't delete.
import { ref } from 'vue'
import type { InUseInfo } from '@/utils/inUse'

const shown = ref<InUseInfo[]>([])

export function useInUseAlert() {
  return {
    shown,
    show(items: InUseInfo[]) {
      if (items.length > 0) shown.value = items
    },
    close() {
      shown.value = []
    },
  }
}
