<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { label } from '@/i18n'
import BrandLogo from '@/components/BrandLogo.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import BranchMenu from '@/components/layout/BranchMenu.vue'
import UserMenu from '@/components/layout/UserMenu.vue'
import { findTrail, onlyOpenable, type NavLink, type NavSection } from '@/components/layout/nav'
import {
  BarChart3,
  ChevronRight,
  Clock,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Users,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useBrandingStore } from '@/stores/branding'
import { useSettingsStore } from '@/stores/settings'
import { canOpen } from '@/utils/pageAccess'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const branding = useBrandingStore()
const settings = useSettingsStore()

// Below lg, the sidebar is an off-canvas drawer instead of a permanent
// column — closed by default, opened by the header's hamburger button,
// closed again by the backdrop, the × button, or just picking a page.
const mobileMenuOpen = ref(false)
watch(() => route.fullPath, () => (mobileMenuOpen.value = false))

// A sub-menu link: one page, by its route's name, and the routes that count
// as it (a new user counts as Users).
function page(route: string, text: string, also?: string[]): NavLink {
  return { key: route, label: text, route, ...(also ? { also } : {}) }
}

// Only what this person can open is listed (utils/pageAccess.ts — the same
// rule the split pages use for their parts, see useRouteSection): a sub-menu
// they can't open is left out, and a menu left with none goes too.
const can = (key: string) => auth.hasPermission(key)
const openable = (all: NavSection[]) => onlyOpenable(all, (route) => canOpen(route, can))

// Sections and their menus, as for someone who can open everything.
const sections = computed<NavSection[]>(() => openable([
  {
    key: 'main',
    items: [{ key: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, route: 'dashboard' }],
  },
  {
    key: 'operations',
    caption: t('nav.groupOperations'),
    items: [
      // A company without shifts (the super admin's choice) has no Shifts page.
      ...(settings.usesShifts ? [{ key: 'shifts', label: t('nav.shifts'), icon: Clock, route: 'shifts' }] : []),
      {
        key: 'inventory',
        label: t('nav.inventory'),
        icon: Package,
        children: [
          page('inventory-products', t('inventory.tabProducts')),
          page('inventory-categories', t('inventory.tabCategories')),
          page('inventory-moves', t('inventory.tabMoves')),
          page('inventory-po', t('inventory.tabPo'), ['po-new', 'po-edit']),
          page('inventory-sales', t('inventory.tabSales')),
          page('inventory-suppliers', t('inventory.tabSuppliers')),
          page('customers', t('nav.customers')),
        ],
      },
      // Back-office sales paid over time.
      { key: 'invoices', label: t('nav.invoices'), icon: FileText, route: 'invoices', also: ['invoice-new', 'invoice-edit'] },
    ],
  },
  {
    key: 'finance',
    caption: t('nav.groupFinance'),
    items: [
      {
        key: 'reports',
        label: t('nav.reports'),
        icon: BarChart3,
        children: [
          { key: 'reports-staff', label: t('nav.reportsStaff'), route: 'reports-staff' },
          { key: 'report-details', label: t('nav.reportDetails'), route: 'report-details' },
          { key: 'profit-loss', label: t('nav.profitLoss'), route: 'profit-loss' },
        ],
      },
      { key: 'expenses', label: t('nav.expenses'), icon: Receipt, route: 'expenses' },
    ],
  },
  {
    key: 'manage',
    caption: t('nav.groupManage'),
    items: [
      {
        key: 'users-roles',
        label: t('nav.usersRoles'),
        icon: Users,
        children: [page('users', t('users.tabUsers'), ['user-new', 'user-edit']), page('roles', t('users.tabRoles'))],
      },
      {
        key: 'settings',
        label: t('nav.settings'),
        icon: Settings,
        children: [
          page('settings-rate', t('settings.tabRate')),
          page('settings-branches', t('settings.tabBranches')),
          page('settings-tables', t('tables.tab')),
          page('settings-payments', t('settings.tabPayments')),
          page('settings-tax', t('tax.tab')),
          page('settings-company', t('settings.tabCompany')),
          page('settings-receipt', t('settings.tabReceipt')),
          page('settings-alerts', t('alerts.tab')),
          page('settings-system', t('settings.tabSystem')),
        ],
      },
    ],
  },
]))

// The top bar's "Menu › Page" for the page being shown.
const trail = computed(() => findTrail(route, sections.value))
const roleName = computed(() => label('role', auth.user?.role_name))

async function handleSignOut() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Backdrop: mobile/tablet only, only while the drawer is open -->
    <div v-if="mobileMenuOpen" class="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] lg:hidden" @click="mobileMenuOpen = false" />

    <AppSidebar
      :sections="sections"
      :open="mobileMenuOpen"
      :user-name="auth.user?.full_name"
      :user-role="roleName"
      @close="mobileMenuOpen = false"
      @sign-out="handleSignOut"
    >
      <template #brand>
        <RouterLink :to="{ name: 'dashboard' }" class="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
          <BrandLogo v-if="branding.logoUrl" tile class="h-10 max-w-[5.5rem]" />
          <span v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-primary-light to-primary text-primary-ink shadow-[0_6px_14px_rgb(37_147_210/0.35)]">
            <Store :stroke-width="2.2" class="h-[21px] w-[21px]" />
          </span>
          <span class="flex min-w-0 flex-col gap-1">
            <strong class="break-words font-heading text-[15px] font-semibold leading-tight">{{ branding.name }}</strong>
            <small class="text-[11px] leading-none text-white/50">{{ t('nav.tagline') }}</small>
          </span>
        </RouterLink>
      </template>
    </AppSidebar>

    <div class="flex min-h-screen min-w-0 flex-1 flex-col">
      <header class="topbar sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-2.5 lg:hidden">
          <button type="button" class="-ml-1.5 shrink-0 rounded-lg p-1.5 text-white hover:bg-white/10" :aria-label="$t('common.openMenu')" @click="mobileMenuOpen = true">
            <Menu :stroke-width="1.8" class="h-5 w-5" />
          </button>
          <BrandLogo tile class="h-8 max-w-[4.5rem]" />
          <p class="truncate font-heading text-base">{{ branding.name }}</p>
        </div>

        <nav v-if="trail" class="hidden min-w-0 items-center gap-1.5 text-sm lg:flex" :aria-label="t('nav.breadcrumb')">
          <template v-if="trail.link">
            <span class="shrink-0 text-white/60">{{ trail.item.label }}</span>
            <ChevronRight :stroke-width="2" class="h-3.5 w-3.5 shrink-0 text-white/40" />
            <span class="truncate font-semibold text-white" aria-current="page">{{ trail.link.label }}</span>
          </template>
          <span v-else class="truncate font-semibold text-white" aria-current="page">{{ trail.item.label }}</span>
        </nav>

        <div class="flex-1" />

        <div class="flex shrink-0 items-center gap-2 sm:gap-3">
          <BranchMenu />
          <RouterLink :to="{ name: 'pos' }" class="btn-primary flex shrink-0 items-center gap-2 px-3 text-sm sm:px-4" :aria-label="t('nav.pos')">
            <ShoppingCart :stroke-width="1.8" class="h-4 w-4" />
            <span class="hidden sm:inline">{{ t('nav.pos') }}</span>
          </RouterLink>
          <UserMenu :name="auth.user?.full_name" :role="roleName" @sign-out="handleSignOut" />
        </div>
      </header>

      <main class="flex-1 overflow-y-auto bg-page">
        <RouterView />
      </main>
      <AppFooter />
    </div>
  </div>
</template>
