import { describe, expect, it } from 'vitest'
import { findTrail, isItemActive, isLinkActive, onlyOpenable, type NavItem, type NavSection } from './nav'

const icon = {}
const inventory: NavItem = {
  key: 'inventory',
  label: 'Inventory',
  icon,
  children: [
    { key: 'products', label: 'Products', route: 'inventory-products' },
    { key: 'moves', label: 'Stock moves', route: 'inventory-moves' },
    { key: 'customers', label: 'Customers', route: 'customers' },
  ],
}
const invoices: NavItem = { key: 'invoices', label: 'Invoices', icon, route: 'invoices', also: ['invoice-edit'] }
const sections: NavSection[] = [{ key: 'ops', items: [invoices, inventory] }]

describe('sidebar nav', () => {
  it('marks the page showing, by its own route or another that counts as it', () => {
    expect(isLinkActive({ name: 'inventory-moves' }, inventory.children![1])).toBe(true)
    expect(isLinkActive({ name: 'inventory-products' }, inventory.children![1])).toBe(false)
    expect(isItemActive({ name: 'invoice-edit' }, invoices)).toBe(true)
  })

  it('marks a menu when one of its pages shows', () => {
    expect(isItemActive({ name: 'customers' }, inventory)).toBe(true)
    expect(isItemActive({ name: 'dashboard' }, inventory)).toBe(false)
  })

  it('finds the breadcrumb trail', () => {
    expect(findTrail({ name: 'inventory-moves' }, sections)).toEqual({ item: inventory, link: inventory.children![1] })
    expect(findTrail({ name: 'invoices' }, sections)).toEqual({ item: invoices, link: undefined })
    expect(findTrail({ name: 'dashboard' }, sections)).toBeNull()
  })

  it('lists only the pages that can be opened, dropping menus and sections left empty', () => {
    const dashboard: NavItem = { key: 'dashboard', label: 'Dashboard', icon, route: 'dashboard' }
    const pos: NavItem = { key: 'pos', label: 'POS', icon }
    const all: NavSection[] = [
      { key: 'main', items: [dashboard] },
      { key: 'ops', items: [invoices, inventory, pos] },
    ]
    const open = (...routes: string[]) => (r: string) => routes.includes(r)

    const some = onlyOpenable(all, open('dashboard', 'inventory-moves'))
    expect(some.map((s) => [s.key, s.items.map((i) => [i.key, i.children?.map((c) => c.key)])])).toEqual([
      ['main', [['dashboard', undefined]]],
      ['ops', [['inventory', ['moves']], ['pos', undefined]]],
    ])
    expect(onlyOpenable([{ key: 'ops', items: [invoices, inventory] }], open())).toEqual([])
    // The sections given are left as they were.
    expect(inventory.children).toHaveLength(3)
  })
})
