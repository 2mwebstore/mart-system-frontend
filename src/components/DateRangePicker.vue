<script setup lang="ts">
// Date range picker per build spec §8.3: trigger button with a day-count
// pill, a popover with presets on the left and two side-by-side months
// (Monday first), click-click range selection (auto-swap if the second
// click lands before the first), and a footer with Cancel/Apply. Applying
// re-emits the range so the host page can re-fetch and sync it into the
// URL query.
//
// The popover is teleported to <body> and positioned from the trigger's
// bounding rect (same technique as SearchableSelect) — a plain
// `absolute` popover was clipped/cut off by the viewport on anything
// narrower than ~1500px whenever the trigger sat right-of-center on the
// page (e.g. Profit & Loss, where it shares a header row with two more
// buttons). On narrow viewports it also collapses from two months to one
// so it never needs more width than the viewport has.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import { i18n, t } from '@/i18n'

// modelValue may be null for an optional filter ("All dates"); with `clearable`
// the trigger then shows a × that emits `clear`. Picking a range always emits
// update:modelValue.
const props = defineProps<{ modelValue: { from: string; to: string } | null; clearable?: boolean; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [{ from: string; to: string }]; clear: [] }>()

const today = dayjs()
// What the calendar opens on when there is no value yet: the last 14 days.
const current = computed(() => props.modelValue ?? { from: today.subtract(13, 'day').format('YYYY-MM-DD'), to: today.format('YYYY-MM-DD') })

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const isNarrow = computed(() => viewportWidth.value < 680)

const pendingFrom = ref<Dayjs>(dayjs(current.value.from))
const pendingTo = ref<Dayjs | null>(dayjs(current.value.to))
const selecting = ref(false) // true once pendingFrom is set but pendingTo isn't yet

const leftMonth = ref(dayjs(current.value.from).startOf('month'))
const rightMonth = computed(() => leftMonth.value.add(1, 'month'))
const visibleMonths = computed(() => (isNarrow.value ? [leftMonth.value] : [leftMonth.value, rightMonth.value]))

// Dates are formatted with the app's current language (dayjs instances keep
// the locale they were created with, so it is applied explicitly).
const loc = computed(() => i18n.global.locale.value)
const fmt = (d: Dayjs, pattern: string) => d.locale(loc.value).format(pattern)

const presets = computed(() => [
  { label: t('dateRange.presets.today'), from: today, to: today },
  { label: t('dateRange.presets.yesterday'), from: today.subtract(1, 'day'), to: today.subtract(1, 'day') },
  { label: t('dateRange.presets.last7'), from: today.subtract(6, 'day'), to: today },
  { label: t('dateRange.presets.last14'), from: today.subtract(13, 'day'), to: today },
  { label: t('dateRange.presets.last30'), from: today.subtract(29, 'day'), to: today },
  { label: t('dateRange.presets.thisMonth'), from: today.startOf('month'), to: today },
  { label: t('dateRange.presets.lastMonth'), from: today.subtract(1, 'month').startOf('month'), to: today.subtract(1, 'month').endOf('month') },
  { label: t('dateRange.presets.thisYear'), from: today.startOf('year'), to: today },
])

function monthDays(month: Dayjs) {
  const startOfMonth = month.startOf('month')
  const startWeekday = (startOfMonth.day() + 6) % 7 // Monday = 0
  const gridStart = startOfMonth.subtract(startWeekday, 'day')
  return Array.from({ length: 42 }, (_, i) => gridStart.add(i, 'day'))
}

