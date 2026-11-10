import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, ref, type App } from 'vue'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { useInventoryData } from './useInventoryData'

function apiError(status: number, error: unknown) {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  return new AxiosError('failed', undefined, config, null, { data: { success: false, error }, status, statusText: '', headers: {}, config })
}

// Product 1 deletes, product 2 was sold, product 3 fails for another reason;
// the same for categories.
const sold = { entity: 'product', name: 'Tea', uses: [{ what: 'sales', count: 12 }], hint: 'switch_off' }
const full = { entity: 'category', name: 'Drinks', uses: [{ what: 'products', count: 4 }], hint: 'move_products' }
const answer = (id: number, details: unknown, code: string) => {
  if (id === 1) return Promise.resolve()
  if (id === 2) return Promise.reject(apiError(409, { code, message: 'in use', details }))
  return Promise.reject(apiError(500, { code: 'INTERNAL', message: 'boom' }))
}
const calls: { what: string; id: number; opts: unknown }[] = []
vi.mock('@/api/catalog', () => ({
  deleteProduct: (_branch: number, id: number, opts: unknown) => {
    calls.push({ what: 'product', id, opts })
    return answer(id, sold, 'PRODUCT_IN_USE')
  },
  deleteCategory: (id: number, opts: unknown) => {
    calls.push({ what: 'category', id, opts })
    return answer(id, full, 'CATEGORY_IN_USE')
  },
}))

let app: App | null = null
afterEach(() => {
  app?.unmount()
  app = null
  calls.length = 0
})

// The composable on a page that may see no list, so nothing loads but deletes.
function inventory() {
  let data!: ReturnType<typeof useInventoryData>
  app = createApp({
    setup() {
      data = useInventoryData(ref(1), () => false)
      return () => h('div')
    },
  })
  app.mount(document.createElement('div'))
  return data
}

describe('a bulk delete', () => {
  it('hands back what the server refused because other records use it', async () => {
    const out = await inventory().removeProducts([1, 2, 3])
    expect(out.ok).toEqual([1])
    expect(out.failed).toEqual([3])
    expect(out.blocked).toEqual([{ ...sold, nameKm: undefined }])
    // Silent: one summary, not a toast or alert per row.
    expect(calls.every((c) => (c.opts as { silent?: boolean }).silent)).toBe(true)
  })

  it('does the same for categories', async () => {
    const out = await inventory().removeCategories([1, 2, 3])
    expect(out.ok).toEqual([1])
    expect(out.failed).toEqual([3])
    expect(out.blocked).toEqual([{ ...full, nameKm: undefined }])
  })
})
