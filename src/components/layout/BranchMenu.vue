<script setup lang="ts">
// The top bar's branch: with several, a menu to change it (what someone may do
// follows the branch they're working at, since they can hold a different role
// at each); with one, just its name.
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Building2, Check, ChevronDown, Search } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useClickOutside } from '@/composables/useClickOutside'
import { label, t } from '@/i18n'

const auth = useAuthStore()
const route = useRoute()

const open = ref(false)
const query = ref('')
const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)

const current = computed(() => auth.activeBranch ?? auth.branches[0] ?? null)
const canSwitch = computed(() => auth.branches.length > 1)
// A search box only once the list gets long.
const searchable = computed(() => auth.branches.length > 6)
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return auth.branches
  return auth.branches.filter((b) => `${b.name} ${b.code}`.toLowerCase().includes(q))
})

function close() {
  open.value = false
  query.value = ''
}
async function toggle() {
  if (open.value) return close()
  open.value = true
  if (searchable.value) {
    await nextTick()
    searchInput.value?.focus()
  }
}
function choose(id: number) {
  close()
  if (id !== auth.activeBranchId) auth.setActiveBranch(id)
}

useClickOutside(root, close)
watch(() => route.fullPath, close)
</script>

<template>
  <div v-if="canSwitch" ref="root" class="relative min-w-0" @keydown.esc="close">
    <button
      type="button"
      class="inline-flex h-9 min-w-0 max-w-[9rem] items-center gap-2 rounded-[9px] border border-white/15 bg-white/10 px-2.5 text-xs font-semibold text-white transition hover:bg-white/20 sm:max-w-[14rem]"
      :class="{ 'bg-white/20': open }"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="t('nav.changeBranch', { branch: current?.name ?? '' })"
      @click="toggle"
    >
      <Building2 :stroke-width="1.9" class="h-4 w-4 shrink-0 text-white/70" />
      <span class="truncate">{{ current?.name }}</span>
      <ChevronDown :stroke-width="2" class="h-4 w-4 shrink-0 text-white/70 transition-transform" :class="{ 'rotate-180': open }" />
    </button>

    <div
      v-if="open"
      class="z-40 rounded-xl border border-line bg-surface p-2 text-ink shadow-[0_14px_34px_rgb(9_20_52/0.16)] max-sm:fixed max-sm:inset-x-3 max-sm:top-[4.5rem] sm:absolute sm:right-0 sm:top-[calc(100%+8px)] sm:w-[17rem]"
      role="menu"
      :aria-label="t('nav.branch')"
    >
      <p class="nav-menu-caption mx-2 mb-1.5 mt-1 text-[10px] font-bold uppercase tracking-[.13em] text-muted">{{ t('nav.showDataFor') }}</p>
      <label v-if="searchable" class="mx-1 mb-1.5 flex h-9 items-center gap-2 rounded-lg border border-input-border px-2.5 focus-within:ring-2 focus-within:ring-primary/40">
        <Search :stroke-width="1.9" class="h-4 w-4 shrink-0 text-muted" />
        <input ref="searchInput" v-model="query" type="search" class="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" :placeholder="t('nav.searchBranches')" />
      </label>
      <div class="flex max-h-[min(20rem,55vh)] flex-col gap-0.5 overflow-y-auto">
        <button
          v-for="branch in shown"
          :key="branch.id"
          type="button"
          role="menuitemradio"
          :aria-checked="branch.id === current?.id"
          class="flex min-h-[40px] w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition"
          :class="branch.id === current?.id ? 'bg-primary-tint text-primary-tint-text' : 'text-ink hover:bg-surface-subtle'"
          @click="choose(branch.id)"
        >
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-[13px] font-semibold">{{ branch.name }}</span>
            <span class="truncate text-[11px]" :class="branch.id === current?.id ? 'text-primary-tint-text-2' : 'text-muted'">
              {{ branch.role_name ? label('role', branch.role_name) : branch.code }}
            </span>
          </span>
          <Check v-if="branch.id === current?.id" :stroke-width="2.2" class="h-4 w-4 shrink-0" />
        </button>
        <p v-if="!shown.length" class="px-2.5 py-3 text-sm text-muted">{{ t('common.noResults') }}</p>
      </div>
    </div>
  </div>

  <span
    v-else-if="current"
    class="inline-flex h-9 min-w-0 max-w-[9rem] items-center gap-2 rounded-[9px] border border-white/15 bg-white/10 px-2.5 text-xs font-semibold text-white sm:max-w-[14rem]"
  >
    <Building2 :stroke-width="1.9" class="h-4 w-4 shrink-0 text-white/70" />
    <span class="truncate">{{ current.name }}</span>
  </span>
</template>

<style scoped>
:lang(km) .nav-menu-caption {
  letter-spacing: 0;
  font-size: 11px;
}
</style>
