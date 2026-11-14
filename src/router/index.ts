import { createRouter, createWebHistory, type RouteLocationRaw, type RouteRecordRaw, type RouteRecordSingleView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useShiftStore } from '@/stores/shift'
import { useSettingsStore } from '@/stores/settings'
import { getAccessToken } from '@/api/tokens'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    pos?: boolean
    platform?: boolean
    // A page split into several (Inventory > Products, > Stock moves…): which
    // one, and which part of it. See composables/useRouteSection.ts.
    page?: string
    section?: string
  }
}

const DefaultLayout = () => import('@/layouts/DefaultLayout.vue')
const PlatformLayout = () => import('@/layouts/PlatformLayout.vue')
const InventoryPage = () => import('@/pages/InventoryPage.vue')
const UsersRolesPage = () => import('@/pages/UsersRolesPage.vue')
const SettingsPage = () => import('@/pages/SettingsPage.vue')

// Each part of a split page is a route of its own: [path, route name, section].
const inventorySections = [
  ['inventory/products', 'inventory-products', 'products'],
  ['inventory/categories', 'inventory-categories', 'categories'],
  ['inventory/stock-moves', 'inventory-moves', 'moves'],
  ['inventory/purchase-orders', 'inventory-po', 'po'],
  ['inventory/sales', 'inventory-sales', 'sales'],
  ['inventory/suppliers', 'inventory-suppliers', 'suppliers'],
] as const
const usersRolesSections = [
  ['users', 'users', 'users'],
  ['roles', 'roles', 'roles'],
] as const
const settingsSections = [
  ['settings/exchange-rate', 'settings-rate', 'rate'],
  ['settings/branches', 'settings-branches', 'branches'],
  ['settings/tables', 'settings-tables', 'tables'],
  ['settings/payment-methods', 'settings-payments', 'payments'],
  ['settings/tax-rates', 'settings-tax', 'tax'],
  ['settings/company', 'settings-company', 'company'],
  ['settings/receipt', 'settings-receipt', 'receipt'],
  ['settings/alerts', 'settings-alerts', 'alerts'],
  ['settings/system', 'settings-system', 'system'],
] as const

type Sections = readonly (readonly [string, string, string])[]

function sectionRoutes(page: string, component: RouteRecordSingleView['component'], sections: Sections): RouteRecordRaw[] {
  return sections.map(([path, name, section]) => ({ path, name, component, meta: { page, section } }))
}

