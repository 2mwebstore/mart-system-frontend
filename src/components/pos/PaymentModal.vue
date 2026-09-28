<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Modal from '@/components/Modal.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { listPaymentMethods } from '@/api/settings'
import { useSettingsStore } from '@/stores/settings'
import { seededLabel } from '@/i18n'
import { calculateChange, usdCentsToRiel } from '@/utils/money'
import { formatUSD, formatKHR } from '@/utils/format'
import type { CreateSaleInput } from '@/types/domain'

const props = defineProps<{ totalCents: number; submitting?: boolean }>()
const emit = defineEmits<{
  close: []
  paid: [CreateSaleInput['payment']]
}>()

const settings = useSettingsStore()
const rate = computed(() => settings.rate)

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

const tenderUSD = ref(0)
const tenderKHR = ref(0)
const note = ref('')

const tenderUSDCents = computed(() => Math.round((tenderUSD.value || 0) * 100))
const tenderKHRRiel = computed(() => Math.round(tenderKHR.value || 0))
// Same maths as the server's change rule; the server recomputes on submit.
const change = computed(() => calculateChange(props.totalCents, tenderUSDCents.value, tenderKHRRiel.value, rate.value))
const shortfallKHRRiel = computed(() => usdCentsToRiel(change.value.shortCents, rate.value))
const canConfirmCash = computed(() => change.value.shortCents === 0 && props.totalCents >= 0)

function setExactCash() {
  tenderUSD.value = Number((props.totalCents / 100).toFixed(2))
  tenderKHR.value = 0
}
function addQuickUSD(amount: number) {
  tenderUSD.value = Number(((tenderUSD.value || 0) + amount).toFixed(2))
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
  <Modal :title="$t('pos.takePayment')" @close="emit('close')">
    <div class="space-y-5">
      <div class="text-center">
        <p class="text-muted text-sm">{{ $t('pos.amountDue') }}</p>
        <p class="font-mono text-4xl mt-1">{{ formatUSD(totalCents) }}</p>
        <p class="text-muted text-sm font-mono">{{ formatKHR(usdCentsToRiel(totalCents, rate)) }}</p>
      </div>

      <SearchableSelect v-model="methodId" :label="$t('pos.paymentMethod')" :options="methodOptions" :searchable="false" :clearable="false" />

      <div v-if="method === 'CASH'" class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('pos.tenderedUsd') }}</label>
            <input v-model.number="tenderUSD" type="number" min="0" step="0.01" class="input text-lg" />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('pos.tenderedKhr') }}</label>
            <input v-model.number="tenderKHR" type="number" min="0" step="100" class="input text-lg" />
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary px-3 py-1.5 text-sm" @click="setExactCash">{{ $t('pos.exact') }}</button>
          <button v-for="amt in [1, 5, 10, 20, 50, 100]" :key="amt" type="button" class="btn-secondary px-3 py-1.5 text-sm" @click="addQuickUSD(amt)">
            +${{ amt }}
          </button>
        </div>

        <div class="rounded-control border border-line p-3 flex items-center justify-between">
          <span class="text-sm text-muted">{{ change.shortCents > 0 ? $t('pos.remaining') : $t('pos.changeDue') }}</span>
          <span class="font-mono text-lg text-right" :class="change.shortCents > 0 ? 'text-danger-strong' : 'text-success-text'">
            <template v-if="change.shortCents > 0">
              {{ formatUSD(change.shortCents) }} <span class="text-sm">({{ formatKHR(shortfallKHRRiel) }})</span>
            </template>
            <template v-else>
              {{ formatUSD(change.usdCents) }}<span class="text-sm"> + {{ formatKHR(change.khrRiel) }}</span>
            </template>
          </span>
        </div>

        <button type="button" class="btn-primary w-full text-lg py-3" :disabled="!canConfirmCash || submitting" @click="confirmCash">
          {{ $t('pos.confirmCash') }}
        </button>
      </div>

      <div v-else class="space-y-4">
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('pos.noteOptional') }}</label>
          <input v-model="note" type="text" class="input" :placeholder="method === 'KHQR' ? $t('pos.noteHintKhqr') : $t('pos.noteHintCard')" />
        </div>
        <button type="button" class="btn-primary w-full text-lg py-3" :disabled="submitting" @click="confirmOther">
          {{ method === 'KHQR' ? $t('pos.confirmKhqr') : $t('pos.confirmCard') }}
        </button>
      </div>

      <button type="button" class="text-sm text-muted hover:text-ink block mx-auto" @click="emit('close')">{{ $t('common.cancel') }}</button>
    </div>
  </Modal>
</template>
