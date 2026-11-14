<script setup lang="ts">
// A banknote for the payment popup's Quick cash panel: a photo of the note's
// front (see src/assets/notes/SOURCES.md). An amount with no photo is drawn
// instead, with its value in the middle.
import { computed } from 'vue'
import usd1 from '@/assets/notes/usd-1.jpg'
import usd5 from '@/assets/notes/usd-5.jpg'
import usd10 from '@/assets/notes/usd-10.jpg'
import usd20 from '@/assets/notes/usd-20.jpg'
import usd50 from '@/assets/notes/usd-50.jpg'
import usd100 from '@/assets/notes/usd-100.jpg'
import khr1000 from '@/assets/notes/khr-1000.jpg'
import khr5000 from '@/assets/notes/khr-5000.jpg'
import khr10000 from '@/assets/notes/khr-10000.jpg'
import khr20000 from '@/assets/notes/khr-20000.jpg'
import khr50000 from '@/assets/notes/khr-50000.jpg'
import khr100000 from '@/assets/notes/khr-100000.jpg'

const props = defineProps<{ currency: 'USD' | 'KHR'; amount: number }>()

const PHOTOS: Record<'USD' | 'KHR', Record<number, string>> = {
  USD: { 1: usd1, 5: usd5, 10: usd10, 20: usd20, 50: usd50, 100: usd100 },
  KHR: { 1000: khr1000, 5000: khr5000, 10000: khr10000, 20000: khr20000, 50000: khr50000, 100000: khr100000 },
}
// Paper and ink for a drawn note.
const TINT = { paper: '#EEEEEA', ink: '#3F4A44' }

const photo = computed(() => PHOTOS[props.currency][props.amount])
const grouped = computed(() => new Intl.NumberFormat('en-US').format(props.amount))
const face = computed(() => (props.currency === 'USD' ? `$${grouped.value}` : `៛${grouped.value}`))
// The notes' own proportions: dollars about 47 by 20, riel a little taller
// (about 11 by 5). One currency's notes show at a time, so they line up.
const shape = computed(() => (props.currency === 'USD' ? 'aspect-[47/20]' : 'aspect-[11/5]'))
</script>

<template>
  <img v-if="photo" :src="photo" alt="" class="block w-full object-cover" :class="shape" draggable="false" data-note-photo />
  <div v-else class="relative w-full overflow-hidden" :class="shape" :style="{ backgroundColor: TINT.paper, color: TINT.ink }" data-note-drawn>
    <div class="absolute inset-1 rounded-sm border border-dashed opacity-60" :style="{ borderColor: TINT.ink }" />
    <!-- The corner values: left out where six notes share a row (tablets), as there's no room. -->
    <span class="absolute left-2 top-1 text-[10px] font-bold leading-tight sm:max-lg:hidden">{{ grouped }}</span>
    <span class="absolute right-2 bottom-1 text-[10px] font-bold leading-tight sm:max-lg:hidden">{{ grouped }}</span>
    <span class="absolute inset-0 flex items-center justify-center">
      <span class="rounded-full border px-2 py-0.5 text-xs font-bold bg-white/40" :style="{ borderColor: TINT.ink }">{{ face }}</span>
    </span>
  </div>
</template>
