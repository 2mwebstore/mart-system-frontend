<script setup lang="ts">
// A banknote for the payment popup's Quick cash panel. Dollar notes are
// photos of the note's front (public domain, from Wikimedia Commons; see
// src/assets/notes/SOURCES.md). Riel notes are drawn in each note's colour:
// Commons has no complete set of riel note photos.
import { computed } from 'vue'
import usd1 from '@/assets/notes/usd-1.jpg'
import usd5 from '@/assets/notes/usd-5.jpg'
import usd10 from '@/assets/notes/usd-10.jpg'
import usd20 from '@/assets/notes/usd-20.jpg'
import usd50 from '@/assets/notes/usd-50.jpg'
import usd100 from '@/assets/notes/usd-100.jpg'

const props = defineProps<{ currency: 'USD' | 'KHR'; amount: number }>()

const USD_PHOTOS: Record<number, string> = { 1: usd1, 5: usd5, 10: usd10, 20: usd20, 50: usd50, 100: usd100 }
// Paper and ink for each drawn riel note.
const KHR_TINTS: Record<number, { paper: string; ink: string }> = {
  1000: { paper: '#E3EFE9', ink: '#2F6B55' },
  5000: { paper: '#EFE6EF', ink: '#6B3F6B' },
  10000: { paper: '#E4ECF5', ink: '#2D4F7C' },
  20000: { paper: '#F5E6E8', ink: '#8A3344' },
  50000: { paper: '#F4ECE0', ink: '#7A5426' },
  100000: { paper: '#EAEEDF', ink: '#4F5B2A' },
}
const FALLBACK_TINT = { paper: '#EEEEEA', ink: '#3F4A44' }

const photo = computed(() => (props.currency === 'USD' ? USD_PHOTOS[props.amount] : undefined))
const tint = computed(() => KHR_TINTS[props.amount] ?? FALLBACK_TINT)
const grouped = computed(() => new Intl.NumberFormat('en-US').format(props.amount))
const face = computed(() => (props.currency === 'USD' ? `$${grouped.value}` : `៛${grouped.value}`))
</script>

<template>
  <!-- The note's own proportions (about 47 by 20), so photos and drawn notes line up. -->
  <img v-if="photo" :src="photo" alt="" class="block w-full aspect-[47/20] object-cover" draggable="false" data-note-photo />
  <div v-else class="relative w-full aspect-[47/20] overflow-hidden" :style="{ backgroundColor: tint.paper, color: tint.ink }" data-note-drawn>
    <div class="absolute inset-1 rounded-sm border border-dashed opacity-60" :style="{ borderColor: tint.ink }" />
    <!-- The corner values: left out where six notes share a row (tablets), as there's no room. -->
    <span class="absolute left-2 top-1 text-[10px] font-bold leading-tight sm:max-lg:hidden">{{ grouped }}</span>
    <span class="absolute right-2 bottom-1 text-[10px] font-bold leading-tight sm:max-lg:hidden">{{ grouped }}</span>
    <span class="absolute inset-0 flex items-center justify-center">
      <span class="rounded-full border px-2 py-0.5 text-xs font-bold bg-white/40" :style="{ borderColor: tint.ink }">{{ face }}</span>
    </span>
  </div>
</template>
