import type { Component } from 'vue'
import { BarChart3, Clock, FileText, KeyRound, LayoutDashboard, Package, Receipt, Settings, ShoppingCart, Users } from 'lucide-vue-next'

// Permissions laid out like the sidebar (layouts/DefaultLayout.vue): the same
// captions, then each main menu with its icon, then its sub-menus (Inventory >
// Products, > Categories…), each with the permissions that open it or act on
// it. A menu with no sub-menus (Shifts, Expenses…) lists its permissions
// itself. The POS has no sidebar entry (it's the top bar's button) and leads
// Operations. Keep this in step with the sidebar, with utils/pageAccess.ts
// and with models.PermissionDefs on the server.
//
// A permission that opens several pages is listed on each — View sales
// reports fills the Dashboard and opens the Reports pages — and ticking it on
// one ticks it on all. Labels are i18n keys.

export interface PermissionSubMenu {
  key: string
  labelKey: string
  // The page's route name, when it is one (see utils/pageAccess.ts).
  route?: string
  // The permission keys for this page, in the order shown.
  keys: string[]
}

export interface PermissionMenu {
  key: string
  labelKey: string
  icon: Component
  route?: string
  // A menu without sub-menus: its own permissions.
  keys?: string[]
  // A menu with sub-menus, in the sidebar's order.
  subs?: PermissionSubMenu[]
}

export interface PermissionMenuSection {
  key: string
  // The sidebar caption's i18n key; none for the top entries.
  captionKey?: string
  menus: PermissionMenu[]
}

export const PERMISSION_MENU: PermissionMenuSection[] = [
  {
    key: 'main',
    menus: [{ key: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, route: 'dashboard', keys: ['report.sales'] }],
  },
  {
    key: 'operations',
    captionKey: 'nav.groupOperations',
    menus: [
      {
        key: 'pos',
        labelKey: 'nav.pos',
        icon: ShoppingCart,
        keys: ['pos.sell', 'pos.discount', 'pos.edit_sale', 'pos.void', 'pos.refund', 'pos.open_drawer', 'pos.cash_movement'],
      },
      {
        key: 'shifts',
        labelKey: 'nav.shifts',
        icon: Clock,
        route: 'shifts',
        keys: ['shift.own', 'shift.close_others', 'shift.see_expected', 'report.sales'],
      },
      {
        key: 'inventory',
        labelKey: 'nav.inventory',
        icon: Package,
        subs: [
          {
            key: 'products',
            labelKey: 'inventory.tabProducts',
            route: 'inventory-products',
            keys: ['product.view', 'product.create', 'product.update', 'product.delete'],
          },
          {
            key: 'categories',
            labelKey: 'inventory.tabCategories',
            route: 'inventory-categories',
            keys: ['category.view', 'category.create', 'category.update', 'category.delete'],
          },
          {
            key: 'moves',
            labelKey: 'inventory.tabMoves',
            route: 'inventory-moves',
            keys: ['inventory.view', 'inventory.adjust', 'inventory.transfer'],
          },
          {
            key: 'po',
            labelKey: 'inventory.tabPo',
            route: 'inventory-po',
            keys: ['purchase_order.view', 'purchase_order.create', 'purchase_order.update', 'purchase_order.delete', 'purchase_order.receive'],
          },
          {
            key: 'sales',
            labelKey: 'inventory.tabSales',
            route: 'inventory-sales',
            keys: ['report.sales', 'pos.sell', 'pos.edit_sale', 'pos.void'],
          },
          {
            key: 'suppliers',
            labelKey: 'inventory.tabSuppliers',
            route: 'inventory-suppliers',
            keys: ['supplier.view', 'supplier.create', 'supplier.update', 'supplier.delete'],
          },
          {
            key: 'customers',
            labelKey: 'nav.customers',
            route: 'customers',
            keys: ['customer.view', 'customer.create', 'customer.update', 'customer.delete'],
          },
        ],
      },
      {
        key: 'invoices',
        labelKey: 'nav.invoices',
        icon: FileText,
        route: 'invoices',
        keys: ['invoice.view', 'invoice.create', 'invoice.update', 'invoice.delete'],
      },
    ],
  },
  {
    key: 'finance',
    captionKey: 'nav.groupFinance',
    menus: [
      {
        key: 'reports',
        labelKey: 'nav.reports',
        icon: BarChart3,
        subs: [
          { key: 'reports-staff', labelKey: 'nav.reportsStaff', route: 'reports-staff', keys: ['report.sales'] },
          {
            key: 'report-details',
            labelKey: 'nav.reportDetails',
            route: 'report-details',
            keys: ['report.sales', 'report.export', 'report.activity_log'],
          },
          { key: 'profit-loss', labelKey: 'nav.profitLoss', route: 'profit-loss', keys: ['report.profit_loss'] },
        ],
      },
      {
        key: 'expenses',
        labelKey: 'nav.expenses',
        icon: Receipt,
        route: 'expenses',
        keys: ['expense.view', 'expense.create', 'expense.update', 'expense.delete'],
      },
    ],
  },
  {
    key: 'manage',
    captionKey: 'nav.groupManage',
    menus: [
      {
        key: 'users-roles',
        labelKey: 'nav.usersRoles',
        icon: Users,
        subs: [
          { key: 'users', labelKey: 'users.tabUsers', route: 'users', keys: ['user.view', 'user.create', 'user.update', 'user.delete'] },
          { key: 'roles', labelKey: 'users.tabRoles', route: 'roles', keys: ['role.view', 'role.create', 'role.update', 'role.delete'] },
        ],
      },
      {
        key: 'settings',
        labelKey: 'nav.settings',
        icon: Settings,
        subs: [
          { key: 'rate', labelKey: 'settings.tabRate', route: 'settings-rate', keys: ['settings.rate'] },
          {
            key: 'branches',
            labelKey: 'settings.tabBranches',
            route: 'settings-branches',
            keys: ['branch.view', 'branch.create', 'branch.update', 'branch.delete'],
          },
          {
            key: 'tables',
            labelKey: 'tables.tab',
            route: 'settings-tables',
            keys: ['table.view', 'table.create', 'table.update', 'table.delete'],
          },
          {
            key: 'payments',
            labelKey: 'settings.tabPayments',
            route: 'settings-payments',
            keys: ['payment_method.create', 'payment_method.update', 'payment_method.delete'],
          },
          { key: 'tax', labelKey: 'tax.tab', route: 'settings-tax', keys: ['tax_rate.create', 'tax_rate.update', 'tax_rate.delete'] },
          { key: 'company', labelKey: 'settings.tabCompany', route: 'settings-company', keys: ['settings.company'] },
          { key: 'receipt', labelKey: 'settings.tabReceipt', route: 'settings-receipt', keys: ['settings.company'] },
          { key: 'alerts', labelKey: 'alerts.tab', route: 'settings-alerts', keys: ['system.manage'] },
          { key: 'system', labelKey: 'settings.tabSystem', route: 'settings-system', keys: ['system.manage', 'system.reset'] },
        ],
      },
    ],
  },
]

