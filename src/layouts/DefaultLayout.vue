<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
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
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

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
    <aside class="w-60 shrink-0 bg-sidebar text-white flex flex-col">
      <div class="px-5 py-6">
        <p class="font-heading text-lg leading-tight">{{ t('app.name') }}</p>
      </div>

      <nav class="flex-1 px-3 space-y-1">
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

    <div class="flex-1 flex flex-col min-h-screen">
      <header class="h-16 shrink-0 flex items-center justify-end gap-4 border-b border-line bg-surface px-6">
        <LanguageSwitch />
        <RouterLink :to="{ name: 'pos' }" class="btn-primary flex items-center gap-2 text-sm">
          <ShoppingCart :stroke-width="1.8" class="w-4 h-4" />
          {{ t('nav.pos') }}
        </RouterLink>
      </header>

      <main class="flex-1 bg-page overflow-y-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>
