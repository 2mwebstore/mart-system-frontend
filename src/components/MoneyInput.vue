<script setup lang="ts">
// A cash amount box that reads like money: "$ 1,250.00" or "៛ 50,000", with
// the thousands marks put in as you type and the caret kept where it was.
// v-model is the plain number the page already works with: dollars (up to
// cents) for USD, whole riel for KHR; an empty box is 0. Tablets get the
// number keypad. Attributes (class, id, autofocus) go to the input itself.
import { computed, ref, watch } from 'vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue: number | null | undefined; currency: 'USD' | 'KHR' }>()
const emit = defineEmits<{ 'update:modelValue': [number] }>()

const decimals = computed(() => (props.currency === 'USD' ? 2 : 0))
const symbol = computed(() => (props.currency === 'USD' ? '$' : '៛'))
const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

// The number in a box's text: "1,250.5" is 1250.5, "" is 0. The text is
// always tidied (below), so it holds no sign and no more places than allowed.
function parse(text: string) {
  const n = Number(text.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
// A number as the box shows it when not being typed in: "1,250.50", "50,000";
// nothing for 0, so typing doesn't start with a 0 to delete.
function display(n: number | null | undefined) {
  if (!n || n <= 0) return ''
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals.value, maximumFractionDigits: decimals.value }).format(n)
}

const text = ref(display(props.modelValue))
// Set from outside (Exact, +$5, a reset): show it, unless it's what's typed.
watch(
  () => props.modelValue,
  (n) => {
    if (parse(text.value) !== (n || 0)) text.value = display(n)
  },
)

// What may be typed: digits, and one point with up to two places for USD.
function isKept(c: string) {
  return (c >= '0' && c <= '9') || (decimals.value > 0 && c === '.')
}
// Typed text, cleaned up and grouped: "1250.567" is "1,250.56".
function tidy(typed: string) {
  let clean = [...typed].filter(isKept).join('')
  const point = clean.indexOf('.')
  let frac: string | undefined
  if (point !== -1) {
    frac = clean.slice(point + 1).replace(/\./g, '').slice(0, decimals.value)
    clean = clean.slice(0, point)
  }
  // Grouping also drops leading zeros: "007" is "7".
  const wholeText = clean ? grouped.format(Number(clean)) : frac !== undefined ? '0' : ''
  return frac !== undefined ? `${wholeText}.${frac}` : wholeText
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const caret = el.selectionStart ?? el.value.length
  // How many digits (and points) were left of the caret, to put it back after them.
  const before = [...el.value.slice(0, caret)].filter(isKept).length
  const out = tidy(el.value)
  el.value = out
  text.value = out
  let pos = 0
  for (let seen = 0; pos < out.length && seen < before; pos++) if (isKept(out[pos])) seen++
  el.setSelectionRange(pos, pos)
  emit('update:modelValue', parse(out))
}
// Ready to type over: the whole amount is selected.
function onFocus(e: FocusEvent) {
  ;(e.target as HTMLInputElement).select()
}
// Finished: shown in full, "20" as "20.00".
function onBlur() {
  text.value = display(parse(text.value))
}
</script>

<template>
  <div class="relative">
    <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted" aria-hidden="true">{{ symbol }}</span>
    <input
      v-bind="$attrs"
      :value="text"
      type="text"
      :inputmode="decimals ? 'decimal' : 'numeric'"
      autocomplete="off"
      class="input pl-7 font-mono"
      :placeholder="decimals ? '0.00' : '0'"
      data-money-input
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />
  </div>
</template>
