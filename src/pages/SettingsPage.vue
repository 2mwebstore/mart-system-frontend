<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Download, Pencil, Plus, Send, Trash2 } from 'lucide-vue-next'
import * as settingsApi from '@/api/settings'
import {
  ALERT_TYPES,
  type AlertType,
  type BackupRow,
  type Branch,
  type DocType,
  type NumberSequence,
  type PaymentMethodRow,
  type Till,
} from '@/types/domain'
import Tabs from '@/components/Tabs.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import Modal from '@/components/Modal.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import { formatDateTime } from '@/utils/format'
import { label, t } from '@/i18n'

const auth = useAuthStore()
const settings = useSettingsStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()
// Defaults to Branches when the router sent us here for having none (see
// router/index.ts) — otherwise the usual first tab.
const activeTab = ref(route.query.tab === 'branches' ? 'branches' : 'rate')
const canManageSystem = auth.hasPermission('system.manage')
const canResetSystem = auth.hasPermission('system.reset')
const tabs = computed(() => [
  { key: 'rate', label: t('settings.tabRate') },
  { key: 'branches', label: t('settings.tabBranches') },
  { key: 'payments', label: t('settings.tabPayments') },
  { key: 'receipt', label: t('settings.tabReceipt') },
  ...(canManageSystem ? [{ key: 'alerts', label: t('alerts.tab') }] : []),
  ...(canManageSystem || canResetSystem ? [{ key: 'system', label: t('settings.tabSystem') }] : []),
])

const canManage = auth.hasPermission('branch.manage')
const canEditRate = auth.hasPermission('settings.rate')

// Runs an API call, then a follow-up; the API client already toasts failures,
// so a catch here just keeps the modal open.
async function attempt(fn: () => Promise<unknown>, done: () => void | Promise<void>): Promise<boolean> {
  try {
    await fn()
    await done()
    return true
  } catch {
    return false
  }
}

// --- Exchange rate ---------------------------------------------------------

const newRate = ref(settings.rate)
async function saveRate() {
  if (await attempt(() => settings.saveRate(Number(newRate.value)), () => undefined)) {
    toast.success(t('settings.rateUpdated', { rate: settings.rate.toLocaleString() }))
  }
}

// --- Branches ------------------------------------------------------------------

const branches = ref<Branch[]>([])
const tills = ref<Till[]>([])
const paymentMethodsList = ref<PaymentMethodRow[]>([])

async function loadBranches() {
  branches.value = await settingsApi.listBranches()
}
async function loadTills() {
  tills.value = await settingsApi.listTills()
}
async function loadPayments() {
  paymentMethodsList.value = await settingsApi.listPaymentMethods()
}
onMounted(async () => {
  await settings.load()
  newRate.value = settings.rate
  receiptForm.header = settings.app.receiptHeader
  receiptForm.footer = settings.app.receiptFooter
  receiptForm.loyaltyRate = settings.app.loyaltyPointsPerUsd
  allowOutOfStockSale.value = settings.app.allowOutOfStockSale
  await Promise.allSettled([
    loadBranches(),
    canManage ? loadTills() : Promise.resolve(),
    loadPayments(),
    canManageSystem ? loadNotify() : Promise.resolve(),
    canManageSystem ? loadBackups() : Promise.resolve(),
    canManageSystem ? loadNumberSequences() : Promise.resolve(),
    canManageSystem ? loadRetention() : Promise.resolve(),
  ])
})

const showBranchModal = ref(false)
const editingBranchId = ref<number | null>(null)
const branchForm = reactive({ name: '', code: '', address: '', phone: '', receiptFooter: '', active: true })

function newBranch() {
  editingBranchId.value = null
  Object.assign(branchForm, { name: '', code: '', address: '', phone: '', receiptFooter: '', active: true })
  showBranchModal.value = true
}
function editBranch(b: Branch) {
  editingBranchId.value = b.id
  Object.assign(branchForm, { name: b.name, code: b.code, address: b.address, phone: b.phone, receiptFooter: b.receiptFooter, active: b.active })
  showBranchModal.value = true
}
async function submitBranch() {
  const id = editingBranchId.value
  const wasFirstBranch = id === null && auth.branches.length === 0
  const ok = await attempt(
    () => (id === null ? settingsApi.createBranch({ ...branchForm }) : settingsApi.updateBranch(id, { ...branchForm })),
    loadBranches,
  )
  if (ok) {
    toast.success(id === null ? t('settings.branchCreated') : t('settings.branchUpdated'))
    showBranchModal.value = false
    // auth.branches (not this page's own list above) is what the router
    // guard checks to decide whether every other page is reachable yet —
    // stale until refreshed, so creating your first branch wouldn't
    // otherwise unblock navigation until the next full sign-in.
    if (wasFirstBranch) await auth.fetchMe()
  }
}
async function deleteBranch(id: number) {
  if (await attempt(() => settingsApi.deleteBranch(id), loadBranches)) {
    toast.success(t('settings.branchDeleted'))
    await auth.fetchMe()
  }
}

