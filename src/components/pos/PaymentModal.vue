<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eraser } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import BankNote from '@/components/pos/BankNote.vue'
import { listPaymentMethods } from '@/api/settings'
import { useSettingsStore } from '@/stores/settings'
import { seededLabel } from '@/i18n'
import { calculateChangeIn, usdCentsToRiel } from '@/utils/money'
import { formatUSD, formatKHR } from '@/utils/format'
import { useMoney } from '@/composables/useMoney'
import type { CreateSaleInput } from '@/types/domain'
import type { PaymentDraft } from '@/composables/useCustomerDisplay'

// totalCents / taxCents are in the company's main currency (cents, or whole
// riel). taxLabel: the tax already in totalCents, shown under the amount due.
const props = defineProps<{ totalCents: number; submitting?: boolean; taxCents?: number; taxLabel?: string }>()
const emit = defineEmits<{
  close: []
  paid: [CreateSaleInput['payment']]
  // The tender and change as they're typed, for the customer display.
  draft: [PaymentDraft]
}>()

const { t } = useI18n()
const settings = useSettingsStore()
const rate = computed(() => settings.rate)
const { money, other, cashDue, isRiel, currency } = useMoney()

// Payment methods are configured in Settings; only the enabled ones the sale
// API can book (Cash / KHQR / Card) are offered. Cash is the default.
type PayType = CreateSaleInput['payment']['method']
const methods = ref<{ id: number; name: string; type: PayType }[]>([{ id: 0, name: 'Cash', type: 'CASH' }])
const methodId = ref(0)
onMounted(async () => {
  try {
    const rows = (await listPaymentMethods()).filter((m) => m.enabled && m.type !== 'OTHER') as { id: number; name: string; type: PayType }[]
    if (rows.length) {
      methods.value = rows
      methodId.value = (rows.find((m) => m.type === 'CASH') ?? rows[0]).id
    }
  } catch {
    // keep the Cash-only fallback; the API client already toasted
  }
})
const methodOptions = computed(() => methods.value.map((m) => ({ value: m.id, label: seededLabel('method', m.type, m.name) })))
const method = computed(() => methods.value.find((m) => m.id === methodId.value)?.type ?? 'CASH')
const cash = computed(() => method.value === 'CASH')

const tenderUSD = ref(0)
const tenderKHR = ref(0)
const note = ref('')

const tenderUSDCents = computed(() => Math.round((tenderUSD.value || 0) * 100))
const tenderKHRRiel = computed(() => Math.round(tenderKHR.value || 0))
// Same maths as the server's change rule; the server recomputes on submit.
// A riel company gives all change in riel; a dollar one whole dollars + riel.
const change = computed(() => calculateChangeIn(currency.value, props.totalCents, tenderUSDCents.value, tenderKHRRiel.value, rate.value))
const shortfallKHRRiel = computed(() => (isRiel.value ? change.value.shortCents : usdCentsToRiel(change.value.shortCents, rate.value)))
const canConfirmCash = computed(() => change.value.shortCents === 0 && props.totalCents >= 0)

watchEffect(() => {
  const isCash = cash.value
  emit('draft', {
    method: method.value,
    receivedUsdCents: isCash ? tenderUSDCents.value : 0,
    receivedKhrRiel: isCash ? tenderKHRRiel.value : 0,
    changeUsdCents: isCash ? change.value.usdCents : 0,
    changeKhrRiel: isCash ? change.value.khrRiel : 0,
    shortCents: isCash ? change.value.shortCents : 0,
    shortRiel: isCash ? shortfallKHRRiel.value : 0,
  })
})

// A company that sells in riel: its box comes first, and the amount due and
// the quick amounts fill it in riel.
const rielFirst = isRiel
const QUICK_USD = [1, 5, 10, 20, 50, 100]
const QUICK_KHR = [1000, 5000, 10000, 20000, 50000, 100000]

// The popup opens with the amount due already tendered. That amount stands
// for "paid exactly" until the cashier says what was handed over: a note
// button or an amount typed in either box replaces it instead of adding to it,
// so riel typed in doesn't sit on top of the dollars filled in.
const filledExact = ref(false)

