import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useShiftStore } from '@/stores/shift'
import { useSettingsStore } from '@/stores/settings'
import { getAccessToken } from '@/api/tokens'

const DefaultLayout = () => import('@/layouts/DefaultLayout.vue')

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
    { path: '/pos/open-shift', name: 'pos-open-shift', component: () => import('@/pages/pos/OpenShiftPage.vue'), meta: { pos: true } },
    { path: '/pos/close-shift', name: 'pos-close-shift', component: () => import('@/pages/pos/CloseShiftPage.vue'), meta: { pos: true } },
    { path: '/pos', name: 'pos', component: () => import('@/pages/pos/PosPage.vue'), meta: { pos: true } },
    {
      path: '/',
      component: DefaultLayout,
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue') },
        { path: 'shifts', name: 'shifts', component: () => import('@/pages/ShiftsPage.vue') },
        { path: 'inventory', name: 'inventory', component: () => import('@/pages/InventoryPage.vue') },
        { path: 'reports-staff', name: 'reports-staff', component: () => import('@/pages/ReportsStaffPage.vue') },
        { path: 'report-details', name: 'report-details', component: () => import('@/pages/ReportDetailsPage.vue') },
        { path: 'profit-loss', name: 'profit-loss', component: () => import('@/pages/ProfitLossPage.vue') },
        { path: 'users-roles', name: 'users-roles', component: () => import('@/pages/UsersRolesPage.vue') },
        { path: 'customers', name: 'customers', component: () => import('@/pages/CustomersPage.vue') },
        { path: 'expenses', name: 'expenses', component: () => import('@/pages/ExpensesPage.vue') },
        { path: 'settings', name: 'settings', component: () => import('@/pages/SettingsPage.vue') },
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

  // Exchange rate + app settings feed every priced screen; loaded once.
  await useSettingsStore().ensureLoaded()

  // Every admin page other than Settings itself is branch-scoped — with no
  // branches at all (most drastically: right after a production reset,
  // which now wipes every branch), each one would otherwise 403 with the
  // exact same generic message a real permission problem gives, since the
  // request has nothing valid to send as branch_id. Send them straight to
  // where they can fix that instead of letting them hit a confusing error
  // on whatever page they land on first.
  if (!to.meta.pos && auth.branches.length === 0 && to.name !== 'settings') {
    return { name: 'settings', query: { tab: 'branches' } }
  }

  if (!to.meta.pos) return true

  // A valid admin (password) session must never silently double as a till
  // session — whoever's actually standing at the till still has to sign in
  // with their own PIN, even if someone else is already signed into the
  // back office in another tab on this same machine (see the comment on
  // `viaPinLogin` in stores/auth.ts).
  if (!auth.viaPinLogin) return { name: 'pos-login' }

  if (!auth.deviceKey) return { name: 'pos-login' }

  // POS routes additionally gate on whether this till has an open shift. The
  // server is the source of truth (an admin can open or close the same till's
  // shift from the Shifts page), so it is re-checked on every POS navigation.
  const shift = useShiftStore()
  try {
    await shift.refresh(auth.deviceKey)
  } catch {
    return { name: 'pos-login' }
  }
  if (!shift.isOpen && to.name !== 'pos-open-shift') return { name: 'pos-open-shift' }
  if (shift.isOpen && to.name === 'pos-open-shift') return { name: 'pos' }
  return true
})

export default router