// --- Registered tills ---------------------------------------------------------

const branchOptions = computed(() => branches.value.map((b) => ({ value: b.id, label: b.name, sub: b.code })))
const showTillModal = ref(false)
const editingTillId = ref<number | null>(null)
const tillForm = reactive({ name: '', branchId: null as number | null, deviceKey: '', active: true })

function newTill() {
  editingTillId.value = null
  Object.assign(tillForm, { name: '', branchId: branches.value[0]?.id ?? null, deviceKey: '', active: true })
  showTillModal.value = true
}
function editTill(d: Till) {
  editingTillId.value = d.id
  Object.assign(tillForm, { name: d.name, branchId: d.branchId, deviceKey: d.deviceKey, active: d.active })
  showTillModal.value = true
}
async function submitTill() {
  if (tillForm.branchId === null) {
    toast.error(t('settings.pickBranch'))
    return
  }
  const body = { name: tillForm.name, branchId: tillForm.branchId, deviceKey: tillForm.deviceKey, active: tillForm.active }
  const id = editingTillId.value
  const ok = await attempt(() => (id === null ? settingsApi.createTill(body) : settingsApi.updateTill(id, body)), loadTills)
  if (ok) {
    toast.success(id === null ? t('settings.tillRegistered') : t('settings.tillUpdated'))
    showTillModal.value = false
  }
}
async function deleteTill(id: number) {
  if (await attempt(() => settingsApi.deleteTill(id), loadTills)) toast.success(t('settings.tillRemoved'))
}

// --- Payment methods -------------------------------------------------------------

const paymentMethodTypes = computed(() => ['CASH', 'KHQR', 'CARD', 'OTHER'].map((v) => ({ value: v, label: label('method', v) })))
const showPaymentModal = ref(false)
const editingPaymentId = ref<number | null>(null)
const paymentForm = reactive({ name: '', type: 'CASH' as PaymentMethodRow['type'], feePercent: 0, enabled: true })

function newPaymentMethod() {
  editingPaymentId.value = null
  Object.assign(paymentForm, { name: '', type: 'CASH', feePercent: 0, enabled: true })
  showPaymentModal.value = true
}
function editPaymentMethod(p: PaymentMethodRow) {
  editingPaymentId.value = p.id
  Object.assign(paymentForm, { name: p.name, type: p.type, feePercent: p.feePercent, enabled: p.enabled })
  showPaymentModal.value = true
}
async function submitPaymentMethod() {
  const id = editingPaymentId.value
  const body = { ...paymentForm, feePercent: Number(paymentForm.feePercent) || 0 }
  const ok = await attempt(() => (id === null ? settingsApi.createPaymentMethod(body) : settingsApi.updatePaymentMethod(id, body)), loadPayments)
  if (ok) {
    toast.success(id === null ? t('settings.paymentAdded') : t('settings.paymentUpdated'))
    showPaymentModal.value = false
  }
}
async function deletePaymentMethod(id: number) {
  if (await attempt(() => settingsApi.deletePaymentMethod(id), loadPayments)) toast.success(t('settings.paymentDeleted'))
}
async function togglePaymentEnabled(p: PaymentMethodRow) {
  await attempt(() => settingsApi.updatePaymentMethod(p.id, { name: p.name, type: p.type, feePercent: p.feePercent, enabled: !p.enabled }), loadPayments)
}
const paymentTypeLabel = (type: PaymentMethodRow['type']) => label('method', type)

// --- Receipt & loyalty --------------------------------------------------------------

const receiptForm = reactive({ header: '', footer: '', loyaltyRate: 1 })
async function saveReceipt() {
  const ok = await attempt(
    () =>
      settings.saveApp({
        receiptHeader: receiptForm.header,
        receiptFooter: receiptForm.footer,
        loyaltyPointsPerUsd: Number(receiptForm.loyaltyRate) || 0,
        // Not editable through this form — PUT /settings never touches it
        // server-side either (see UpdateSettings) — passed through as-is so
        // this call satisfies AppSettings without silently resetting it.
        allowOutOfStockSale: settings.app.allowOutOfStockSale,
      }),
    () => undefined,
  )
  if (ok) toast.success(t('settings.receiptSaved'))
}

// --- Telegram alerts ---------------------------------------------------------

const notifyForm = reactive({ enabled: false, botToken: '', chatId: '', alertTypes: [] as AlertType[] })
const savingNotify = ref(false)
const testingAlert = ref(false)

