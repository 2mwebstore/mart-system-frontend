import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import { useTableOrders } from './useTableOrders'

// The table orders API, counting what the till asks for.
const server = vi.hoisted(() => ({ asked: [] as number[] }))
vi.mock('@/api/tableOrders', () => ({
  pageTableOrders: async (branchId: number) => {
    server.asked.push(branchId)
    return { data: [{ id: 1, status: 'ACCEPTED', tableName: 'T1' }], meta: { summary: { newOrders: 0 } } }
  },
}))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ info: () => {} }) }))

let app: App | null = null

async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r))
    await nextTick()
  }
}

function use(enabled: () => boolean) {
  let queue!: ReturnType<typeof useTableOrders>
  app = createApp({
    setup() {
      queue = useTableOrders(() => 3, enabled)
      return () => null
    },
  })
  app.mount(document.createElement('div'))
  return queue
}

afterEach(() => {
  app?.unmount()
  app = null
  server.asked = []
})

describe('the till’s table orders', () => {
  it('are asked for at the till’s branch', async () => {
    const queue = use(() => true)
    await settle()
    expect(server.asked).toEqual([3])
    expect(queue.orders.value).toHaveLength(1)
  })

  it('are never asked for while the company has no tables, and the list empties', async () => {
    const on = ref(true)
    const queue = use(() => on.value)
    await settle()
    expect(queue.orders.value).toHaveLength(1)

    on.value = false
    await queue.refresh()
    expect(server.asked).toEqual([3])
    expect(queue.orders.value).toEqual([])
    expect(queue.newCount.value).toBe(0)
  })
})
