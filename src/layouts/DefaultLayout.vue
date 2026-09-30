<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { label } from '@/i18n'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import {
  LayoutDashboard,
  ShoppingCart,
  Clock,
  Package,
  BarChart3,
  FileSearch,
  TrendingUp,
  Users,
  Contact,
  Receipt,
  Settings,
  Menu,
  X,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

// Below lg, the sidebar is an off-canvas drawer instead of a permanent
// column — closed by default, opened by the header's hamburger button,
// closed again by the backdrop, the × button, or just picking a page.
const mobileMenuOpen = ref(false)
watch(() => route.fullPath, () => (mobileMenuOpen.value = false))

const navItems = computed(() => [
  { name: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, to: { name: 'dashboard' } },
  { name: 'shifts', label: t('nav.shifts'), icon: Clock, to: { name: 'shifts' } },
  { name: 'inventory', label: t('nav.inventory'), icon: Package, to: { name: 'inventory' } },
  { name: 'reports-staff', label: t('nav.reportsStaff'), icon: BarChart3, to: { name: 'reports-staff' } },
  { name: 'report-details', label: t('nav.reportDetails'), icon: FileSearch, to: { name: 'report-details' } },
  { name: 'profit-loss', label: t('nav.profitLoss'), icon: TrendingUp, to: { name: 'profit-loss' } },
  { name: 'users-roles', label: t('nav.usersRoles'), icon: Users, to: { name: 'users-roles' } },
])

// Not part of the primary nav order in build spec §4 (exactly 8 items) —
// reached from here instead, per §8 item 8.
const secondaryItems = computed(() => [
  { name: 'customers', label: t('nav.customers'), icon: Contact, to: { name: 'customers' } },
  { name: 'expenses', label: t('nav.expenses'), icon: Receipt, to: { name: 'expenses' } },
  { name: 'settings', label: t('nav.settings'), icon: Settings, to: { name: 'settings' } },
])

async function handleSignOut() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Backdrop: mobile/tablet only, only while the drawer is open -->
    <div v-if="mobileMenuOpen" class="fixed inset-0 z-40 bg-ink/40 lg:hidden" @click="mobileMenuOpen = false" />

    <aside
      class="fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-sidebar text-white flex flex-col transform transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-60 lg:translate-x-0"
      :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="px-5 py-6 flex items-center justify-between">
        <p class="font-heading text-lg leading-tight">{{ t('app.name') }}</p>
        <button type="button" class="p-1 text-white/70 hover:text-white lg:hidden" :aria-label="$t('common.close')" @click="mobileMenuOpen = false">
          <X :stroke-width="1.8" class="w-5 h-5" />
        </button>
      </div>

      <nav class="flex-1 px-3 space-y-1 overflow-y-auto">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          class="flex items-center gap-3 rounded-control px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition"
          active-class="bg-primary/20 text-primary"
        >
          <component :is="item.icon" :stroke-width="1.8" class="w-4 h-4" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <nav class="px-3 pb-3 space-y-1 border-t border-white/10 pt-3">
        <RouterLink
          v-for="item in secondaryItems"
          :key="item.name"
          :to="item.to"
          class="flex items-center gap-3 rounded-control px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white transition"
          active-class="bg-primary/20 text-primary"
        >
          <component :is="item.icon" :stroke-width="1.8" class="w-3.5 h-3.5" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="px-5 py-4 border-t border-white/10">
        <p class="text-sm font-medium truncate">{{ auth.user?.full_name }}</p>
        <p class="text-xs text-white/60 truncate">{{ label('role', auth.user?.role_name) }}</p>
        <button type="button" class="mt-3 text-xs text-primary hover:underline" @click="handleSignOut">
          {{ t('common.signOut') }}
        </button>
      </div>
    </aside>

    <div class="flex-1 flex flex-col min-h-screen min-w-0">
      <header class="h-16 shrink-0 flex items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6">
        <div class="flex items-center gap-3 min-w-0 lg:hidden">
          <button type="button" class="p-1.5 -ml-1.5 text-ink shrink-0" :aria-label="$t('common.openMenu')" @click="mobileMenuOpen = true">
            <Menu :stroke-width="1.8" class="w-5 h-5" />
          </button>
          <p class="font-heading text-base truncate">{{ t('app.name') }}</p>
        </div>
        <div class="hidden lg:block" />
        <div class="flex items-center gap-2 sm:gap-4 shrink-0">
          <LanguageSwitch />
          <RouterLink :to="{ name: 'pos' }" class="btn-primary flex items-center gap-2 text-sm px-3 sm:px-4">
            <ShoppingCart :stroke-width="1.8" class="w-4 h-4" />
            <span class="hidden sm:inline">{{ t('nav.pos') }}</span>
          </RouterLink>
        </div>
      </header>

      <main class="flex-1 bg-page overflow-y-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>