async function loadNotify() {
  Object.assign(notifyForm, await settingsApi.getNotifySettings())
}
function toggleAlertType(type: AlertType) {
  const idx = notifyForm.alertTypes.indexOf(type)
  if (idx === -1) notifyForm.alertTypes.push(type)
  else notifyForm.alertTypes.splice(idx, 1)
}
async function saveNotify() {
  savingNotify.value = true
  try {
    Object.assign(notifyForm, await settingsApi.updateNotifySettings({ ...notifyForm }))
    toast.success(t('alerts.settingsSaved'))
  } catch {
    // the API client already toasted the reason
  } finally {
    savingNotify.value = false
  }
}
async function sendTest() {
  if (!notifyForm.botToken || !notifyForm.chatId) {
    toast.error(t('alerts.enterTokenChatFirst'))
    return
  }
  testingAlert.value = true
  try {
    await settingsApi.sendTestAlert(notifyForm.botToken, notifyForm.chatId)
    toast.success(t('alerts.testSent'))
  } catch {
    // the API client already toasted the reason
  } finally {
    testingAlert.value = false
  }
}

// --- Database backups -----------------------------------------------------------

const backups = ref<BackupRow[]>([])
const backupSettingsForm = reactive({ autoEnabled: true, retentionDays: 14 })
const runningBackup = ref(false)
const savingBackupSettings = ref(false)

async function loadBackups() {
  const res = await settingsApi.listBackups()
  backups.value = res.rows
  Object.assign(backupSettingsForm, res.settings)
}
async function saveBackupSettings() {
  savingBackupSettings.value = true
  try {
    Object.assign(backupSettingsForm, await settingsApi.updateBackupSettings({ ...backupSettingsForm }))
    toast.success(t('alerts.backupSettingsSaved'))
  } catch {
    // the API client already toasted the reason
  } finally {
    savingBackupSettings.value = false
  }
}
async function backupNow() {
  runningBackup.value = true
  try {
    await settingsApi.runBackupNow()
    toast.success(t('alerts.backupStarted'))
  } catch {
    // the API client already toasted the reason (e.g. the mysqldump error)
  } finally {
    runningBackup.value = false
    await loadBackups()
  }
}
async function downloadBackup(b: BackupRow) {
  try {
    await settingsApi.downloadBackup(b.id, b.filename)
  } catch {
    // the API client already toasted the reason
  }
}
async function deleteBackup(id: number) {
  try {
    await settingsApi.deleteBackup(id)
    toast.success(t('alerts.deleted'))
    await loadBackups()
  } catch {
    // the API client already toasted the reason
  }
}

// --- Document numbering ---------------------------------------------------------

const numberSequences = ref<NumberSequence[]>([])
const numberForms = reactive<Record<DocType, { prefix: string; nextNumber: number }>>({
  SALE: { prefix: '', nextNumber: 1 },
  EXPENSE: { prefix: '', nextNumber: 1 },
  PURCHASE_ORDER: { prefix: '', nextNumber: 1 },
})
const savingSequence = ref<DocType | null>(null)

function syncNumberForms() {
  for (const s of numberSequences.value) {
    numberForms[s.docType] = { prefix: s.prefix, nextNumber: s.nextNumber }
  }
}
async function loadNumberSequences() {
  numberSequences.value = await settingsApi.getNumberSequences()
  syncNumberForms()
}
function previewFor(docType: DocType) {
  const f = numberForms[docType]
  const n = Number(f.nextNumber) || 1
  return `${f.prefix}-${String(n).padStart(6, '0')}`
}
async function saveNumberSequence(docType: DocType) {
  savingSequence.value = docType
  try {
    await settingsApi.updateNumberSequence(docType, { prefix: numberForms[docType].prefix, nextNumber: Number(numberForms[docType].nextNumber) || 1 })
    toast.success(t('settings.numberingSaved'))
    await loadNumberSequences()
  } catch {
    // the API client already toasted the reason
  } finally {
    savingSequence.value = null
  }
}
const docTypeLabel = (docType: DocType) => t(`settings.docType.${docType}`)

// --- Audit log retention --------------------------------------------------------

const retentionMonths = ref(3)
const savingRetention = ref(false)
const clearingLog = ref(false)

async function loadRetention() {
  retentionMonths.value = (await settingsApi.getActivityLogRetention()).retentionMonths
}
async function saveRetention() {
  savingRetention.value = true
  try {
    retentionMonths.value = (await settingsApi.updateActivityLogRetention(retentionMonths.value)).retentionMonths
    toast.success(t('settings.retentionSaved'))
  } catch {
    // the API client already toasted the reason
  } finally {
    savingRetention.value = false
  }
}
async function clearActivityLogNow() {
  clearingLog.value = true
  try {
    const res = await settingsApi.clearActivityLogNow()
    toast.success(t('settings.retentionCleared', { count: res.deleted }))
  } catch {
    // the API client already toasted the reason
  } finally {
    clearingLog.value = false
  }
}

