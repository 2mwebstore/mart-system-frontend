<script setup lang="ts">
// Shift wizard per build spec §8.2: open -> live summary while open ->
// close (summary + closing count + diff badge) -> Z-report -> back to
// closed. Everything is read from and written to the /shifts API: the same
// shift the POS till sees, with the expected drawer worked out by the server.
//
// Both opening and closing the float are a single Amount (USD) + Amount
// (KHR) input, not a per-denomination breakdown (see docs/DECISIONS.md).
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Pagination from '@/components/Pagination.vue'
import { usePagedList } from '@/composables/usePagedList'
import { Printer, ArrowRight } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import * as posApi from '@/api/pos'
import { listPublicTills } from '@/api/settings'
import type { PublicTill, Shift } from '@/types/domain'
import { formatUSD, formatKHR, formatDateTime } from '@/utils/format'
import { drawerStatus } from '@/utils/money'
import StatusBadge from '@/components/StatusBadge.vue'
import Modal from '@/components/Modal.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import DateRangePicker from '@/components/DateRangePicker.vue'
import { useToast } from '@/composables/useToast'
import { label, t } from '@/i18n'

const auth = useAuthStore()
const settings = useSettingsStore()
const toast = useToast()

const branchId = computed(() => auth.activeBranchId ?? 0)
const branchName = computed(() => auth.branches.find((b) => b.id === branchId.value)?.name ?? '')

type Step = 'closed' | 'open' | 'closing' | 'report'
const step = ref<Step>('closed')

const allTills = ref<PublicTill[]>([])
const till = ref('')
const tillOptions = computed(() =>
  allTills.value.filter((t) => t.branchId === branchId.value).map((t) => ({ value: t.deviceKey, label: t.name })),
)
const cashMovementTypeOptions = computed(() => [
  { value: 'PAYOUT', label: label('movementDir', 'PAYOUT') },
  { value: 'PAYIN', label: label('movementDir', 'PAYIN') },
])

const current = ref<Shift | null>(null)
const report = ref<Shift | null>(null)
// Shift history: one server page at a time, filterable by till, cashier and
// the date the shift was opened (null range = all dates).
const historyTill = ref<'all' | string>('all')
const historyCashier = ref<'all' | number>('all')
const historyRange = ref<{ from: string; to: string } | null>(null)
const historyList = reactive(
  usePagedList(
    ({ page, perPage }) =>
      posApi.pageShifts(branchId.value, {
        page,
        perPage,
        deviceKey: historyTill.value === 'all' ? null : historyTill.value,
        userId: historyCashier.value === 'all' ? null : historyCashier.value,
        dateFrom: historyRange.value?.from,
        dateTo: historyRange.value?.to,
      }),
    { deps: [branchId, historyTill, historyCashier, historyRange] },
  ),
)
const historyTillOptions = computed(() => [{ value: 'all', label: t('shifts.allTills') }, ...tillOptions.value])
const historyCashierOptions = computed(() => [
  { value: 'all', label: t('shifts.allCashiers') },
  ...(historyList.summary?.cashiers ?? []).map((c) => ({ value: c.id, label: c.name })),
])
const busy = ref(false)

const tillName = computed(() => allTills.value.find((t) => t.deviceKey === till.value)?.name ?? '')

const loadHistory = () => historyList.reload()
async function loadCurrent() {
  if (!till.value) {
    current.value = null
    step.value = 'closed'
    return
  }
  current.value = await posApi.getCurrentShift(till.value)
  step.value = current.value ? 'open' : 'closed'
}
async function guarded(fn: () => Promise<void>) {
  busy.value = true
  try {
    await fn()
  } catch {
    // the API client already toasted the reason
  } finally {
    busy.value = false
  }
}

onMounted(() =>
  guarded(async () => {
    allTills.value = await listPublicTills()
    till.value = tillOptions.value[0]?.value ?? ''
    await loadCurrent()
  }),
)
// Switching branch or till reloads that till's shift and the history.
watch(branchId, () =>
  guarded(async () => {
    till.value = tillOptions.value[0]?.value ?? ''
    historyTill.value = 'all'
    historyCashier.value = 'all'
    report.value = null
    await loadCurrent()
  }),
)
watch(till, () => {
  report.value = null
  void guarded(loadCurrent)
})

// A blind count: without shift.see_expected the server withholds the expected
// drawer amount until the shift is closed.
const expectedVisible = computed(() => current.value?.expectedUsdCents != null)

// ---- Open ----------------------------------------------------------------
const showOpenShiftModal = ref(false)
const openingUSDAmount = ref(0)
const openingKHRAmount = ref(0)