function dayClasses(day: Dayjs, month: Dayjs) {
  const inMonth = day.month() === month.month()
  const isFuture = day.isAfter(today, 'day')
  const isToday = day.isSame(today, 'day')
  const isStart = day.isSame(pendingFrom.value, 'day')
  const isEnd = pendingTo.value ? day.isSame(pendingTo.value, 'day') : false
  const inRange = pendingTo.value ? day.isAfter(pendingFrom.value, 'day') && day.isBefore(pendingTo.value, 'day') : false

  return {
    'text-line': !inMonth,
    'text-ink': inMonth && !isFuture,
    'opacity-40 cursor-not-allowed': isFuture,
    'ring-1 ring-primary/60': isToday && !isStart && !isEnd,
    'bg-primary text-primary-ink font-medium': isStart || isEnd,
    'bg-primary-tint text-primary-tint-text': inRange,
  }
}

function pickDay(day: Dayjs) {
  if (day.isAfter(today, 'day')) return

  if (!selecting.value) {
    pendingFrom.value = day
    pendingTo.value = null
    selecting.value = true
    return
  }

  if (day.isBefore(pendingFrom.value, 'day')) {
    pendingTo.value = pendingFrom.value
    pendingFrom.value = day
  } else {
    pendingTo.value = day
  }
  selecting.value = false
}

function applyPreset(preset: { from: Dayjs; to: Dayjs }) {
  pendingFrom.value = preset.from
  pendingTo.value = preset.to
  selecting.value = false
  leftMonth.value = preset.from.startOf('month')
}

const dayCount = computed(() => (pendingTo.value ? pendingTo.value.diff(pendingFrom.value, 'day') + 1 : 1))

const triggerLabel = computed(() => {
  if (!props.modelValue) return props.placeholder ?? t('dateRange.allDates')
  const from = dayjs(props.modelValue.from)
  const to = dayjs(props.modelValue.to)
  const sameYear = from.year() === to.year()
  return `${fmt(from, 'D MMM')} – ${fmt(to, 'D MMM')}${sameYear ? ' ' + fmt(to, 'YYYY') : ', ' + fmt(from, 'YYYY') + ' – ' + fmt(to, 'YYYY')}`
})
const triggerDays = computed(() => dayjs(current.value.to).diff(dayjs(current.value.from), 'day') + 1)

// --- Positioning: clamp to the viewport instead of letting the popover
// render off-screen (see the file banner). Re-runs on open, resize, scroll.
function calcPosition() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const margin = 16
  const width = isNarrow.value ? Math.min(360, window.innerWidth - margin * 2) : Math.min(772, window.innerWidth - margin * 2)
  const estimatedHeight = popoverRef.value?.offsetHeight ?? (isNarrow.value ? 520 : 420)

  let left = rect.left
  if (left + width > window.innerWidth - margin) {
    left = rect.right - width // right-align to the trigger instead
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow

  popStyle.value = {
    left: `${left}px`,
    width: `${width}px`,
    ...(openUpward
      ? { bottom: `${window.innerHeight - rect.top + 6}px`, top: 'auto' }
      : { top: `${rect.bottom + 6}px`, bottom: 'auto' }),
  }
}

async function toggleOpen() {
  if (!open.value) {
    pendingFrom.value = dayjs(current.value.from)
    pendingTo.value = dayjs(current.value.to)
    selecting.value = false
    leftMonth.value = dayjs(current.value.from).startOf('month')
    open.value = true
    await nextTick()
    calcPosition()
    await nextTick()
    calcPosition() // second pass once the real popover height is known
  } else {
    open.value = false
  }
}

function cancel() {
  open.value = false
}

function apply() {
  if (!pendingTo.value) return
  emit('update:modelValue', { from: pendingFrom.value.format('YYYY-MM-DD'), to: pendingTo.value.format('YYYY-MM-DD') })
  open.value = false
}

function onClickOutside(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (triggerRef.value?.contains(target)) return
  if (popoverRef.value?.contains(target)) return
  open.value = false
}

function onViewportChange() {
  viewportWidth.value = window.innerWidth
  if (open.value) calcPosition()
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})

watch(open, (isOpen) => {
  if (!isOpen) selecting.value = false
})

const weekdayLabels = computed(() => ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => t(`dateRange.wd.${d}`)))
</script>

