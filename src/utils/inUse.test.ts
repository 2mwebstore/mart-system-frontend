import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { i18n } from '@/i18n'
import en from '@/i18n/en.json'
import km from '@/i18n/km.json'
import { inUseFrom } from './inUse'

// An API error the way axios hands it over.
function apiError(status: number, error: unknown) {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  const response = { data: { success: false, error }, status, statusText: '', headers: {}, config }
  return new AxiosError('failed', undefined, config, null, response)
}

const refused = (details: unknown, code = 'PRODUCT_IN_USE') =>
  apiError(409, { code, message: '"Tea" can\'t be deleted', details })

describe('inUseFrom', () => {
  it('reads what the server says still uses the record', () => {
    const err = refused({
      entity: 'product',
      name: 'Tea',
      name_km: 'តែ',
      uses: [
        { what: 'sales', count: 12 },
        { what: 'invoices', count: 3 },
      ],
      hint: 'switch_off',
    })
    expect(inUseFrom(err)).toEqual({
      entity: 'product',
      name: 'Tea',
      nameKm: 'តែ',
      uses: [
        { what: 'sales', count: 12 },
        { what: 'invoices', count: 3 },
      ],
      hint: 'switch_off',
    })
  })

  it('leaves out a missing Khmer name and hint', () => {
    const info = inUseFrom(refused({ entity: 'customer', name: 'Dara', uses: [{ what: 'sales', count: 1 }] }, 'CUSTOMER_IN_USE'))
    expect(info).toEqual({ entity: 'customer', name: 'Dara', nameKm: undefined, uses: [{ what: 'sales', count: 1 }], hint: undefined })
  })

  it('is nothing for any other error', () => {
    const details = { entity: 'product', name: 'Tea', uses: [{ what: 'sales', count: 1 }] }
    expect(inUseFrom(apiError(422, { code: 'PRODUCT_IN_USE', message: 'x', details }))).toBeNull()
    expect(inUseFrom(apiError(409, { code: 'DUPLICATE_SKU', message: 'x', details }))).toBeNull()
    expect(inUseFrom(apiError(500, { code: 'INTERNAL', message: 'x' }))).toBeNull()
    expect(inUseFrom(new Error('Network Error'))).toBeNull()
    expect(inUseFrom(null)).toBeNull()
  })

  it('is nothing when the refusal says nothing about what uses the record', () => {
    expect(inUseFrom(refused(undefined))).toBeNull()
    expect(inUseFrom(refused({ entity: 'product', name: 'Tea' }))).toBeNull()
    expect(inUseFrom(refused({ entity: 'product', name: 'Tea', uses: [] }))).toBeNull()
    expect(inUseFrom(refused({ entity: 'product', name: 'Tea', uses: [{ what: 'sales', count: 0 }, { what: 7 }] }))).toBeNull()
  })

  it('drops uses it cannot read and keeps the rest', () => {
    const info = inUseFrom(refused({ entity: 'product', name: 'Tea', uses: [{ what: 'sales' }, { what: 'stock', count: 2 }] }))
    expect(info?.uses).toEqual([{ what: 'stock', count: 2 }])
  })
})

// Every kind of use the server can name (backend/internal/handlers/in_use.go,
// useNouns) and every hint and record type it sends.
const serverUses = [
  'sales',
  'invoices',
  'invoice_payments',
  'purchase_orders',
  'table_orders',
  'stock_transfers',
  'stock_counts',
  'stock_moves',
  'stock',
  'stocked_products',
  'expenses',
  'shifts',
  'cash_movements',
  'voids_refunds',
  'exchange_rates',
  'activity_log',
  'products',
  'tills',
  'tables',
  'staff',
  'roles',
]
const serverHints = ['switch_off', 'move_products', 'reassign_users']
const serverEntities = ['product', 'category', 'supplier', 'customer', 'branch', 'till', 'table', 'tax_rate', 'user', 'role']

describe('the alert has words for everything the server sends', () => {
  it.each([
    ['en', en],
    ['km', km],
  ] as const)('in %s', (_, messages) => {
    const inUse = (messages as { inUse: { what: object; hint: object; entity: object } }).inUse
    expect(Object.keys(inUse.what).sort()).toEqual([...serverUses].sort())
    expect(Object.keys(inUse.hint).sort()).toEqual([...serverHints].sort())
    expect(Object.keys(inUse.entity).sort()).toEqual([...serverEntities].sort())
  })

  it('counts in English', () => {
    expect(i18n.global.t('inUse.what.sales', { n: 1 }, 1)).toBe('1 POS sale')
    expect(i18n.global.t('inUse.what.sales', { n: 12 }, 12)).toBe('12 POS sales')
    expect(i18n.global.t('inUse.what.stock', { n: 2 }, 2)).toBe('Stock on hand at 2 branches')
  })
})