// --- Stock-sale policy: one store-wide switch, not per-product (see docs/DECISIONS.md) ---

const allowOutOfStockSale = ref(settings.app.allowOutOfStockSale)
const savingStockPolicy = ref(false)
async function saveStockPolicy() {
  savingStockPolicy.value = true
  try {
    const res = await settingsApi.updateStockPolicy(allowOutOfStockSale.value)
    allowOutOfStockSale.value = res.allowOutOfStockSale
    settings.app.allowOutOfStockSale = res.allowOutOfStockSale
    toast.success(t('settings.stockPolicySaved'))
  } catch {
    // the API client already toasted the reason
  } finally {
    savingStockPolicy.value = false
  }
}

// --- Danger zone: production reset ------------------------------------------------

const resetConfirmText = ref('')
const showResetModal = ref(false)
const resettingSystem = ref(false)
const resetConfirmReady = computed(() => resetConfirmText.value === 'RESET')

async function submitReset() {
  if (!resetConfirmReady.value) return
  resettingSystem.value = true
  try {
    await settingsApi.resetForProduction(resetConfirmText.value)
    toast.success(t('settings.resetDone'))
    showResetModal.value = false
    resetConfirmText.value = ''
    await auth.logout()
    await router.push({ name: 'login' })
  } catch {
    // the API client already toasted the reason
  } finally {
    resettingSystem.value = false
  }
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <h1 class="font-heading text-2xl">{{ $t('settings.title') }}</h1>

    <Tabs v-model="activeTab" :tabs="tabs" />

    <div v-if="activeTab === 'rate'" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card space-y-4">
        <h2 class="font-heading text-base">{{ $t('settings.currentRate') }}</h2>
        <div class="flex items-end gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('settings.rielPerUsd') }}</label>
            <input v-model.number="newRate" type="number" min="1000" max="10000" step="10" class="input w-40" :disabled="!canEditRate" />
          </div>
          <button type="button" class="btn-primary" :disabled="!canEditRate" @click="saveRate">{{ $t('common.save') }}</button>
        </div>
        <p v-if="!canEditRate" class="text-xs text-muted">{{ $t('settings.noRatePermission') }}</p>
        <p class="text-xs text-muted">{{ $t('settings.rateNote') }}</p>
      </div>
      <div class="card">
        <h2 class="font-heading text-base mb-3">{{ $t('settings.history') }}</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.rate') }}</th>
              <th class="py-2 font-medium">{{ $t('col.setBy') }}</th>
              <th class="py-2 font-medium">{{ $t('col.effectiveFrom') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in settings.rateHistory" :key="h.id" class="border-b border-line last:border-0">
              <td class="py-2 font-mono">៛ {{ h.rate.toLocaleString() }}</td>
              <td class="py-2">{{ h.setBy }}</td>
              <td class="py-2 font-mono text-xs">{{ formatDateTime(h.effectiveAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="activeTab === 'branches'" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <p v-if="auth.branches.length === 0" class="lg:col-span-2 rounded-control bg-primary-tint text-primary-tint-text px-4 py-3 text-sm">
        {{ $t('settings.noBranchesYetHint') }}
      </p>
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-heading text-base">{{ $t('settings.branches') }}</h2>
          <button v-if="canManage" type="button" class="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm" @click="newBranch">
            <Plus :stroke-width="1.8" class="w-3.5 h-3.5" /> {{ $t('settings.newBranch') }}
          </button>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.name') }}</th>
              <th class="py-2 font-medium">{{ $t('col.code') }}</th>
              <th class="py-2 font-medium">{{ $t('col.status') }}</th>
              <th class="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in branches" :key="b.id" class="border-b border-line last:border-0 group">
              <td class="py-2">
                <p>{{ b.name }}</p>
                <p class="text-xs text-muted">{{ b.address }}</p>
              </td>
              <td class="py-2 font-mono">{{ b.code }}</td>
              <td class="py-2"><StatusBadge :tone="b.active ? 'success' : 'neutral'" :label="b.active ? $t('common.active') : $t('settings.inactive')" /></td>
              <td class="py-2">
                <div v-if="canManage" class="flex items-center gap-1">
                  <button type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('settings.editBranchAria')" @click="editBranch(b)">
                    <Pencil :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <ConfirmDelete :item-label="$t('entity.branch')" :item-name="b.name" @confirm="deleteBranch(b.id)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-heading text-base">{{ $t('settings.tills') }}</h2>
          <button v-if="canManage" type="button" class="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm" @click="newTill">
            <Plus :stroke-width="1.8" class="w-3.5 h-3.5" /> {{ $t('settings.newTill') }}
          </button>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('col.till') }}</th>
              <th class="py-2 font-medium">{{ $t('common.branch') }}</th>
              <th class="py-2 font-medium">{{ $t('col.deviceKey') }}</th>
              <th class="py-2 font-medium">{{ $t('col.lastSeen') }}</th>
              <th class="py-2 font-medium">{{ $t('col.status') }}</th>
              <th class="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in tills" :key="d.id" class="border-b border-line last:border-0">
              <td class="py-2">{{ d.name }}</td>
              <td class="py-2 text-muted">{{ branches.find((b) => b.id === d.branchId)?.name ?? '—' }}</td>
              <td class="py-2 font-mono text-xs">{{ d.deviceKey }}</td>
              <td class="py-2 font-mono text-xs">{{ formatDateTime(d.lastSeenAt) }}</td>
              <td class="py-2"><StatusBadge :tone="d.active ? 'success' : 'neutral'" :label="d.active ? $t('common.active') : $t('settings.inactive')" /></td>
              <td class="py-2">
                <div v-if="canManage" class="flex items-center gap-1">
                  <button type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('settings.editTillAria')" @click="editTill(d)">
                    <Pencil :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <ConfirmDelete :item-label="$t('entity.till')" :item-name="d.name" @confirm="deleteTill(d.id)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="activeTab === 'payments'" class="card max-w-2xl">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-heading text-base">{{ $t('settings.payments') }}</h2>
        <button v-if="canManage" type="button" class="btn-primary flex items-center gap-2" @click="newPaymentMethod">
          <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('settings.newPayment') }}
        </button>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-line">
            <th class="py-2 font-medium">{{ $t('col.name') }}</th>
            <th class="py-2 font-medium">{{ $t('col.type') }}</th>
            <th class="py-2 pr-4 font-medium text-right">{{ $t('col.fee') }}</th>
            <th class="py-2 font-medium">{{ $t('col.enabled') }}</th>
            <th class="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in paymentMethodsList" :key="p.id" class="border-b border-line last:border-0">
            <td class="py-2">{{ p.name }}</td>
            <td class="py-2 text-muted">{{ paymentTypeLabel(p.type) }}</td>
            <td class="py-2 pr-4 text-right font-mono">{{ p.feePercent }}%</td>
            <td class="py-2">
              <button
                type="button"
                role="switch"
                :aria-checked="p.enabled"
                class="w-9 h-5 rounded-full transition-colors relative disabled:opacity-50"
                :class="p.enabled ? 'bg-primary' : 'bg-line'"
                :disabled="!canManage"
                @click="togglePaymentEnabled(p)"
              >
                <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="p.enabled ? 'left-4' : 'left-0.5'" />
              </button>
            </td>
            <td class="py-2">
              <div v-if="canManage" class="flex items-center gap-1">
                <button type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('settings.editPaymentAria')" @click="editPaymentMethod(p)">
                  <Pencil :stroke-width="1.8" class="w-4 h-4" />
                </button>
                <ConfirmDelete :item-label="$t('entity.paymentMethod')" :item-name="p.name" @confirm="deletePaymentMethod(p.id)" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="activeTab === 'receipt'" class="card max-w-xl space-y-4">
      <div>
        <label class="block text-sm text-muted mb-1">{{ $t('settings.receiptHeader') }}</label>
        <input v-model="receiptForm.header" type="text" class="input" />
      </div>
      <div>
        <label class="block text-sm text-muted mb-1">{{ $t('settings.receiptFooterBilingual') }}</label>
        <textarea v-model="receiptForm.footer" rows="2" class="input" />
      </div>
      <div>
        <label class="block text-sm text-muted mb-1">{{ $t('settings.loyaltyRate') }}</label>
        <input v-model.number="receiptForm.loyaltyRate" type="number" min="0" step="0.5" class="input w-32" />
      </div>
      <div class="flex justify-end">
        <button type="button" class="btn-primary" :disabled="!canManage" @click="saveReceipt">{{ $t('common.save') }}</button>
      </div>
    </div>

    <div v-else-if="activeTab === 'alerts'" class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <div class="card space-y-4">
        <div>
          <h2 class="font-heading text-base">{{ $t('alerts.telegramTitle') }}</h2>
          <p class="text-xs text-muted mt-1">{{ $t('alerts.telegramIntro') }}</p>
        </div>

        <label class="flex items-center justify-between text-sm">
          <span>{{ $t('alerts.enabled') }}</span>
          <button
            type="button"
            role="switch"
            :aria-checked="notifyForm.enabled"
            class="w-9 h-5 rounded-full transition-colors relative"
            :class="notifyForm.enabled ? 'bg-primary' : 'bg-line'"
            @click="notifyForm.enabled = !notifyForm.enabled"
          >
            <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="notifyForm.enabled ? 'left-4' : 'left-0.5'" />
          </button>
        </label>

        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('alerts.botToken') }}</label>
          <input v-model.trim="notifyForm.botToken" type="text" class="input font-mono" :placeholder="$t('alerts.botTokenPlaceholder')" autocomplete="off" />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('alerts.chatId') }}</label>
          <input v-model.trim="notifyForm.chatId" type="text" class="input font-mono" :placeholder="$t('alerts.chatIdPlaceholder')" autocomplete="off" />
        </div>

        <div>
          <label class="block text-sm text-muted mb-2">{{ $t('alerts.alertTypesLabel') }}</label>
          <div class="grid grid-cols-1 gap-1.5">
            <label v-for="type in ALERT_TYPES" :key="type" class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" class="rounded" :checked="notifyForm.alertTypes.includes(type)" @change="toggleAlertType(type)" />
              {{ $t(`alertType.${type}`) }}
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary flex items-center gap-2" :disabled="testingAlert" @click="sendTest">
            <Send :stroke-width="1.8" class="w-4 h-4" /> {{ $t('alerts.sendTest') }}
          </button>
          <button type="button" class="btn-primary" :disabled="savingNotify" @click="saveNotify">{{ $t('common.save') }}</button>
        </div>
      </div>

      <div class="card space-y-4">
        <h2 class="font-heading text-base">{{ $t('alerts.backupTitle') }}</h2>

        <label class="flex items-center justify-between text-sm">
          <span>{{ $t('alerts.autoBackup') }}</span>
          <button
            type="button"
            role="switch"
            :aria-checked="backupSettingsForm.autoEnabled"
            class="w-9 h-5 rounded-full transition-colors relative"
            :class="backupSettingsForm.autoEnabled ? 'bg-primary' : 'bg-line'"
            @click="backupSettingsForm.autoEnabled = !backupSettingsForm.autoEnabled"
          >
            <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="backupSettingsForm.autoEnabled ? 'left-4' : 'left-0.5'" />
          </button>
        </label>
        <p class="text-xs text-muted -mt-2">{{ $t('alerts.autoBackupHint') }}</p>

        <div class="flex items-end gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('alerts.retentionDays') }}</label>
            <input v-model.number="backupSettingsForm.retentionDays" type="number" min="1" max="365" class="input w-28" />
          </div>
          <button type="button" class="btn-secondary" :disabled="savingBackupSettings" @click="saveBackupSettings">{{ $t('common.save') }}</button>
          <button type="button" class="btn-primary ml-auto" :disabled="runningBackup" @click="backupNow">
            {{ runningBackup ? $t('alerts.backingUp') : $t('alerts.backupNow') }}
          </button>
        </div>

        <div class="border-t border-line pt-3 space-y-2">
          <h3 class="text-sm font-medium">{{ $t('alerts.history') }}</h3>
          <div class="max-h-80 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted border-b border-line sticky top-0 bg-surface">
                  <th class="py-2 font-medium">{{ $t('col.date') }}</th>
                  <th class="py-2 font-medium">{{ $t('common.type') }}</th>
                  <th class="py-2 font-medium">{{ $t('col.status') }}</th>
                  <th class="py-2 font-medium text-right">{{ $t('col.size') }}</th>
                  <th class="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in backups" :key="b.id" class="border-b border-line last:border-0">
                  <td class="py-2 font-mono text-xs">{{ formatDateTime(b.startedAt) }}</td>
                  <td class="py-2">{{ $t(`backupTrigger.${b.triggerType}`) }}</td>
                  <td class="py-2">
                    <StatusBadge
                      :tone="b.status === 'SUCCESS' ? 'success' : b.status === 'FAILED' ? 'danger' : 'neutral'"
                      :label="$t(`backupStatus.${b.status}`)"
                    />
                  </td>
                  <td class="py-2 text-right font-mono text-xs">{{ b.sizeBytes ? `${(b.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '—' }}</td>
                  <td class="py-2 text-right">
                    <div class="flex items-center justify-end gap-1">
                      <span v-if="!b.downloadable && b.error" class="text-xs text-danger-strong mr-1" :title="b.error">{{ b.error.slice(0, 40) }}</span>
                      <button
                        v-if="b.downloadable"
                        type="button"
                        class="p-1.5 text-muted hover:text-ink"
                        :aria-label="$t('alerts.download')"
                        :title="$t('alerts.download')"
                        @click="downloadBackup(b)"
                      >
                        <Download :stroke-width="1.8" class="w-4 h-4" />
                      </button>
                      <ConfirmDelete v-if="b.status !== 'RUNNING'" :item-label="$t('entity.backup')" :item-name="b.filename" @confirm="deleteBackup(b.id)" />
                    </div>
                  </td>
                </tr>
                <tr v-if="backups.length === 0">
                  <td colspan="5" class="py-6 text-center text-muted">{{ $t('alerts.noBackupsYet') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p class="text-xs text-muted border-t border-line pt-3">{{ $t('alerts.diskNote') }}</p>
      </div>
    </div>

    <div v-else-if="activeTab === 'system'" class="space-y-4">
      <div v-if="canManageSystem" class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div class="card space-y-4">
          <div>
            <h2 class="font-heading text-base">{{ $t('settings.numberingTitle') }}</h2>
            <p class="text-xs text-muted mt-1">{{ $t('settings.numberingIntro') }}</p>
          </div>
          <div v-for="s in numberSequences" :key="s.docType" class="border-t border-line pt-3 first:border-0 first:pt-0 space-y-2">
            <h3 class="text-sm font-medium">{{ docTypeLabel(s.docType) }}</h3>
            <div class="flex items-end gap-3 flex-wrap">
              <div>
                <label class="block text-xs text-muted mb-1">{{ $t('settings.prefix') }}</label>
                <input v-model="numberForms[s.docType].prefix" type="text" class="input w-24 font-mono uppercase" maxlength="12" />
              </div>
              <div>
                <label class="block text-xs text-muted mb-1">{{ $t('settings.nextNumber') }}</label>
                <input v-model.number="numberForms[s.docType].nextNumber" type="number" min="1" class="input w-32" />
              </div>
              <div class="flex-1 min-w-[8rem]">
                <label class="block text-xs text-muted mb-1">{{ $t('settings.preview') }}</label>
                <p class="font-mono text-sm py-1.5">{{ previewFor(s.docType) }}</p>
              </div>
              <button
                type="button"
                class="btn-secondary"
                :disabled="savingSequence === s.docType"
                @click="saveNumberSequence(s.docType)"
              >
                {{ $t('common.save') }}
              </button>
            </div>
          </div>
          <p v-if="numberSequences.length === 0" class="text-sm text-muted">{{ $t('common.loading') }}</p>
        </div>

        <div class="card space-y-4">
          <div>
            <h2 class="font-heading text-base">{{ $t('settings.retentionTitle') }}</h2>
            <p class="text-xs text-muted mt-1">{{ $t('settings.retentionIntro') }}</p>
          </div>
          <div class="flex items-end gap-3">
            <div>
              <label class="block text-sm text-muted mb-1">{{ $t('settings.retentionMonths') }}</label>
              <select v-model.number="retentionMonths" class="input w-32">
                <option :value="1">{{ $t('settings.retentionMonthsOption', { n: 1 }, 1) }}</option>
                <option :value="2">{{ $t('settings.retentionMonthsOption', { n: 2 }, 2) }}</option>
                <option :value="3">{{ $t('settings.retentionMonthsOption', { n: 3 }, 3) }}</option>
              </select>
            </div>
            <button type="button" class="btn-secondary" :disabled="savingRetention" @click="saveRetention">{{ $t('common.save') }}</button>
          </div>
          <div class="border-t border-line pt-3 space-y-2">
            <h3 class="text-sm font-medium">{{ $t('settings.retentionClearNowTitle') }}</h3>
            <p class="text-xs text-muted">{{ $t('settings.retentionClearNowHint') }}</p>
            <button type="button" class="btn-secondary flex items-center gap-2" :disabled="clearingLog" @click="clearActivityLogNow">
              <Trash2 :stroke-width="1.8" class="w-4 h-4" /> {{ $t('settings.retentionClearNow') }}
            </button>
          </div>
        </div>

        <div class="card space-y-4">
          <div>
            <h2 class="font-heading text-base">{{ $t('settings.stockPolicyTitle') }}</h2>
            <p class="text-xs text-muted mt-1">{{ $t('settings.stockPolicyIntro') }}</p>
          </div>
          <label class="flex items-center justify-between text-sm">
            <span>{{ $t('settings.stockPolicyToggle') }}</span>
            <button
              type="button"
              role="switch"
              :aria-checked="allowOutOfStockSale"
              class="w-9 h-5 rounded-full transition-colors relative"
              :class="allowOutOfStockSale ? 'bg-primary' : 'bg-line'"
              @click="allowOutOfStockSale = !allowOutOfStockSale"
            >
              <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="allowOutOfStockSale ? 'left-4' : 'left-0.5'" />
            </button>
          </label>
          <div class="flex justify-end">
            <button type="button" class="btn-secondary" :disabled="savingStockPolicy" @click="saveStockPolicy">{{ $t('common.save') }}</button>
          </div>
        </div>

        <div v-if="canResetSystem" class="card border-2 border-danger space-y-4">
          <div>
            <h2 class="font-heading text-base text-danger-strong">{{ $t('settings.dangerZoneTitle') }}</h2>
            <p class="text-xs text-muted mt-1">{{ $t('settings.dangerZoneIntro') }}</p>
          </div>
          <ul class="text-xs text-muted list-disc list-inside space-y-0.5">
            <li>{{ $t('settings.dangerZoneKeeps') }}</li>
            <li>{{ $t('settings.dangerZoneWipes') }}</li>
          </ul>
          <button type="button" class="btn-danger" @click="showResetModal = true">{{ $t('settings.dangerZoneButton') }}</button>
        </div>
      </div>
    </div>

    <Modal v-if="showResetModal" :title="$t('settings.dangerZoneTitle')" @close="showResetModal = false">
      <div class="space-y-4">
        <p class="text-sm">{{ $t('settings.dangerZoneIntro') }}</p>
        <ul class="text-xs text-muted list-disc list-inside space-y-0.5">
          <li>{{ $t('settings.dangerZoneKeeps') }}</li>
          <li>{{ $t('settings.dangerZoneWipes') }}</li>
        </ul>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('settings.dangerZoneConfirmLabel') }}</label>
          <input v-model="resetConfirmText" type="text" class="input font-mono" placeholder="RESET" autocomplete="off" />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showResetModal = false">{{ $t('common.cancel') }}</button>
          <button type="button" class="btn-danger" :disabled="!resetConfirmReady || resettingSystem" @click="submitReset">
            {{ $t('settings.dangerZoneButton') }}
          </button>
        </div>
      </div>
    </Modal>

    <Modal v-if="showBranchModal" :title="editingBranchId === null ? $t('settings.newBranch') : $t('settings.editBranch')" @close="showBranchModal = false">
      <form class="space-y-4" @submit.prevent="submitBranch">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('common.name') }}</label>
            <input v-model="branchForm.name" type="text" class="input" required />
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">{{ $t('settings.code') }}</label>
            <input v-model="branchForm.code" type="text" class="input" required />
          </div>
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('settings.address') }}</label>
          <input v-model="branchForm.address" type="text" class="input" />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.phone') }}</label>
          <input v-model="branchForm.phone" type="text" class="input" />
        </div>
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('settings.receiptFooter') }}</label>
          <input v-model="branchForm.receiptFooter" type="text" class="input" />
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="branchForm.active" type="checkbox" class="rounded" />
          {{ $t('common.active') }}
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showBranchModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary">{{ editingBranchId === null ? $t('settings.create') : $t('common.save') }}</button>
        </div>
      </form>
    </Modal>

    <Modal v-if="showTillModal" :title="editingTillId === null ? $t('settings.newTill') : $t('settings.editTill')" @close="showTillModal = false">
      <form class="space-y-4" @submit.prevent="submitTill">
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('settings.tillName') }}</label>
          <input v-model="tillForm.name" type="text" class="input" required />
        </div>
        <SearchableSelect v-model="tillForm.branchId" :label="$t('common.branch')" :options="branchOptions" required />
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('settings.deviceKey') }}</label>
          <input v-model="tillForm.deviceKey" type="text" class="input font-mono" :placeholder="$t('settings.deviceKeyHint')" required />
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="tillForm.active" type="checkbox" class="rounded" />
          {{ $t('common.active') }}
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showTillModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary">{{ editingTillId === null ? $t('settings.register') : $t('common.save') }}</button>
        </div>
      </form>
    </Modal>

    <Modal v-if="showPaymentModal" :title="editingPaymentId === null ? $t('settings.newPayment') : $t('settings.editPayment')" @close="showPaymentModal = false">
      <form class="space-y-4" @submit.prevent="submitPaymentMethod">
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('common.name') }}</label>
          <input v-model="paymentForm.name" type="text" class="input" required />
        </div>
        <SearchableSelect v-model="paymentForm.type" :label="$t('common.type')" :options="paymentMethodTypes" :searchable="false" :clearable="false" />
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('settings.feePercent') }}</label>
          <input v-model.number="paymentForm.feePercent" type="number" min="0" step="0.1" class="input" />
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="paymentForm.enabled" type="checkbox" class="rounded" />
          {{ $t('settings.enabled') }}
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showPaymentModal = false">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn-primary">{{ editingPaymentId === null ? $t('settings.create') : $t('common.save') }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
