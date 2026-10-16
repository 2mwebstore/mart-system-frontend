<script setup lang="ts">
// The company logo (Settings > Company), or nothing when none is set or it
// fails to load. Size it with a class (e.g. "h-10"); `tile` puts it on a
// white rounded tile so a dark or transparent logo still shows on the dark
// sidebar.
import { ref, watch } from 'vue'
import { useBrandingStore } from '@/stores/branding'

defineProps<{ tile?: boolean }>()
const branding = useBrandingStore()
const failed = ref(false)
watch(
  () => branding.logoUrl,
  () => (failed.value = false),
)
</script>

<template>
  <span v-if="branding.logoUrl && !failed" class="inline-flex shrink-0 items-center justify-center" :class="tile ? 'bg-white rounded-control p-1' : ''">
    <img :src="branding.logoUrl" :alt="branding.name" class="h-full w-auto max-w-full object-contain" data-brand-logo @error="failed = true" />
  </span>
</template>
