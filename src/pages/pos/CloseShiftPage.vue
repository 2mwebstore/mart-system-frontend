<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Printer, ArrowLeft } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useShiftStore } from '@/stores/shift'
import { useSettingsStore } from '@/stores/settings'
import type { Shift } from '@/types/domain'
import { formatUSD, formatKHR, formatDateTime } from '@/utils/format'
import { drawerStatus } from '@/utils/money'
import { useToast } from '@/composables/useToast'
import { t } from '@/i18n'

const auth = useAuthStore()
const shift = useShiftStore()
const settings = useSettingsStore()
const router = useRouter()
const toast = useToast()

const countedUSD = ref(0)
const countedKHR = ref(0)
const closing = ref(false)
const report = ref<Shift | null>(null)

const current = computed(() => shift.shift)
// A blind count: without shift.see_expected the server withholds the expected
// drawer amount until the shift is closed, so the cashier counts honestly.
const expectedVisible = computed(() => current.value?.expectedUsdCents != null)
const countedUSDCents = computed(() => Math.round((countedUSD.value || 0) * 100))
const countedKHRRiel = computed(() => Math.round(countedKHR.value || 0))

const statusOf = (s: Shift) => drawerStatus(s.diffUsdCents, s.diffKhrRiel, s.exchangeRate)
// Live preview for roles allowed to see the expected amount.
const preview = computed(() => {
  const s = current.value
  if (!s || s.expectedUsdCents == null || s.expectedKhrRiel == null) return null
  return statusOf({ ...s, diffUsdCents: countedUSDCents.value - s.expectedUsdCents, diffKhrRiel: countedKHRRiel.value - s.expectedKhrRiel })
})

async function confirmClose() {
  closing.value = true
  try {
    report.value = await shift.closeShift(countedUSDCents.value, countedKHRRiel.value)
    toast.success(t('shifts.shiftClosed'))
  } catch {
    // the API client already toasted the reason
  } finally {
    closing.value = false
  }
}
function backToPos() {
  router.push({ name: 'pos' })
}
function startNextShift() {
  router.push({ name: 'pos-open-shift' })
}
function printReport() {
  window.print()
}
</script>

