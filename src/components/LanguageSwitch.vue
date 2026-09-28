<script setup lang="ts">
import { i18n, setLocale } from '@/i18n'

// English | ខ្មែរ toggle. `dark` is for the navy sidebar / dark surfaces.
defineProps<{ dark?: boolean }>()
</script>

<template>
  <div class="flex items-center gap-2 text-xs">
    <button
      type="button"
      :class="i18n.global.locale.value === 'en' ? 'text-primary font-medium' : dark ? 'text-white/70 hover:text-white' : 'text-muted hover:text-ink'"
      @click="setLocale('en')"
    >
      English
    </button>
    <span :class="dark ? 'text-white/30' : 'text-line'">·</span>
    <button
      type="button"
      :class="i18n.global.locale.value === 'km' ? 'text-primary font-medium' : dark ? 'text-white/70 hover:text-white' : 'text-muted hover:text-ink'"
      @click="setLocale('km')"
    >
      ខ្មែរ
    </button>
  </div>
</template>
