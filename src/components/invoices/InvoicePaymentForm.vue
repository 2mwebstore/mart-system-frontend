<script setup lang="ts">
// One payment against an invoice: date, method (from Settings), amount (up to
// what's owed), reference, note and an optional proof of payment — a link, or
// a photo that can be chosen, dropped or pasted (shrunk in the browser first).
//
// Standalone (inside an invoice, or from the list's Payment button) it has its
// own Record button and emits `submit`. `embedded` (the New invoice page's
// "Payment received" section) has no button: it emits `change` with the
// payment so far (null while the amount is 0) and any problem with it.
import { computed, ref, watch } from 'vue'
import { ImageUp, Link2, X } from 'lucide-vue-next'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { seededLabel, t } from '@/i18n'
import { formatUSD } from '@/utils/format'
import { shrinkImage } from '@/utils/image'
import { useToast } from '@/composables/useToast'
import type { InvoicePaymentInput, PaymentMethodRow } from '@/types/domain'

const props = defineProps<{
  balanceCents: number // the most this payment can be
  paymentMethods: PaymentMethodRow[]
  resetKey?: number // when it changes (a payment saved / removed) the form starts over
  busy?: boolean
  embedded?: boolean
}>()
const emit = defineEmits<{ submit: [InvoicePaymentInput]; change: [{ payment: InvoicePaymentInput | null; problem: string }] }>()
const toast = useToast()
const today = new Date().toISOString().slice(0, 10)
const uid = Math.random().toString(36).slice(2, 8) // unique ids when two forms are on a page

const methods = computed(() => props.paymentMethods.filter((m) => m.enabled))
const methodOptions = computed(() => methods.value.map((m) => ({ value: m.id, label: seededLabel('method', m.type, m.name) })))
const defaultMethod = () => ((methods.value.find((m) => m.type === 'CASH') ?? methods.value[0])?.id ?? null) as number | null
function blankForm() {
  return {
    paidOn: today,
    methodId: defaultMethod(),
    // Embedded starts at 0 (no payment unless one is entered); standalone at the full balance.
    amountDollars: props.embedded ? 0 : props.balanceCents / 100,
    reference: '',
    note: '',
    proofMode: 'link' as 'link' | 'image',
    proofLink: '',
    proofImage: '',
  }
}
const form = ref(blankForm())
watch(
  () => props.resetKey,
  () => (form.value = blankForm()),
)
watch(methods, () => {
  if (form.value.methodId === null) form.value.methodId = defaultMethod()
})

// ---- Proof image: choose, drop or paste -----------------------------------------
const shrinking = ref(false)
const dragging = ref(false)
async function useFile(file: File | null | undefined) {
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.error(t('invoices.notAnImage'))
    return
  }
  shrinking.value = true
  try {
    form.value.proofImage = await shrinkImage(file)
  } catch {
    toast.error(t('invoices.notAnImage'))
  } finally {
    shrinking.value = false
  }
}
function pickImage(e: Event) {
  const input = e.target as HTMLInputElement
  void useFile(input.files?.[0]).finally(() => (input.value = ''))
}
function onDrop(e: DragEvent) {
  dragging.value = false
  void useFile(e.dataTransfer?.files?.[0])
}
function onPaste(e: ClipboardEvent) {
  const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
  if (file) {
    e.preventDefault()
    void useFile(file)
  }
}