<template>
  <div class="min-h-screen bg-page p-6 flex items-center justify-center">
    <div v-if="!report && current" class="card max-w-2xl w-full space-y-5">
      <div class="flex items-center justify-between">
        <h1 class="font-heading text-xl">{{ $t('shifts.closeTitle', { till: auth.tillName }) }}</h1>
        <button type="button" class="btn-secondary flex items-center gap-2 text-sm" @click="backToPos">
          <ArrowLeft :stroke-width="1.8" class="w-4 h-4" /> {{ $t('shifts.backToSale') }}
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div class="space-y-2 text-sm">
          <div class="flex justify-between"><span class="text-muted">{{ $t('pos.cashSales') }}</span><span class="font-mono">{{ current.cashSalesCount }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('method.KHQR') }}</span><span class="font-mono">{{ formatUSD(current.khqrCents) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('method.CARD') }}</span><span class="font-mono">{{ formatUSD(current.cardCents) }}</span></div>
          <div class="flex justify-between font-medium border-t border-line pt-2"><span>{{ $t('shifts.grossSales') }}</span><span class="font-mono">{{ formatUSD(current.grossSalesCents) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('shifts.openingFloat') }}</span><span class="font-mono">{{ formatUSD(current.openingUsdCents) }} + {{ formatKHR(current.openingKhrRiel) }}</span></div>
          <div v-if="expectedVisible" class="flex justify-between font-medium border-t border-line pt-2">
            <span>{{ $t('shifts.expectedInDrawer') }}</span>
            <span class="font-mono">{{ formatUSD(current.expectedUsdCents ?? 0) }} + {{ formatKHR(current.expectedKhrRiel ?? 0) }}</span>
          </div>
          <p v-else class="text-xs text-muted border-t border-line pt-2">{{ $t('shifts.blindPos') }}</p>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm text-muted mb-1">{{ $t('shifts.countedUsd') }}</label>
              <input v-model.number="countedUSD" type="number" min="0" step="0.01" class="input text-lg" />
            </div>
            <div>
              <label class="block text-sm text-muted mb-1">{{ $t('shifts.countedKhr') }}</label>
              <input v-model.number="countedKHR" type="number" min="0" step="100" class="input text-lg" />
            </div>
          </div>

          <div v-if="preview && current.expectedUsdCents != null && current.expectedKhrRiel != null" class="flex items-center justify-between rounded-control border border-line p-3">
            <div class="text-sm space-y-0.5">
              <p>{{ $t('shifts.usdDiff') }} <span class="font-mono">{{ countedUSDCents - current.expectedUsdCents >= 0 ? '+' : '' }}{{ formatUSD(countedUSDCents - current.expectedUsdCents) }}</span></p>
              <p>{{ $t('shifts.khrDiff') }} <span class="font-mono">{{ countedKHRRiel - current.expectedKhrRiel >= 0 ? '+' : '' }}{{ formatKHR(countedKHRRiel - current.expectedKhrRiel) }}</span></p>
            </div>
            <span
              class="rounded-control px-2 py-0.5 text-xs font-medium"
              :class="preview.tone === 'success' ? 'badge-success' : preview.tone === 'danger' ? 'badge-danger' : 'badge-warning'"
            >
              {{ preview.label }}
            </span>
          </div>

          <button type="button" class="btn-primary w-full text-lg py-3" :disabled="closing" @click="confirmClose">{{ $t('shifts.confirmClose') }}</button>
        </div>
      </div>
    </div>

    <div v-else-if="report" id="pos-shift-report" class="card max-w-md w-full font-mono text-sm space-y-3">
      <div class="text-center space-y-0.5 font-body">
        <p class="font-heading text-lg">{{ settings.app.receiptHeader || $t('app.brand') }}</p>
        <p class="text-muted">{{ $t('shifts.reportTitle', { till: report.deviceName }) }}</p>
        <p class="text-muted">{{ report.cashierName }}</p>
        <p class="text-muted">{{ formatDateTime(report.openedAt) }} → {{ formatDateTime(report.closedAt) }}</p>
      </div>
      <div class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('pos.cashSales') }}</span><span>{{ report.cashSalesCount }}</span></div>
        <div class="flex justify-between"><span>{{ $t('method.KHQR') }}</span><span>{{ formatUSD(report.khqrCents) }}</span></div>
        <div class="flex justify-between"><span>{{ $t('method.CARD') }}</span><span>{{ formatUSD(report.cardCents) }}</span></div>
        <div class="flex justify-between font-medium"><span>{{ $t('shifts.grossSales') }}</span><span>{{ formatUSD(report.grossSalesCents) }}</span></div>
      </div>
      <div class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('shifts.expected') }}</span><span>{{ formatUSD(report.expectedUsdCents ?? 0) }} + {{ formatKHR(report.expectedKhrRiel ?? 0) }}</span></div>
        <div class="flex justify-between"><span>{{ $t('shifts.counted') }}</span><span>{{ formatUSD(report.countedUsdCents) }} + {{ formatKHR(report.countedKhrRiel) }}</span></div>
        <div class="flex justify-between items-center">
          <span>{{ $t('shifts.difference') }}</span>
          <span
            class="rounded-control px-2 py-0.5 text-xs font-medium"
            :class="statusOf(report).tone === 'success' ? 'badge-success' : statusOf(report).tone === 'danger' ? 'badge-danger' : 'badge-warning'"
          >
            {{ statusOf(report).label }}
          </span>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-3 font-body print:hidden">
        <button type="button" class="btn-secondary flex items-center gap-2" @click="printReport">
          <Printer :stroke-width="1.8" class="w-4 h-4" /> {{ $t('common.print') }}
        </button>
        <button type="button" class="btn-primary" @click="startNextShift">{{ $t('shifts.openNext') }}</button>
      </div>
    </div>
  </div>
</template>
