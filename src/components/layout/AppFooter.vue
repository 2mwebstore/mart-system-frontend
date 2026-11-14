<script setup lang="ts">
// The line at the bottom of every back-office page and the sign-in page: the
// super admin's text for every company (a copyright), from the branding.
// Nothing is shown when it's empty.
import { computed } from 'vue'
import { useBrandingStore } from '@/stores/branding'
import { footerLine } from '@/utils/footer'

// bare: no rule or background, for a page that is already one block (sign-in).
defineProps<{ bare?: boolean }>()
const branding = useBrandingStore()
const text = computed(() => footerLine(branding.footerText))
</script>

<template>
  <footer v-if="text" class="shrink-0 px-4 text-center text-xs text-muted sm:px-6" :class="bare ? 'pt-6' : 'border-t border-line bg-page py-3'" data-app-footer>
    {{ text }}
  </footer>
</template>