// ---- Checks + output ------------------------------------------------------------------
const amountCents = computed(() => Math.round((Number(form.value.amountDollars) || 0) * 100))
const problem = computed(() => {
  if (props.embedded && amountCents.value === 0) return ''
  if (form.value.methodId === null) return t('invoices.pickMethod')
  if (amountCents.value <= 0) return t('invoices.amountPositive')
  if (amountCents.value > props.balanceCents) return t('invoices.overBalance', { balance: formatUSD(props.balanceCents) })
  if (form.value.proofMode === 'link' && form.value.proofLink && !/^https?:\/\//.test(form.value.proofLink.trim())) return t('invoices.linkInvalid')
  return ''
})
const payment = computed<InvoicePaymentInput | null>(() => {
  const m = methods.value.find((x) => x.id === form.value.methodId)
  if (!m || amountCents.value <= 0) return null
  return {
    paidOn: form.value.paidOn,
    methodName: m.name,
    methodType: m.type,
    amountCents: amountCents.value,
    reference: form.value.reference.trim(),
    note: form.value.note.trim(),
    attachment: form.value.proofMode === 'image' ? form.value.proofImage : form.value.proofLink.trim(),
  }
})
watch(
  [payment, problem, shrinking],
  () => {
    if (props.embedded) emit('change', { payment: problem.value ? null : payment.value, problem: shrinking.value ? t('invoices.preparing') : problem.value })
  },
  { immediate: true, deep: true },
)
function submitPayment() {
  if (problem.value || !payment.value || props.embedded) return
  emit('submit', payment.value)
}
</script>

<template>
  <component :is="embedded ? 'div' : 'form'" class="rounded-card border border-dashed border-line p-4 space-y-3" @submit.prevent="submitPayment">
    <p v-if="!embedded" class="font-medium text-sm">{{ $t('invoices.recordPayment') }}</p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label class="block text-xs text-muted mb-1" :for="`pay-date-${uid}`">{{ $t('col.date') }}</label>
        <input :id="`pay-date-${uid}`" v-model="form.paidOn" type="date" class="input" required />
      </div>
      <SearchableSelect
        :model-value="form.methodId"
        :label="$t('pos.paymentMethod')"
        :options="methodOptions"
        :searchable="false"
        :clearable="false"
        @update:model-value="(v) => (form.methodId = v === null ? null : Number(v))"
      />
      <div>
        <label class="block text-xs text-muted mb-1" :for="`pay-amount-${uid}`">{{ $t('invoices.amount') }}</label>
        <input :id="`pay-amount-${uid}`" v-model.number="form.amountDollars" type="number" min="0" step="0.01" class="input" data-pay-amount />
        <button type="button" class="text-xs text-primary-text hover:underline mt-1" @click="form.amountDollars = balanceCents / 100">
          {{ embedded ? $t('invoices.paidInFull', { amount: formatUSD(balanceCents) }) : $t('invoices.fullBalance', { amount: formatUSD(balanceCents) }) }}
        </button>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <input v-model="form.reference" type="text" maxlength="120" class="input" :placeholder="$t('invoices.referenceHint')" :aria-label="$t('col.reference')" />
      <input v-model="form.note" type="text" maxlength="255" class="input" :placeholder="$t('invoices.paymentNoteHint')" :aria-label="$t('common.note')" />
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted">{{ $t('invoices.proof') }}</span>
        <div class="flex rounded-control border border-line overflow-hidden text-xs" role="group" :aria-label="$t('invoices.proof')">
          <button type="button" class="px-2 py-1 flex items-center gap-1" :class="form.proofMode === 'link' ? 'bg-primary text-primary-ink' : 'text-muted'" :aria-pressed="form.proofMode === 'link'" @click="form.proofMode = 'link'">
            <Link2 class="w-3.5 h-3.5" /> {{ $t('invoices.proofLink') }}
          </button>
          <button type="button" class="px-2 py-1 flex items-center gap-1" :class="form.proofMode === 'image' ? 'bg-primary text-primary-ink' : 'text-muted'" :aria-pressed="form.proofMode === 'image'" @click="form.proofMode = 'image'">
            <ImageUp class="w-3.5 h-3.5" /> {{ $t('invoices.proofImage') }}
          </button>
        </div>
      </div>
      <input v-if="form.proofMode === 'link'" v-model="form.proofLink" type="url" class="input" placeholder="https://…" :aria-label="$t('invoices.proofLink')" />
      <div
        v-else
        tabindex="0"
        class="relative rounded-control border-2 border-dashed p-3 flex items-center gap-3 outline-none focus:border-primary"
        :class="dragging ? 'border-primary bg-primary-tint' : 'border-line'"
        :aria-label="$t('invoices.dropHint')"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
        @paste="onPaste"
      >
        <div v-if="form.proofImage" class="relative w-20 h-20 shrink-0 rounded-control overflow-hidden border border-line">
          <img :src="form.proofImage" alt="" class="w-full h-full object-cover" />
          <button type="button" class="absolute top-0.5 right-0.5 bg-surface/90 rounded-full p-0.5" :aria-label="$t('common.clearSelection')" @click="form.proofImage = ''"><X class="w-3.5 h-3.5" /></button>
        </div>
        <div class="min-w-0 space-y-1">
          <p class="text-sm text-muted">{{ shrinking ? $t('invoices.preparing') : $t('invoices.dropHint') }}</p>
          <label class="relative btn-secondary text-sm cursor-pointer inline-flex">
            <input type="file" accept="image/*" class="sr-only" @change="pickImage" />
            {{ form.proofImage ? $t('invoices.changeImage') : $t('invoices.chooseImage') }}
          </label>
        </div>
      </div>
    </div>

    <p v-if="problem && amountCents > 0" class="text-sm text-danger-strong">{{ problem }}</p>
    <div v-if="!embedded" class="flex justify-end">
      <button type="submit" class="btn-primary" :disabled="busy || shrinking || !!problem">{{ $t('invoices.savePayment', { amount: formatUSD(amountCents) }) }}</button>
    </div>
  </component>
</template>