function startOpening() {
  openingUSDAmount.value = 0
  openingKHRAmount.value = 0
  showOpenShiftModal.value = true
}
function confirmOpen() {
  return guarded(async () => {
    current.value = await posApi.openShift({
      deviceKey: till.value,
      openingUsdCents: Math.round((openingUSDAmount.value || 0) * 100),
      openingKhrRiel: Math.round(openingKHRAmount.value || 0),
    })
    showOpenShiftModal.value = false
    step.value = 'open'
    toast.success(t('shifts.shiftOpened', { till: tillName.value }))
    await loadHistory()
  })
}

// ---- Close ---------------------------------------------------------------
const closingUSDAmount = ref(0)
const closingKHRAmount = ref(0)
const countedUSDCents = computed(() => Math.round((closingUSDAmount.value || 0) * 100))
const countedKHRRiel = computed(() => Math.round(closingKHRAmount.value || 0))

const statusOf = (diffUsd: number, diffKhr: number, rate = current.value?.exchangeRate ?? 4100) => drawerStatus(diffUsd, diffKhr, rate)
const liveDiffUsd = computed(() => countedUSDCents.value - (current.value?.expectedUsdCents ?? 0))
const liveDiffKhr = computed(() => countedKHRRiel.value - (current.value?.expectedKhrRiel ?? 0))

function startClosing() {
  closingUSDAmount.value = 0
  closingKHRAmount.value = 0
  step.value = 'closing'
}
function confirmClose() {
  if (!current.value) return
  return guarded(async () => {
    report.value = await posApi.closeShift(current.value!.id, { countedUsdCents: countedUSDCents.value, countedKhrRiel: countedKHRRiel.value })
    current.value = null
    step.value = 'report'
    toast.success(t('shifts.shiftClosed'))
    await loadHistory()
  })
}
function printPage() {
  window.print()
}
function openNextShift() {
  report.value = null
  step.value = 'closed'
}

// ---- Cash movements ------------------------------------------------------
const showCashMovement = ref(false)
const cashMovementType = ref<'PAYOUT' | 'PAYIN'>('PAYOUT')
const cashMovementForm = reactive({ amountUSD: 0, amountKHR: 0, reason: '' })

function openCashMovement() {
  Object.assign(cashMovementForm, { amountUSD: 0, amountKHR: 0, reason: '' })
  showCashMovement.value = true
}
function submitCashMovement() {
  if (!current.value) return
  const usd = Math.round((cashMovementForm.amountUSD || 0) * 100)
  const khr = Math.round(cashMovementForm.amountKHR || 0)
  if (usd <= 0 && khr <= 0) {
    toast.error(t('shifts.enterAmount'))
    return
  }
  return guarded(async () => {
    current.value = await posApi.addCashMovement(current.value!.id, {
      type: cashMovementType.value,
      amountUsdCents: usd,
      amountKhrRiel: khr,
      reason: cashMovementForm.reason.trim(),
    })
    showCashMovement.value = false
    toast.success(t('shifts.movementRecorded', { kind: label('movementDir', cashMovementType.value) }))
  })
}