// The page's old address (/inventory, /settings?tab=branches…) opens the part
// it used to show as a tab, else the first.
function sectionRedirect(sections: Sections) {
  return (to: { query: Record<string, unknown> }): RouteLocationRaw => ({
    name: (sections.find(([, , section]) => section === to.query.tab) ?? sections[0])[1],
  })
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { public: true },
    },
    // POS is its own full-screen route tree (no sidebar chrome, PIN login
    // instead of password) but lives in this same project/build — see
    // docs/DECISIONS.md for why it was merged in rather than kept as a
    // second npm project.
    {
      path: '/pos/login',
      name: 'pos-login',
      component: () => import('@/pages/pos/PinLoginPage.vue'),
      meta: { public: true },
    },
    // A table's QR code opens this: the menu, ordering and order status for a
    // customer's phone. Public — the table token in the URL is the access key.
    {
      path: '/t/:token',
      name: 'table-menu',
      component: () => import('@/pages/TableMenuPage.vue'),
      meta: { public: true },
    },
    // Printable invoice (signed-in, no app chrome).
    {
      path: '/print/invoice/:id',
      name: 'invoice-print',
      component: () => import('@/pages/InvoicePrintPage.vue'),
    },
    // Printable QR sheet for a branch's tables (signed-in, no app chrome).
    {
      path: '/print/table-qr',
      name: 'table-qr-print',
      component: () => import('@/pages/TableQrPrintPage.vue'),
    },
    // Customer-facing second screen. Public: it makes no API calls and only
    // shows what the POS tab in this same browser sends it.
    {
      path: '/pos/customer-display',
      name: 'pos-customer-display',
      component: () => import('@/pages/pos/CustomerDisplayPage.vue'),
      meta: { public: true },
    },
    { path: '/pos/open-shift', name: 'pos-open-shift', component: () => import('@/pages/pos/OpenShiftPage.vue'), meta: { pos: true } },
    { path: '/pos/close-shift', name: 'pos-close-shift', component: () => import('@/pages/pos/CloseShiftPage.vue'), meta: { pos: true } },
    { path: '/pos', name: 'pos', component: () => import('@/pages/pos/PosPage.vue'), meta: { pos: true } },
    // The super admin's pages: the companies, and the tools that cover every
    // company at once. Nobody else reaches them, and the super admin reaches
    // nothing else (they work in no company).
    {
      path: '/platform',
      component: PlatformLayout,
      meta: { platform: true },
      children: [
        { path: '', redirect: '/platform/companies' },
        { path: 'companies', name: 'platform-companies', component: () => import('@/pages/platform/CompaniesPage.vue'), meta: { platform: true } },
        {
          path: 'companies/:id/edit',
          name: 'platform-company-edit',
          component: () => import('@/pages/platform/CompanyEditPage.vue'),
          meta: { platform: true },
        },
        { path: 'system', name: 'platform-system', component: () => import('@/pages/platform/SystemPage.vue'), meta: { platform: true } },
      ],
    },
    {
      path: '/',
      component: DefaultLayout,
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue') },
        { path: 'shifts', name: 'shifts', component: () => import('@/pages/ShiftsPage.vue') },
        { path: 'inventory', name: 'inventory', redirect: sectionRedirect(inventorySections) },
        ...sectionRoutes('inventory', InventoryPage, inventorySections),
        { path: 'inventory/purchase-orders/new', name: 'po-new', component: () => import('@/pages/PurchaseOrderEditPage.vue') },
        { path: 'inventory/purchase-orders/:id/edit', name: 'po-edit', component: () => import('@/pages/PurchaseOrderEditPage.vue') },
        { path: 'inventory/customers', name: 'customers', component: () => import('@/pages/CustomersPage.vue') },
        { path: 'customers', redirect: { name: 'customers' } },
        { path: 'invoices', name: 'invoices', component: () => import('@/pages/InvoicesPage.vue') },
        { path: 'invoices/new', name: 'invoice-new', component: () => import('@/pages/InvoiceEditPage.vue') },
        { path: 'invoices/:id/edit', name: 'invoice-edit', component: () => import('@/pages/InvoiceEditPage.vue') },
        { path: 'reports-staff', name: 'reports-staff', component: () => import('@/pages/ReportsStaffPage.vue') },
        { path: 'report-details', name: 'report-details', component: () => import('@/pages/ReportDetailsPage.vue') },
        { path: 'profit-loss', name: 'profit-loss', component: () => import('@/pages/ProfitLossPage.vue') },
        { path: 'users-roles', name: 'users-roles', redirect: sectionRedirect(usersRolesSections) },
        ...sectionRoutes('users-roles', UsersRolesPage, usersRolesSections),
        { path: 'users/new', name: 'user-new', component: () => import('@/pages/UserEditPage.vue') },
        { path: 'users/:id/edit', name: 'user-edit', component: () => import('@/pages/UserEditPage.vue') },
        { path: 'expenses', name: 'expenses', component: () => import('@/pages/ExpensesPage.vue') },
        { path: 'settings', name: 'settings', redirect: sectionRedirect(settingsSections) },
        ...sectionRoutes('settings', SettingsPage, settingsSections),
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true

  const hasToken = !!getAccessToken()
  if (!hasToken) return { name: to.meta.pos ? 'pos-login' : 'login' }

  const auth = useAuthStore()
  if (!auth.isAuthenticated) {
    try {
      await auth.fetchMe()
    } catch {
      return { name: to.meta.pos ? 'pos-login' : 'login' }
    }
  }

  // A PIN sign-in only opens the till (the server refuses it everything else),
  // so the back office asks for a password rather than showing broken pages.
  if (auth.viaPinLogin && !to.meta.pos) return { name: 'login' }

  // The super admin has the platform pages and nothing else; everyone else
  // has everything but those.
  if (auth.isSuperAdmin) return to.meta.platform ? true : { name: 'platform-companies' }
  if (to.meta.platform) return { name: 'dashboard' }

  // Exchange rate + app settings feed every priced screen; loaded once.
  const settings = useSettingsStore()
  await settings.ensureLoaded()

  // A company without shifts (the super admin's choice) has no Shifts page
  // and no closing a shift at the till.
  if (!settings.usesShifts && to.name === 'shifts') return { name: 'dashboard' }
  if (!settings.usesShifts && to.name === 'pos-close-shift') return { name: 'pos' }
  // A company without tables (the super admin's choice too) has no Tables &
  // QR settings and no QR sheet to print.
  if (!settings.usesTables && (to.name === 'settings-tables' || to.name === 'table-qr-print')) return { name: 'dashboard' }

  // Every admin page other than Settings itself is branch-scoped — with no
  // branches at all (most drastically: right after a production reset,
  // which now wipes every branch), each one would otherwise 403 with the
  // exact same generic message a real permission problem gives, since the
  // request has nothing valid to send as branch_id. Send them straight to
  // where they can fix that instead of letting them hit a confusing error
  // on whatever page they land on first.
  if (!to.meta.pos && auth.branches.length === 0 && to.meta.page !== 'settings') {
    return { name: 'settings-branches' }
  }

  if (!to.meta.pos) return true

  // A PIN sign-in, or a back-office session that can sell, can run the till
  // (no second sign-in for the latter — see docs/DECISIONS.md). Either way a
  // till must be picked first; /pos/login does that.
  if (!auth.viaPinLogin && !auth.canUsePos) return { name: 'pos-login' }
  if (!auth.deviceKey) return { name: 'pos-login' }
  // The back office's selected branch decides the till: a remembered till
  // at another branch (or one remembered before its branch was kept) is
  // picked again there. A PIN sign-in is at its till's branch already.
  if (!auth.viaPinLogin && auth.tillBranchId !== auth.activeBranchId) return { name: 'pos-login' }

  // POS routes additionally gate on whether this till has an open shift. The
  // server is the source of truth (an admin can open or close the same till's
  // shift from the Shifts page), so it is re-checked on every POS navigation.
  const shift = useShiftStore()
  try {
    await shift.refresh(auth.deviceKey)
  } catch {
    return { name: 'pos-login' }
  }
  // A company without shifts: the till opens one by itself, with nothing
  // counted in the drawer, and keeps it (there's no closing it). The setting
  // is read again here, as the super admin may have changed it since sign-in.
  if (!shift.isOpen) {
    try {
      await settings.load()
      if (!settings.usesShifts) await shift.openShift(0, 0)
    } catch {
      // the API client already toasted why; the Open shift page is the way in
    }
  }
  if (!shift.isOpen && to.name !== 'pos-open-shift') return { name: 'pos-open-shift' }
  if (shift.isOpen && to.name === 'pos-open-shift') return { name: 'pos' }
  return true
})

export default router
