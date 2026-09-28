<script setup lang="ts">
// A single horizontal bar split into colored segments by share, with a
// legend that always shows the color chip + label + value directly (so
// identity/value never rest on color alone — see chartColors.ts).
const props = defineProps<{
  segments: { label: string; name?: string; value: number; share: number; color: string; display: string }[]
}>()
</script>

<template>
  <div>
    <div class="flex h-3 rounded-full overflow-hidden gap-0.5 bg-line">
      <div
        v-for="seg in props.segments"
        :key="seg.label"
        class="h-full first:rounded-l-full last:rounded-r-full"
        :style="{ width: seg.share * 100 + '%', backgroundColor: seg.color }"
        :title="`${seg.name ?? seg.label}: ${seg.display}`"
      />
    </div>
    <ul class="mt-3 flex flex-wrap gap-4">
      <li v-for="seg in props.segments" :key="seg.label" class="flex items-center gap-2 text-sm">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: seg.color }" aria-hidden="true" />
        <span class="text-ink">{{ seg.name ?? seg.label }}</span>
        <span class="font-mono text-muted">{{ seg.display }} · {{ Math.round(seg.share * 100) }}%</span>
      </li>
    </ul>
  </div>
</template>
