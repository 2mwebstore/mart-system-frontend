<script setup lang="ts">
// The app's sidebar: captioned sections of entries, where an entry is a page
// or a menu that opens a sub-menu, with the signed-in person at the foot.
// Below lg it's an off-canvas drawer (`open`); at lg and up a sticky column.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronDown, LogOut, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import { initialsOf } from '@/utils/format'
import { isItemActive, isLinkActive, type NavItem, type NavSection } from './nav'

const props = defineProps<{ sections: NavSection[]; open: boolean; userName?: string; userRole?: string }>()
const emit = defineEmits<{ close: []; signOut: [] }>()
const route = useRoute()

// One sub-menu open at a time: the one holding the page being shown opens by
// itself, and stays as the person left it while they move around inside it.
const activeMenu = computed(
  () => props.sections.flatMap((s) => s.items).find((i) => i.children?.length && isItemActive(route, i))?.key ?? null,
)
const openMenu = ref<string | null>(activeMenu.value)
watch(activeMenu, (key) => {
  if (key) openMenu.value = key
})
function toggle(item: NavItem) {
  openMenu.value = openMenu.value === item.key ? null : item.key
}
</script>

<template>
  <aside
    class="app-sidebar fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col bg-sidebar text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[15.5rem] lg:max-w-none lg:shrink-0 lg:translate-x-0"
    :class="open ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="flex min-h-[72px] items-center gap-2 border-b border-white/10 px-4 py-3">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <slot name="brand" />
      </div>
      <button type="button" class="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white lg:hidden" :aria-label="t('common.close')" @click="emit('close')">
        <X :stroke-width="1.8" class="h-5 w-5" />
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto px-2.5 py-3.5" :aria-label="t('nav.mainNav')">
      <template v-for="(section, index) in sections" :key="section.key">
        <div v-if="index > 0" class="mx-2.5 mb-3 mt-3.5 h-px bg-white/10" />
        <p v-if="section.caption" class="nav-caption mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[.13em] text-white/40">
          {{ section.caption }}
        </p>
        <ul class="flex flex-col gap-[3px]">
          <li v-for="item in section.items" :key="item.key">
            <!-- A menu: opens its sub-menu in place. -->
            <template v-if="item.children?.length">
              <button
                type="button"
                class="nav-link w-full"
                :class="{ 'is-current': isItemActive(route, item) }"
                :aria-expanded="openMenu === item.key"
                :aria-controls="`nav-sub-${item.key}`"
                @click="toggle(item)"
              >
                <component :is="item.icon" :stroke-width="1.9" class="nav-icon h-[18px] w-[18px] shrink-0" />
                <span class="min-w-0 flex-1 text-left">{{ item.label }}</span>
                <ChevronDown :stroke-width="2" class="nav-chevron h-4 w-4 shrink-0 opacity-70" :class="{ 'rotate-180': openMenu === item.key }" />
              </button>
              <div :id="`nav-sub-${item.key}`" class="nav-sub" :class="{ 'is-open': openMenu === item.key }" :inert="openMenu !== item.key">
                <div class="min-h-0 overflow-hidden">
                  <ul class="nav-sub-list">
                    <li v-for="child in item.children" :key="child.key">
                      <RouterLink
                        :to="{ name: child.route }"
                        class="nav-sublink"
                        :class="{ 'is-active': isLinkActive(route, child) }"
                        :aria-current="isLinkActive(route, child) ? 'page' : undefined"
                        @click="emit('close')"
                      >
                        {{ child.label }}
                      </RouterLink>
                    </li>
                  </ul>
                </div>
              </div>
            </template>

            <!-- A page of its own. -->
            <RouterLink
              v-else-if="item.route"
              :to="{ name: item.route }"
              class="nav-link"
              :class="{ 'is-active': isItemActive(route, item) }"
              :aria-current="isItemActive(route, item) ? 'page' : undefined"
              @click="emit('close')"
            >
              <component :is="item.icon" :stroke-width="1.9" class="nav-icon h-[18px] w-[18px] shrink-0" />
              <span class="min-w-0 flex-1">{{ item.label }}</span>
            </RouterLink>
          </li>
        </ul>
      </template>
    </nav>

    <div class="flex items-center gap-2.5 border-t border-white/10 px-3.5 py-3">
      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white/70 bg-primary-tint text-[11px] font-bold text-primary-tint-text">
        {{ initialsOf(userName ?? '') }}
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong class="truncate text-xs font-semibold text-white">{{ userName }}</strong>
        <small class="truncate text-[10.5px] text-white/55">{{ userRole }}</small>
      </div>
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/65 transition hover:bg-white/10 hover:text-white"
        :title="t('common.signOut')"
        :aria-label="t('common.signOut')"
        @click="emit('signOut')"
      >
        <LogOut :stroke-width="1.9" class="h-4 w-4" />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar {
  background-image: linear-gradient(180deg, rgb(255 255 255 / 0.07) 0%, rgb(255 255 255 / 0) 50%);
  box-shadow: 5px 0 20px rgb(0 0 0 / 0.08);
}

/* Khmer has no capitals, and letter-spacing pulls its stacked marks apart. */
:lang(km) .nav-caption {
  letter-spacing: 0;
  font-size: 11px;
}

.nav-link {
  @apply flex min-h-[42px] items-center gap-3 rounded-[9px] px-3 py-2 text-[13px] font-medium leading-snug text-white/75 transition-colors;
  @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70;
}
.nav-link:hover {
  @apply bg-white/[0.08] text-white;
}
/* A menu holding the page being shown. */
.nav-link.is-current {
  @apply bg-white/[0.05] text-white;
}
.nav-link.is-current .nav-icon {
  @apply text-primary;
}
/* The page being shown. */
.nav-link.is-active {
  @apply font-semibold text-primary-ink;
  background-image: linear-gradient(100deg, #ff8a4c, theme('colors.primary.DEFAULT'));
  box-shadow: 0 5px 12px rgb(0 0 0 / 0.28);
}

.nav-chevron {
  transition: rotate 0.18s ease;
}

/* The sub-menu folds open by animating its row from 0fr to 1fr. */
.nav-sub {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.22s ease;
}
.nav-sub.is-open {
  grid-template-rows: 1fr;
}
/* The guide line sits under the menu's icon (12px padding + half of 18px). */
.nav-sub-list {
  @apply mb-1.5 ml-[21px] mt-1 flex flex-col gap-0.5 border-l border-white/10 pl-2.5;
}

.nav-sublink {
  @apply relative flex min-h-[36px] items-center rounded-lg px-3 py-1.5 text-[12.5px] leading-snug text-white/60 transition-colors;
  @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70;
}
.nav-sublink:hover {
  @apply bg-white/[0.06] text-white;
}
.nav-sublink.is-active {
  @apply bg-primary/15 font-semibold text-primary;
}
/* Marks the guide line next to the page being shown. */
.nav-sublink.is-active::before {
  content: '';
  position: absolute;
  top: 50%;
  left: calc(-0.625rem - 1px);
  width: 2px;
  height: 18px;
  border-radius: 2px;
  translate: 0 -50%;
  background: theme('colors.primary.DEFAULT');
}

@media (prefers-reduced-motion: reduce) {
  .nav-sub,
  .nav-chevron {
    transition: none;
  }
}
</style>
