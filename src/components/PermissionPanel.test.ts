import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import { i18n, t } from '@/i18n'
import en from '@/i18n/en.json'
import type { Permission } from '@/types/domain'
import PermissionPanel from './PermissionPanel.vue'

// The server's catalog, as the English labels mirror it.
const catalog: Permission[] = Object.entries(en.perm).flatMap(([group, leaves], gi) =>
  Object.entries(leaves).map(([leaf, description], li) => ({ id: gi * 100 + li, key: `${group}.${leaf}`, group, description })),
)

let app: App | null = null
let host: HTMLElement
const granted = ref<string[]>([])

async function mount(start: string[] = []) {
  granted.value = [...start]
  host = document.createElement('div')
  document.body.appendChild(host)
  const Editor = defineComponent(() => () =>
    h(PermissionPanel, {
      modelValue: granted.value,
      'onUpdate:modelValue': (v: string[]) => (granted.value = v),
      permissions: catalog,
    }),
  )
  app = createApp(Editor).use(i18n)
  app.mount(host)
  await nextTick()
}

afterEach(() => {
  app?.unmount()
  app = null
  host.remove()
})

const menu = (key: string) => host.querySelector<HTMLElement>(`[data-perm-menu="${key}"]`)!
const sub = (menuKey: string, key: string) => menu(menuKey).querySelector<HTMLElement>(`[data-perm-sub="${key}"]`)!
const subKeys = (el: HTMLElement) => [...el.querySelectorAll('.font-mono')].map((n) => n.textContent?.trim())
const box = (label: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${t('users.permSelectGroup', { name: label })}"]`)!
async function tick(el: HTMLInputElement, on = true) {
  el.checked = on
  el.dispatchEvent(new Event('change'))
  await nextTick()
}

describe('PermissionPanel', () => {
  it('shows each main menu with its sub-menus, and the product permissions under Products', async () => {
    await mount()
    const inventory = menu('inventory')
    expect(inventory.textContent).toContain(t('nav.inventory'))
    expect([...inventory.querySelectorAll('[data-perm-sub]')].map((n) => n.getAttribute('data-perm-sub'))).toEqual([
      'products',
      'categories',
      'moves',
      'po',
      'sales',
      'suppliers',
      'customers',
    ])
    expect(subKeys(sub('inventory', 'products'))).toEqual(['product.view', 'product.create', 'product.update', 'product.delete'])
    expect(sub('inventory', 'products').textContent).toContain(t('inventory.tabProducts'))
  })

  it('marks the permission that opens the page', async () => {
    await mount()
    const rows = [...sub('inventory', 'products').querySelectorAll('label')].filter((l) => l.textContent?.includes(t('users.permOpensPage')))
    expect(rows.map((l) => l.querySelector('.font-mono')?.textContent)).toEqual(['product.view'])
  })

  it('says when either of two permissions opens a page', async () => {
    await mount()
    const label = (key: string) => t(`perm.${key}`)
    const names = new Intl.ListFormat(i18n.global.locale.value, { type: 'disjunction' }).format([label('pos.sell'), label('report.sales')])
    expect(sub('inventory', 'sales').querySelector('p')?.textContent?.trim()).toBe(t('users.permOpensWith', { names }))
    // One permission opens Products: no note.
    expect(sub('inventory', 'products').querySelector('p')).toBeNull()
  })

  it("a sub-menu's checkbox gives and takes away all of it, and nothing else", async () => {
    await mount(['pos.sell'])
    const products = box(`${t('nav.inventory')} › ${t('inventory.tabProducts')}`)
    await tick(products)
    expect(granted.value).toEqual(['pos.sell', 'product.view', 'product.create', 'product.update', 'product.delete'])
    expect(box(t('nav.inventory')).indeterminate).toBe(true)
    await tick(products, false)
    expect(granted.value).toEqual(['pos.sell'])
  })

  it("a main menu's checkbox gives all of its sub-menus", async () => {
    await mount()
    await tick(box(t('nav.usersRoles')))
    expect(granted.value).toEqual([
      'user.view',
      'user.create',
      'user.update',
      'user.delete',
      'role.view',
      'role.create',
      'role.update',
      'role.delete',
    ])
    expect(menu('users-roles').textContent).toContain('8/8')
  })

  it('a menu without sub-menus lists its permissions straight under it', async () => {
    await mount()
    const expenses = menu('expenses')
    expect(expenses.querySelectorAll('[data-perm-sub]')).toHaveLength(1)
    expect(box(`${t('nav.expenses')} › ${t('nav.expenses')}`)).toBeNull()
    expect(subKeys(expenses)).toEqual(['expense.view', 'expense.create', 'expense.update', 'expense.delete'])
  })

  it('searching a sub-menu by name shows just that sub-menu, whole', async () => {
    await mount()
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!
    // "Stock moves": none of its permissions is worded that way.
    search.value = t('inventory.tabMoves')
    search.dispatchEvent(new Event('input'))
    await nextTick()
    expect([...host.querySelectorAll('[data-perm-sub]')].map((n) => n.getAttribute('data-perm-sub'))).toEqual(['moves'])
    expect(subKeys(sub('inventory', 'moves'))).toEqual(['inventory.view', 'inventory.adjust', 'inventory.transfer'])
  })

  it('counts a permission on two sub-menus of one menu once', async () => {
    await mount()
    // View sales reports is on Reports & Staff and on Report details.
    expect(menu('reports').textContent).toContain('0/4')
    await tick(box(t('nav.reports')))
    expect(granted.value).toEqual(['report.sales', 'report.profit_loss', 'report.export', 'report.activity_log'])
    expect(menu('reports').textContent).toContain('4/4')
  })
})
