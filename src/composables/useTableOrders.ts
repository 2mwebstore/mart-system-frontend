import { onMounted, onUnmounted, ref } from 'vue'
import * as tableApi from '@/api/tableOrders'
import { useToast } from '@/composables/useToast'
import { t } from '@/i18n'
import type { TableOrder } from '@/types/domain'

const POLL_MS = 8000

// Two short rising tones. Browsers only allow audio after the page has been
// interacted with, which the POS always has been (sign-in, taps).
function chime() {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.gain.value = 0.15
    gain.connect(ctx.destination)
    ;[880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      osc.start(ctx.currentTime + i * 0.18)
      osc.stop(ctx.currentTime + i * 0.18 + 0.16)
    })
    setTimeout(() => void ctx.close(), 600)
  } catch {
    // no audio available — the toast and badge still show
  }
}

// The POS's queue of open QR table orders for its branch, polled. A NEW order
// this screen hasn't seen yet plays a chime and shows a toast.
export function useTableOrders(branchId: () => number) {
  const toast = useToast()
  const orders = ref<TableOrder[]>([])
  const newCount = ref(0)
  const seen = new Set<number>()
  let timer: ReturnType<typeof setInterval> | undefined

  async function refresh() {
    const id = branchId()
    if (!id) return
    try {
      // 100 is the API's page maximum; open orders come newest first.
      const res = await tableApi.pageTableOrders(id, { page: 1, perPage: 100, status: 'open' }, true)
      orders.value = res.data
      newCount.value = res.meta.summary?.newOrders ?? res.data.filter((o) => o.status === 'NEW').length
      const fresh = res.data.filter((o) => o.status === 'NEW' && !seen.has(o.id))
      res.data.forEach((o) => seen.add(o.id))
      if (fresh.length) {
        chime()
        toast.info(fresh.length === 1 ? t('pos.newTableOrder', { table: fresh[0].tableName }) : t('pos.newTableOrders', { n: fresh.length }))
      }
    } catch {
      // keep the last list; the next poll retries
    }
  }

  async function accept(id: number) {
    await tableApi.acceptTableOrder(id)
    await refresh()
  }
  async function reject(id: number, reason: string) {
    await tableApi.cancelTableOrder(id, reason)
    await refresh()
  }
  async function move(orderIds: number[], toTableId: number) {
    const res = await tableApi.moveTableOrders(orderIds, toTableId)
    await refresh()
    return res
  }

  onMounted(() => {
    void refresh()
    timer = setInterval(() => void refresh(), POLL_MS)
  })
  onUnmounted(() => clearInterval(timer))

  return { orders, newCount, refresh, accept, reject, move }
}
