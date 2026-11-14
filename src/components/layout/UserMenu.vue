<script setup lang="ts">
// The top bar's account menu: who's signed in, the language, and sign out.
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronDown, LogOut } from 'lucide-vue-next'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import { useClickOutside } from '@/composables/useClickOutside'
import { t } from '@/i18n'
import { initialsOf } from '@/utils/format'

defineProps<{ name?: string; role?: string }>()
const emit = defineEmits<{ signOut: [] }>()
const route = useRoute()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
useClickOutside(root, () => (open.value = false))
watch(() => route.fullPath, () => (open.value = false))
</script>

<template>
  <div ref="root" class="relative min-w-0" @keydown.esc="open = false">
    <button
      type="button"
      class="group flex min-w-0 items-center gap-2.5 rounded-[10px] p-0.5 text-left transition hover:bg-white/10 xl:py-1 xl:pl-1 xl:pr-2"
      :class="{ 'bg-white/10': open }"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="t('nav.account')"
      @click="open = !open"
    >
      <span class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-primary-tint bg-primary-tint text-[11px] font-bold text-primary-tint-text transition group-hover:shadow-[0_0_0_3px_theme(colors.primary.tint)]">
        {{ initialsOf(name ?? '') }}
      </span>
      <span class="hidden min-w-0 flex-col gap-0.5 xl:flex">
        <strong class="max-w-[9rem] truncate text-xs font-bold text-white">{{ name }}</strong>
        <small class="max-w-[9rem] truncate text-[10.5px] text-white/60">{{ role }}</small>
      </span>
      <ChevronDown :stroke-width="2" class="hidden h-4 w-4 shrink-0 text-white/60 transition-transform xl:block" :class="{ 'rotate-180': open }" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-[calc(100%+8px)] z-40 w-60 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line bg-surface p-2 text-ink shadow-[0_14px_34px_rgb(9_20_52/0.16)]"
      role="menu"
      :aria-label="t('nav.account')"
    >
      <div class="mx-0.5 mb-1.5 flex flex-col gap-0.5 border-b border-line px-2 pb-2.5 pt-1">
        <strong class="truncate text-[13px] font-bold text-ink">{{ name }}</strong>
        <small class="truncate text-[11px] text-muted">{{ role }}</small>
      </div>
      <div class="flex items-center justify-between gap-3 px-2.5 py-2">
        <span class="text-[12.5px] text-muted">{{ t('nav.language') }}</span>
        <LanguageSwitch />
      </div>
      <button
        type="button"
        role="menuitem"
        class="flex min-h-[38px] w-full items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-ink transition hover:bg-surface-subtle"
        @click="open = false; emit('signOut')"
      >
        <LogOut :stroke-width="1.9" class="h-4 w-4" />
        {{ t('common.signOut') }}
      </button>
    </div>
  </div>
</template>
