// Which permissions open each back-office page, by route name: any one of
// them lets the person in. These are the server's own rules for the page's
// list (see backend/internal/routes/routes.go), so a page is never offered
// that would only answer "no permission". The sidebar hides what someone
// can't open, and a split page (Inventory, Users & Roles, Settings) offers
// only the parts they can.
//
// A page left out here is open to everyone signed in (Dashboard, which is
// where everyone lands; Settings > Exchange rate, Branches & devices, Payment
// methods, Company and Receipt, which everyone reads).
//
// The role editor lists each permission under the page it belongs to (see
// utils/permissionMenu.ts); its tests check the two agree.
export const PAGE_ACCESS: Readonly<Record<string, readonly string[]>> = {
  shifts: ['shift.own', 'report.sales'],
  'inventory-products': ['product.view'],
  'inventory-categories': ['category.view'],
  'inventory-moves': ['inventory.view'],
  'inventory-po': ['purchase_order.view'],
  'inventory-sales': ['pos.sell', 'report.sales'],
  'inventory-suppliers': ['supplier.view'],
  customers: ['customer.view'],
  invoices: ['invoice.view'],
  'reports-staff': ['report.sales'],
  'report-details': ['report.sales'],
  'profit-loss': ['report.profit_loss'],
  expenses: ['expense.view'],
  users: ['user.view'],
  roles: ['role.view'],
  'settings-tables': ['table.view'],
  'settings-alerts': ['system.manage'],
  'settings-system': ['system.manage'],
}

// Whether someone holding these permissions can open the page.
export function canOpen(route: string, has: (key: string) => boolean): boolean {
  const keys = PAGE_ACCESS[route]
  return !keys || keys.some(has)
}