function setExactCash() {
  if (rielFirst.value) {
    // The cash amount due (rounded to the ៛100 note), which pays the sale.
    tenderKHR.value = cashDue(props.totalCents)
    tenderUSD.value = 0
  } else {
    tenderUSD.value = Number((props.totalCents / 100).toFixed(2))
    tenderKHR.value = 0
  }
  filledExact.value = true
}
setExactCash()

// How many times each note was tapped, shown on its badge ("×2"). It counts
// from the last time the notes' box was set another way: opened, cleared or
// typed in.
const tapped = ref<Record<number, number>>({})
function countTap(amount: number) {
  tapped.value[amount] = (tapped.value[amount] ?? 0) + 1
}

// Clear amount: nothing tendered, so the notes tapped next add up from zero.
function clearTendered() {
  tenderUSD.value = 0
  tenderKHR.value = 0
  filledExact.value = false
  tapped.value = {}
}
function clearExact() {
  if (filledExact.value) clearTendered()
}
function typedUSD(n: number) {
  clearExact()
  tenderUSD.value = n
  if (!rielFirst.value) tapped.value = {}
}
function typedKHR(n: number) {
  clearExact()
  tenderKHR.value = n
  if (rielFirst.value) tapped.value = {}
}
function addQuickUSD(amount: number) {
  clearExact()
  tenderUSD.value = Number(((tenderUSD.value || 0) + amount).toFixed(2))
  countTap(amount)
}
function addQuickKHR(amount: number) {
  clearExact()
  tenderKHR.value = (tenderKHR.value || 0) + amount
  countTap(amount)
}
function noteLabel(amount: number) {
  const shown = rielFirst.value ? formatKHR(amount) : formatUSD(amount * 100)
  const n = tapped.value[amount]
  return n ? t('pos.addCashNoteCount', { amount: shown, n }) : t('pos.addCashNote', { amount: shown })
}

function confirmCash() {
  if (!canConfirmCash.value) return
  emit('paid', { method: 'CASH', receivedUsdCents: tenderUSDCents.value, receivedKhrRiel: tenderKHRRiel.value, reference: '' })
}

function confirmOther() {
  emit('paid', { method: method.value, receivedUsdCents: 0, receivedKhrRiel: 0, reference: note.value.trim() })
}
</script>