// Every page a permission is listed on, as "Menu › Sub-menu" label keys, for
// "Also on…". A menu without sub-menus is just its own label.
export function pagesOf(key: string): string[][] {
  return PERMISSION_MENU.flatMap((s) =>
    s.menus.flatMap((m) =>
      m.subs ? m.subs.filter((sub) => sub.keys.includes(key)).map((sub) => [m.labelKey, sub.labelKey]) : m.keys?.includes(key) ? [[m.labelKey]] : [],
    ),
  )
}

export interface SubGroup<T> extends PermissionSubMenu {
  items: T[]
}
export interface MenuGroup<T> {
  key: string
  labelKey: string
  icon: Component
  // A menu without sub-menus has one, with the menu's own key and label.
  subs: SubGroup<T>[]
  hasSubs: boolean
}
export interface SectionGroup<T> {
  key: string
  captionKey?: string
  menus: MenuGroup<T>[]
}

// Sorts permissions into the sidebar's sections, menus and sub-menus, in the
// sidebar's order. A key the menu doesn't know yet (a newer server) goes to
// "Other" at the end, so it can still be given. Empty sub-menus, menus and
// sections are dropped.
export function groupByMenu<T extends { key: string }>(permissions: T[]): SectionGroup<T>[] {
  const byKey = new Map(permissions.map((p) => [p.key, p]))
  const placed = new Set<string>()
  const take = (keys: string[]) =>
    keys.flatMap((k) => {
      const p = byKey.get(k)
      if (!p) return []
      placed.add(k)
      return [p]
    })
  const groups: SectionGroup<T>[] = PERMISSION_MENU.map((section) => ({
    key: section.key,
    captionKey: section.captionKey,
    menus: section.menus
      .map((menu): MenuGroup<T> => {
        const subs = menu.subs ?? [{ key: menu.key, labelKey: menu.labelKey, route: menu.route, keys: menu.keys ?? [] }]
        return {
          key: menu.key,
          labelKey: menu.labelKey,
          icon: menu.icon,
          hasSubs: !!menu.subs,
          subs: subs.map((sub) => ({ ...sub, items: take(sub.keys) })).filter((sub) => sub.items.length > 0),
        }
      })
      .filter((menu) => menu.subs.length > 0),
  }))
  const rest = permissions.filter((p) => !placed.has(p.key))
  if (rest.length) {
    groups.push({
      key: 'other',
      captionKey: 'users.permOther',
      menus: [
        {
          key: 'other',
          labelKey: 'users.permOther',
          icon: KeyRound,
          hasSubs: false,
          subs: [{ key: 'other', labelKey: 'users.permOther', keys: rest.map((p) => p.key), items: rest }],
        },
      ],
    })
  }
  return groups.filter((s) => s.menus.length > 0)
}