function historyStatus(s: Shift): { tone: 'success' | 'warning' | 'danger'; label: string } {
  if (s.status === 'OPEN') return { tone: 'success', label: t('shiftStatus.OPEN') }
  return statusOf(s.diffUsdCents, s.diffKhrRiel, s.exchangeRate)
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div>
      <h1 class="font-heading text-2xl">{{ $t('shifts.title') }}</h1>
      <p class="text-muted text-sm">{{ branchName }}</p>
    </div>

    <!-- Step: closed -->
    <div v-if="step === 'closed'" class="card max-w-md" hidden>
      <SearchableSelect v-model="till" :label="$t('common.till')" class="mb-4" :options="tillOptions" :searchable="false" :clearable="false" />
      <button type="button" class="btn-primary w-full" :disabled="!till || busy" @click="startOpening">{{ $t('shifts.openShift') }}</button>
    </div>

    <!-- Step: open (live) -->
    <div v-else-if="step === 'open' && current" class="card max-w-3xl space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-heading text-lg">{{ $t('shifts.shiftOpenTitle', { till: current.deviceName }) }}</h2>
        <StatusBadge tone="success" :label="$t('shiftStatus.OPEN')" />
      </div>
      <SearchableSelect v-model="till" :label="$t('common.till')" :options="tillOptions" :searchable="false" :clearable="false" class="max-w-xs" />
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border-b border-line pb-4">
        <div><p class="text-muted">{{ $t('common.cashier') }}</p><p class="font-mono">{{ current.cashierName }}</p></div>
        <div><p class="text-muted">{{ $t('common.till') }}</p><p class="font-mono">{{ current.deviceName }}</p></div>
        <div><p class="text-muted">{{ $t('shifts.openedAt') }}</p><p class="font-mono">{{ formatDateTime(current.openedAt) }}</p></div>
        <div><p class="text-muted">{{ $t('shifts.openingFloat') }}</p><p class="font-mono">{{ formatUSD(current.openingUsdCents) }} + {{ formatKHR(current.openingKhrRiel) }}</p></div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><p class="text-muted">{{ $t('shifts.cashUsd') }}</p><p class="font-mono">{{ formatUSD(current.cashUsdCents) }}</p></div>
        <div><p class="text-muted">{{ $t('shifts.cashKhr') }}</p><p class="font-mono">{{ formatKHR(current.cashKhrRiel) }}</p></div>
        <div><p class="text-muted">{{ $t('method.KHQR') }}</p><p class="font-mono">{{ formatUSD(current.khqrCents) }}</p></div>
        <div><p class="text-muted">{{ $t('method.CARD') }}</p><p class="font-mono">{{ formatUSD(current.cardCents) }}</p></div>
        <div><p class="text-muted">{{ $t('shifts.voided') }}</p><p class="font-mono">{{ formatUSD(current.voidedCents) }} ({{ current.voidedCount }})</p></div>
        <div><p class="text-muted">{{ $t('shifts.payouts') }}</p><p class="font-mono">{{ formatUSD(current.payoutUsdCents) }}{{ current.payoutKhrRiel ? ` + ${formatKHR(current.payoutKhrRiel)}` : '' }}</p></div>
        <div><p class="text-muted">{{ $t('shifts.transactions') }}</p><p class="font-mono">{{ current.transactions }}</p></div>
        <div><p class="text-muted">{{ $t('shifts.itemsSold') }}</p><p class="font-mono">{{ current.itemsSold }}</p></div>
      </div>

      <div v-if="current.cashMovements?.length" class="space-y-2">
        <p class="text-sm text-muted">{{ $t('shifts.cashMovementsThisShift') }}</p>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-1.5 font-medium">{{ $t('col.time') }}</th>
              <th class="py-1.5 font-medium">{{ $t('col.type') }}</th>
              <th class="py-1.5 font-medium text-right">{{ $t('col.amount') }}</th>
              <th class="py-1.5 font-medium">{{ $t('common.reason') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in current.cashMovements" :key="m.id" class="border-b border-line last:border-0">
              <td class="py-1.5 font-mono text-xs">{{ formatDateTime(m.createdAt) }}</td>
              <td class="py-1.5"><StatusBadge :tone="m.type === 'PAYIN' ? 'success' : 'warning'" :label="label('movementDir', m.type)" /></td>
              <td class="py-1.5 text-right font-mono">{{ formatUSD(m.amountUsdCents) }}{{ m.amountKhrRiel ? ` + ${formatKHR(m.amountKhrRiel)}` : '' }}</td>
              <td class="py-1.5 text-muted">{{ m.reason }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="btn-secondary" @click="openCashMovement">{{ $t('shifts.cashMovement') }}</button>
        <button type="button" class="btn-primary" @click="startClosing">{{ $t('shifts.closeShift') }}</button>
      </div>
    </div>

    <!-- Step: closing -->
    <div v-else-if="step === 'closing' && current" class="card max-w-4xl space-y-4">
      <h2 class="font-heading text-lg">{{ $t('shifts.closeTitle', { till: current.deviceName }) }}</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="space-y-2 text-sm">
          <div class="flex justify-between"><span class="text-muted">{{ $t('method.KHQR') }}</span><span class="font-mono">{{ formatUSD(current.khqrCents) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('method.CARD') }}</span><span class="font-mono">{{ formatUSD(current.cardCents) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('shifts.cashUsd') }}</span><span class="font-mono">{{ formatUSD(current.cashUsdCents) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('shifts.cashKhr') }}</span><span class="font-mono">{{ formatKHR(current.cashKhrRiel) }}</span></div>
          <div class="flex justify-between font-medium border-t border-line pt-2"><span>{{ $t('shifts.totalSales') }}</span><span class="font-mono">{{ formatUSD(current.grossSalesCents) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('shifts.payouts') }}</span><span class="font-mono">-{{ formatUSD(current.payoutUsdCents) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('shifts.payins') }}</span><span class="font-mono">+{{ formatUSD(current.payinUsdCents) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('shifts.openingFloat') }}</span><span class="font-mono">{{ formatUSD(current.openingUsdCents) }} + {{ formatKHR(current.openingKhrRiel) }}</span></div>
          <div v-if="expectedVisible" class="flex justify-between font-medium border-t border-line pt-2">
            <span>{{ $t('shifts.expectedInDrawer') }}</span>
            <span class="font-mono">{{ formatUSD(current.expectedUsdCents ?? 0) }} + {{ formatKHR(current.expectedKhrRiel ?? 0) }}</span>
          </div>
          <p v-else class="text-muted text-xs italic pt-2">{{ $t('shifts.blindHidden') }}</p>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-muted mb-1">{{ $t('shifts.countedUsd') }}</label>
              <input v-model.number="closingUSDAmount" type="number" min="0" step="0.01" class="input" />
            </div>
            <div>
              <label class="block text-sm text-muted mb-1">{{ $t('shifts.countedKhr') }}</label>
              <input v-model.number="closingKHRAmount" type="number" min="0" step="100" class="input" />
            </div>
          </div>
          <div v-if="expectedVisible" class="flex items-center justify-between rounded-control border border-line p-3">
            <div class="text-sm space-y-0.5">
              <p>{{ $t('shifts.usdDiff') }} <span class="font-mono">{{ liveDiffUsd >= 0 ? '+' : '' }}{{ formatUSD(liveDiffUsd) }}</span></p>
              <p>{{ $t('shifts.khrDiff') }} <span class="font-mono">{{ liveDiffKhr >= 0 ? '+' : '' }}{{ formatKHR(liveDiffKhr) }}</span></p>
            </div>
            <StatusBadge :tone="statusOf(liveDiffUsd, liveDiffKhr).tone" :label="statusOf(liveDiffUsd, liveDiffKhr).label" />
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="btn-secondary" @click="step = 'open'">{{ $t('common.back') }}</button>
        <button type="button" class="btn-primary flex items-center gap-2" :disabled="busy" @click="confirmClose">
          {{ $t('shifts.closeAndReport') }} <ArrowRight :stroke-width="1.8" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Step: report -->
    <div v-else-if="step === 'report' && report" id="shift-report" class="card max-w-lg mx-auto font-mono text-sm space-y-3">
      <div class="text-center space-y-0.5 font-body">
        <p class="font-heading text-lg">{{ $t('shifts.reportBrand', { brand: settings.app.receiptHeader || $t('app.brand'), branch: branchName }) }}</p>
        <p class="text-muted">{{ $t('shifts.reportTitle', { till: report.deviceName }) }}</p>
        <p class="text-muted">{{ report.cashierName }}</p>
        <p class="text-muted">{{ formatDateTime(report.openedAt) }} → {{ formatDateTime(report.closedAt) }}</p>
      </div>
      <div class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('shifts.transactions') }}</span><span>{{ report.transactions }}</span></div>
        <div class="flex justify-between"><span>{{ $t('shifts.itemsSold') }}</span><span>{{ report.itemsSold }}</span></div>
        <div class="flex justify-between font-medium"><span>{{ $t('shifts.grossSales') }}</span><span>{{ formatUSD(report.grossSalesCents) }}</span></div>
        <div class="flex justify-between"><span>{{ $t('shifts.voidedCount', { n: report.voidedCount }) }}</span><span>{{ formatUSD(report.voidedCents) }}</span></div>
      </div>
      <div class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('shifts.cashUsd') }}</span><span>{{ formatUSD(report.cashUsdCents) }}</span></div>
        <div class="flex justify-between"><span>{{ $t('shifts.cashKhr') }}</span><span>{{ formatKHR(report.cashKhrRiel) }}</span></div>
        <div class="flex justify-between"><span>{{ $t('method.KHQR') }}</span><span>{{ formatUSD(report.khqrCents) }}</span></div>
        <div class="flex justify-between"><span>{{ $t('method.CARD') }}</span><span>{{ formatUSD(report.cardCents) }}</span></div>
      </div>
      <div class="border-t border-line pt-2 space-y-1">
        <div class="flex justify-between"><span>{{ $t('shifts.expected') }}</span><span>{{ formatUSD(report.expectedUsdCents ?? 0) }} + {{ formatKHR(report.expectedKhrRiel ?? 0) }}</span></div>
        <div class="flex justify-between"><span>{{ $t('shifts.counted') }}</span><span>{{ formatUSD(report.countedUsdCents) }} + {{ formatKHR(report.countedKhrRiel) }}</span></div>
        <div class="flex justify-between items-center">
          <span>{{ $t('shifts.difference') }}</span>
          <StatusBadge :tone="statusOf(report.diffUsdCents, report.diffKhrRiel, report.exchangeRate).tone" :label="statusOf(report.diffUsdCents, report.diffKhrRiel, report.exchangeRate).label" />
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-3 font-body print:hidden">
        <button type="button" class="btn-secondary flex items-center gap-2" @click="printPage">
          <Printer :stroke-width="1.8" class="w-4 h-4" />{{ $t('common.print') }}
        </button>
        <button type="button" class="btn-primary" @click="openNextShift">{{ $t('shifts.openNext') }}</button>
      </div>
    </div>

    <!-- Shift history -->
    <div class="card overflow-x-auto">
      <h2 class="font-heading text-base mb-3">{{ $t('shifts.history') }}</h2>
      <div class="flex flex-wrap items-end gap-3 mb-4">
        <SearchableSelect v-model="historyTill" :label="$t('common.till')" class="w-44" :options="historyTillOptions" :searchable="false" :clearable="false" />
        <SearchableSelect v-model="historyCashier" :label="$t('common.cashier')" class="w-52" :options="historyCashierOptions" :clearable="false" />
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('shifts.openedFilter') }}</label>
          <DateRangePicker v-model="historyRange" clearable @clear="historyRange = null" />
        </div>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-line">
            <th class="py-2 font-medium">{{ $t('col.shift') }}</th>
            <th class="py-2 font-medium">{{ $t('common.till') }}</th>
            <th class="py-2 font-medium">{{ $t('common.cashier') }}</th>
            <th class="py-2 font-medium">{{ $t('col.opened') }}</th>
            <th class="py-2 font-medium">{{ $t('col.closed') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('col.sales') }}</th>
            <th class="py-2 font-medium">{{ $t('col.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in historyList.rows" :key="s.id" class="border-b border-line last:border-0">
            <td class="py-2 font-mono text-xs">#{{ s.id }}</td>
            <td class="py-2">{{ s.deviceName }}</td>
            <td class="py-2">{{ s.cashierName }}</td>
            <td class="py-2 font-mono text-xs">{{ formatDateTime(s.openedAt) }}</td>
            <td class="py-2 font-mono text-xs">{{ formatDateTime(s.closedAt) }}</td>
            <td class="py-2 text-right font-mono">{{ formatUSD(s.grossSalesCents) }}</td>
            <td class="py-2"><StatusBadge :tone="historyStatus(s).tone" :label="historyStatus(s).label" /></td>
          </tr>
          <tr v-if="!historyList.loading && historyList.rows.length === 0">
            <td colspan="7" class="py-6 text-center text-muted">{{ $t('shifts.noMatch') }}</td>
          </tr>
        </tbody>
      </table>
      <Pagination v-model:page="historyList.page" :total-pages="historyList.totalPages" :total="historyList.total" :per-page="historyList.perPage" :noun="$t('shifts.noun')" />
    </div>

    <Modal v-if="showOpenShiftModal" :title="$t('shifts.openShift')" @close="showOpenShiftModal = false">
      <form class="space-y-4" @submit.prevent="confirmOpen">
        <div>
          <SearchableSelect v-model="till" :label="$t('common.till')" :options="tillOptions" :searchable="false" :clearable="false" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('shifts.amountUsd') }}</label>
            <input v-model.number="openingUSDAmount" type="number" min="0" step="0.01" class="input" />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('shifts.amountKhr') }}</label>
            <input v-model.number="openingKHRAmount" type="number" min="0" step="100" class="input" />
          </div>
        </div>
        <p class="text-xs text-muted">{{ $t('shifts.totalOpening', { usd: formatUSD(Math.round((openingUSDAmount || 0) * 100)), khr: formatKHR(openingKHRAmount || 0) }) }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showOpenShiftModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="busy">{{ $t('shifts.startShift') }}</button>
        </div>
      </form>
    </Modal>

    <Modal v-if="showCashMovement" :title="$t('shifts.cashMovement')" @close="showCashMovement = false">
      <form class="space-y-4" @submit.prevent="submitCashMovement">
        <div>
          <SearchableSelect v-model="cashMovementType" :label="$t('common.type')" :options="cashMovementTypeOptions" :searchable="false" :clearable="false" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('shifts.amountUsd') }}</label>
            <input v-model.number="cashMovementForm.amountUSD" type="number" min="0" step="0.01" class="input" />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('shifts.amountKhr') }}</label>
            <input v-model.number="cashMovementForm.amountKHR" type="number" min="0" step="100" class="input" />
          </div>
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.reason') }}</label>
          <input v-model="cashMovementForm.reason" type="text" class="input" required />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showCashMovement = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="busy">{{ $t('common.save') }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
