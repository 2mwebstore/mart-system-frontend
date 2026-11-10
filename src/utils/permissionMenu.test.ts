import { describe, expect, it } from 'vitest'
import en from '@/i18n/en.json'
import { groupByMenu, pagesOf, PERMISSION_MENU } from './permissionMenu'
import { canOpen, PAGE_ACCESS } from './pageAccess'

// Every permission the app has a label for (perm.* in en.json mirrors the
// server's models.PermissionDefs): "pos.sell", "purchase_order.receive"…
function knownKeys(): string[] {
  return Object.entries(en.perm).flatMap(([group, leaves]) => Object.keys(leaves).map((leaf) => `${group}.${leaf}`))
}

// Each place a permission can be listed: a sub-menu, or a menu without any.
const places = PERMISSION_MENU.flatMap((s) =>
  s.menus.flatMap((m) => (m.subs ? m.subs.map((sub) => ({ route: sub.route, keys: sub.keys })) : [{ route: m.route, keys: m.keys ?? [] }])),
)

describe('permission menu', () => {
  it('puts every known permission under a menu', () => {
    const onMenu = new Set(places.flatMap((p) => p.keys))
    expect(knownKeys().filter((k) => !onMenu.has(k))).toEqual([])
  })

  it('lists only known permissions', () => {
    const known = new Set(knownKeys())
    expect(places.flatMap((p) => p.keys).filter((k) => !known.has(k))).toEqual([])
  })

  it('gives a menu either sub-menus or its own permissions, not both', () => {
    for (const m of PERMISSION_MENU.flatMap((s) => s.menus)) {
      expect(!!m.subs !== !!m.keys, m.key).toBe(true)
      if (m.subs) expect(m.subs.length, m.key).toBeGreaterThan(0)
    }
  })

  it('names only real label keys', () => {
    const has = (path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en) !== undefined
    for (const s of PERMISSION_MENU) {
      if (s.captionKey) expect(has(s.captionKey), s.captionKey).toBe(true)
      for (const m of s.menus) {
        expect(has(m.labelKey), m.labelKey).toBe(true)
        for (const sub of m.subs ?? []) expect(has(sub.labelKey), sub.labelKey).toBe(true)
      }
    }
  })

  it('lists the permissions that open a page under that page', () => {
    for (const [route, opens] of Object.entries(PAGE_ACCESS)) {
      const place = places.find((p) => p.route === route)
      expect(place, route).toBeDefined()
      expect(opens.filter((k) => !place!.keys.includes(k)), route).toEqual([])
    }
  })

  it('puts each product permission under Inventory › Products, and nothing else there', () => {
    const groups = groupByMenu(knownKeys().map((key) => ({ key })))
    const inventory = groups.find((g) => g.key === 'operations')!.menus.find((m) => m.key === 'inventory')!
    expect(inventory.hasSubs).toBe(true)
    expect(inventory.subs.map((s) => s.key)).toEqual(['products', 'categories', 'moves', 'po', 'sales', 'suppliers', 'customers'])
    expect(inventory.subs[0].items.map((p) => p.key)).toEqual(['product.view', 'product.create', 'product.update', 'product.delete'])
    expect(groups.find((g) => g.key === 'other')).toBeUndefined()
  })

  it('keeps a menu without sub-menus as one group of its own', () => {
    const groups = groupByMenu([{ key: 'expense.view' }, { key: 'expense.delete' }])
    expect(groups.map((g) => g.key)).toEqual(['finance'])
    const [expenses] = groups[0].menus
    expect(expenses.hasSubs).toBe(false)
    expect(expenses.subs.map((s) => [s.key, s.items.map((p) => p.key)])).toEqual([['expenses', ['expense.view', 'expense.delete']]])
  })

  it('drops empty sub-menus, menus and sections, in sidebar order', () => {
    const groups = groupByMenu([{ key: 'role.view' }, { key: 'pos.sell' }, { key: 'category.create' }])
    expect(groups.map((g) => g.key)).toEqual(['operations', 'manage'])
    expect(groups[0].menus.map((m) => [m.key, m.subs.map((s) => s.key)])).toEqual([
      ['pos', ['pos']],
      ['inventory', ['categories', 'sales']],
    ])
    expect(groups[1].menus.map((m) => [m.key, m.subs.map((s) => s.key)])).toEqual([['users-roles', ['roles']]])
  })

  it('lists a shared permission on each page, as Menu › Sub-menu', () => {
    expect(pagesOf('report.sales')).toEqual([
      ['nav.dashboard'],
      ['nav.shifts'],
      ['nav.inventory', 'inventory.tabSales'],
      ['nav.reports', 'nav.reportsStaff'],
      ['nav.reports', 'nav.reportDetails'],
    ])
    expect(pagesOf('product.view')).toEqual([['nav.inventory', 'inventory.tabProducts']])
  })

  it('keeps a key the menu does not know under Other, last', () => {
    const groups = groupByMenu([{ key: 'pos.sell' }, { key: 'future.thing' }])
    const last = groups[groups.length - 1]
    expect(last.key).toBe('other')
    expect(last.menus[0].subs[0].items.map((p) => p.key)).toEqual(['future.thing'])
  })
})

describe('page access', () => {
  const holding = (...keys: string[]) => (k: string) => keys.includes(k)

  it('opens a page with any one of its permissions', () => {
    expect(canOpen('inventory-sales', holding('report.sales'))).toBe(true)
    expect(canOpen('inventory-sales', holding('pos.sell'))).toBe(true)
    expect(canOpen('inventory-sales', holding('pos.void'))).toBe(false)
  })

  it('needs the view permission, not just a create / edit / delete one', () => {
    expect(canOpen('inventory-products', holding('product.create', 'product.update', 'product.delete'))).toBe(false)
    expect(canOpen('inventory-products', holding('product.view'))).toBe(true)
  })

  it('leaves pages it does not list open to everyone', () => {
    expect(canOpen('dashboard', holding())).toBe(true)
    expect(canOpen('settings-branches', holding())).toBe(true)
  })
})
