<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Building2, HardDrive, Menu, ShieldCheck } from 'lucide-vue-next'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import UserMenu from '@/components/layout/UserMenu.vue'
import { findTrail, type NavSection } from '@/components/layout/nav'
import { useAuthStore } from '@/stores/auth'
import { label } from '@/i18n'

// The super admin's frame: no branch picker and no company branding, since
// they work in no company. Same sidebar and drawer as DefaultLayout.
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const mobileMenuOpen = ref(false)
watch(() => route.fullPath, () => (mobileMenuOpen.value = false))

const sections = computed<NavSection[]>(() => [
  {
    key: 'platform',
    items: [
      { key: 'companies', label: t('platform.navCompanies'), icon: Building2, route: 'platform-companies' },
      { key: 'system', label: t('platform.navSystem'), icon: HardDrive, route: 'platform-system' },
    ],
  },
])
const trail = computed(() => findTrail(route, sections.value))
const roleName = computed(() => label('role', auth.user?.role_name))

async function handleSignOut() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="flex min-h-screen">
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
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#ff8a4c] to-primary text-primary-ink shadow-[0_6px_13px_rgb(0_0_0/0.25)]">
          <ShieldCheck :stroke-width="2.2" class="h-[21px] w-[21px]" />
        </span>
        <span class="flex min-w-0 flex-col gap-1">
          <strong class="break-words font-heading text-[15px] font-semibold leading-tight">{{ t('app.brand') }}</strong>
          <small class="text-[11px] leading-none text-white/50">{{ t('platform.title') }}</small>
        </span>
      </template>
    </AppSidebar>

    <div class="flex min-h-screen min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:gap-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-2.5 lg:hidden">
          <button type="button" class="-ml-1.5 shrink-0 rounded-lg p-1.5 text-ink hover:bg-surface-subtle" :aria-label="$t('common.openMenu')" @click="mobileMenuOpen = true">
            <Menu :stroke-width="1.8" class="h-5 w-5" />
          </button>
          <p class="truncate font-heading text-base">{{ t('platform.title') }}</p>
        </div>
        <nav v-if="trail" class="hidden min-w-0 items-center text-sm lg:flex" :aria-label="t('nav.breadcrumb')">
          <span class="truncate font-semibold text-ink" aria-current="page">{{ trail.item.label }}</span>
        </nav>
        <div class="flex-1" />
        <div class="flex shrink-0 items-center gap-2 sm:gap-3">
          <UserMenu :name="auth.user?.full_name" :role="roleName" @sign-out="handleSignOut" />
        </div>
      </header>

      <main class="flex-1 overflow-y-auto bg-page">
        <RouterView />
      </main>
    </div>
  </div>
</template>