<template>
  <div ref="triggerRef" class="inline-flex items-center gap-1">
    <button type="button" class="btn-secondary flex items-center gap-2" @click="toggleOpen">
      <Calendar :stroke-width="1.8" class="w-4 h-4 text-muted" />
      <span>{{ triggerLabel }}</span>
      <span v-if="modelValue" class="badge-warning">{{ $t('dateRange.days', { n: triggerDays }) }}</span>
      <ChevronDown :stroke-width="1.8" class="w-4 h-4 text-muted" />
    </button>
    <button v-if="clearable && modelValue" type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('dateRange.clear')" @click="emit('clear')">
      <X :stroke-width="1.8" class="w-4 h-4" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="popoverRef"
        :style="popStyle"
        data-date-range-popover
        class="fixed z-[9000] bg-surface border border-line rounded-card shadow-lg flex flex-col sm:flex-row max-h-[85vh] overflow-y-auto"
      >
        <div class="sm:w-40 shrink-0 border-b sm:border-b-0 sm:border-r border-line p-3 flex sm:block gap-1 sm:space-y-0.5 overflow-x-auto sm:overflow-visible">
          <button
            v-for="preset in presets"
            :key="preset.label"
            type="button"
            class="shrink-0 whitespace-nowrap sm:w-full sm:block sm:whitespace-normal text-left text-sm px-2 py-1.5 rounded-control hover:bg-surface-subtle text-ink"
            @click="applyPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between px-4 pt-3">
            <button type="button" :aria-label="$t('dateRange.prevMonth')" class="p-1 rounded-control hover:bg-surface-subtle" @click="leftMonth = leftMonth.subtract(1, 'month')">
              <ChevronLeft :stroke-width="1.8" class="w-4 h-4" />
            </button>
            <div class="flex-1 grid text-center" :class="isNarrow ? 'grid-cols-1' : 'grid-cols-2'">
              <span class="font-heading text-sm">{{ fmt(leftMonth, 'MMMM YYYY') }}</span>
              <span v-if="!isNarrow" class="font-heading text-sm">{{ fmt(rightMonth, 'MMMM YYYY') }}</span>
            </div>
            <button type="button" :aria-label="$t('dateRange.nextMonth')" class="p-1 rounded-control hover:bg-surface-subtle" @click="leftMonth = leftMonth.add(1, 'month')">
              <ChevronRight :stroke-width="1.8" class="w-4 h-4" />
            </button>
          </div>

          <div class="grid gap-4 px-4 py-3" :class="isNarrow ? 'grid-cols-1' : 'grid-cols-2'">
            <div v-for="month in visibleMonths" :key="month.format('YYYY-MM')">
              <div class="grid grid-cols-7 text-center text-xs text-muted mb-1">
                <span v-for="wd in weekdayLabels" :key="wd">{{ wd }}</span>
              </div>
              <div class="grid grid-cols-7 gap-y-0.5 text-center text-sm">
                <button
                  v-for="day in monthDays(month)"
                  :key="day.format('YYYY-MM-DD')"
                  type="button"
                  class="w-8 h-8 rounded-full mx-auto flex items-center justify-center"
                  :class="dayClasses(day, month)"
                  :disabled="day.isAfter(today, 'day')"
                  @click="pickDay(day)"
                >
                  {{ day.date() }}
                </button>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-t border-line">
            <div class="text-sm text-muted">
              <span class="font-mono text-ink">{{ fmt(pendingFrom, 'D MMM YYYY') }}</span>
              →
              <span class="font-mono text-ink">{{ pendingTo ? fmt(pendingTo, 'D MMM YYYY') : '…' }}</span>
              <span class="ml-2">({{ $t('dateRange.days', { n: dayCount }) }})</span>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-secondary" @click="cancel">{{ $t('common.cancel') }}</button>
              <button type="button" class="btn-primary" :disabled="!pendingTo" @click="apply">{{ $t('common.apply') }}</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