<template>
  <Modal :title="$t('pos.takePayment')" xl flush @close="emit('close')">
    <!-- Wide screens: the payment on the left, Quick cash beside it. Narrow:
         one column, Quick cash between the tendered boxes and the change. -->
    <div class="grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
      <div class="px-6 pt-6 lg:px-8 lg:pt-8 space-y-5" :class="cash ? 'lg:col-start-1 lg:row-start-1' : 'lg:col-span-2'">
        <div class="text-center">
          <p class="text-muted text-sm">{{ $t('pos.amountDue') }}</p>
          <!-- In riel, cash is paid to the ៛100 note. -->
          <p class="font-heading font-bold text-4xl mt-1 tabular-nums" data-amount-due>{{ money(cash ? cashDue(totalCents) : totalCents) }}</p>
          <p class="text-muted text-sm tabular-nums" data-amount-other>{{ other(totalCents) }}</p>
          <p v-if="taxCents" class="text-muted text-xs mt-1" data-tax-line>
            {{ $t('tax.line', { name: taxLabel ?? '' }) }} · <span class="tabular-nums">{{ money(taxCents) }}</span>
          </p>
        </div>

        <SearchableSelect v-model="methodId" :label="$t('pos.paymentMethod')" :options="methodOptions" :searchable="false" :clearable="false" />

        <!-- The box's text size is set here, so the amount and its sign grow together. -->
        <div v-if="cash" class="grid grid-cols-2 gap-3">
          <div class="text-lg" data-tender-usd>
            <label class="block text-sm text-muted mb-1">{{ $t('pos.tenderedUsd') }}</label>
            <MoneyInput :model-value="tenderUSD" currency="USD" @update:model-value="typedUSD" />
          </div>
          <div class="text-lg" :class="{ 'order-first': rielFirst }" data-tender-khr>
            <label class="block text-sm text-muted mb-1">{{ $t('pos.tenderedKhr') }}</label>
            <MoneyInput :model-value="tenderKHR" currency="KHR" @update:model-value="typedKHR" />
          </div>
        </div>
      </div>

      <section v-if="cash" class="mt-5 lg:mt-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 bg-surface-subtle border-y lg:border-y-0 lg:border-l border-line p-6" data-quick-cash>
        <h3 class="font-semibold">{{ $t('pos.quickCash') }}</h3>
        <div class="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-2 gap-4 mt-4">
          <button
            v-for="amt in rielFirst ? QUICK_KHR : QUICK_USD"
            :key="amt"
            type="button"
            class="relative rounded-md border bg-surface shadow-sm transition hover:shadow-md hover:-translate-y-px active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            :class="tapped[amt] ? 'border-primary ring-1 ring-primary' : 'border-line'"
            :aria-label="noteLabel(amt)"
            data-quick-amount
            @click="rielFirst ? addQuickKHR(amt) : addQuickUSD(amt)"
          >
            <span class="block overflow-hidden rounded-[inherit]"><BankNote :currency="rielFirst ? 'KHR' : 'USD'" :amount="amt" /></span>
            <!-- How many of this note were tapped: blue, with white text (4.5:1). -->
            <span
              v-if="tapped[amt]"
              :key="tapped[amt]"
              class="note-count absolute -top-2.5 -right-2.5 flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-primary-hover px-1.5 text-sm font-bold leading-none text-white tabular-nums ring-2 ring-surface shadow-md"
              aria-hidden="true"
              data-note-count
            >
              ×{{ tapped[amt] }}
            </span>
          </button>
        </div>
        <button type="button" class="btn-secondary w-full py-3 mt-5 text-sm flex items-center justify-center gap-2" data-clear-tendered @click="clearTendered">
          <Eraser :stroke-width="1.8" class="w-4 h-4" aria-hidden="true" />
          {{ $t('pos.clearAmount') }}
        </button>
      </section>

      <div class="px-6 pb-6 pt-4 lg:px-8 lg:pb-8 space-y-4 self-start" :class="cash ? 'lg:col-start-1 lg:row-start-2' : 'lg:col-span-2'">
        <template v-if="cash">
          <div class="rounded-control border border-line p-3 flex items-center justify-between gap-3" data-change-line>
            <span class="text-sm text-muted">{{ change.shortCents > 0 ? $t('pos.remaining') : $t('pos.changeDue') }}</span>
            <span class="font-mono text-lg text-right" :class="change.shortCents > 0 ? 'text-danger-strong' : 'text-success-text'">
              <template v-if="change.shortCents > 0">
                {{ money(change.shortCents) }} <span class="text-sm">({{ other(change.shortCents) }})</span>
              </template>
              <template v-else-if="rielFirst">{{ formatKHR(change.khrRiel) }}</template>
              <template v-else>
                {{ formatUSD(change.usdCents) }}<span class="text-sm"> + {{ formatKHR(change.khrRiel) }}</span>
              </template>
            </span>
          </div>

          <button type="button" class="btn-primary w-full text-lg py-3" :disabled="!canConfirmCash || submitting" @click="confirmCash">
            {{ $t('pos.confirmCash') }}
          </button>
        </template>

        <template v-else>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('pos.noteOptional') }}</label>
            <input v-model="note" type="text" class="input" :placeholder="method === 'KHQR' ? $t('pos.noteHintKhqr') : $t('pos.noteHintCard')" />
          </div>
          <button type="button" class="btn-primary w-full text-lg py-3" :disabled="submitting" @click="confirmOther">
            {{ method === 'KHQR' ? $t('pos.confirmKhqr') : $t('pos.confirmCard') }}
          </button>
        </template>

        <button type="button" class="text-sm text-muted hover:text-ink block mx-auto" @click="emit('close')">{{ $t('common.cancel') }}</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
/* The count pops in on each tap. */
@media (prefers-reduced-motion: no-preference) {
  .note-count {
    animation: note-pop 180ms ease-out;
  }
}
@keyframes note-pop {
  from {
    transform: scale(0.6);
  }
  60% {
    transform: scale(1.15);
  }
  to {
    transform: scale(1);
  }
}
</style>
