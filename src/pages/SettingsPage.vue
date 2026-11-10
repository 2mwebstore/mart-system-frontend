<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Pencil, Plus, Send } from 'lucide-vue-next'
import * as settingsApi from '@/api/settings'
import {
  COMPANY_ALERT_TYPES,
  type AlertType,
  type Branch,
  type DocType,
  type NumberSequence,
  type PaymentMethodRow,
  type Till,
} from '@/types/domain'
import StatusBadge from '@/components/StatusBadge.vue'
import Modal from '@/components/Modal.vue'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import SearchInput from '@/components/SearchInput.vue'
import Pagination from '@/components/Pagination.vue'
import { useLocalList } from '@/composables/useLocalList'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import { useRouteSection } from '@/composables/useRouteSection'
import { canOpen } from '@/utils/pageAccess'
import { formatDateTime } from '@/utils/format'
import { label, t } from '@/i18n'
import DiningTablesPanel from '@/components/settings/DiningTablesPanel.vue'
import CompanyPanel from '@/components/settings/CompanyPanel.vue'
import TaxRatesPanel from '@/components/settings/TaxRatesPanel.vue'

const auth = useAuthStore()
const settings = useSettingsStore()
const toast = useToast()
// Backups and the production reset cover every company, so they're on the
// super admin's platform pages, not here.
const canManageSystem = auth.hasPermission('system.manage')
// Branches and their tills, payment methods: create / edit / delete each.
const canViewTills = auth.hasPermission('branch.view')
const canCreateBranch = auth.hasPermission('branch.create')
const canEditBranch = auth.hasPermission('branch.update')
const canDeleteBranch = auth.hasPermission('branch.delete')
const canCreatePayment = auth.hasPermission('payment_method.create')
const canEditPayment = auth.hasPermission('payment_method.update')
const canDeletePayment = auth.hasPermission('payment_method.delete')
// Company, receipt and loyalty settings.
const canEditCompany = auth.hasPermission('settings.company')
const canEditRate = auth.hasPermission('settings.rate')
// Settings is several pages, each with its own address and sidebar entry
// (/settings/exchange-rate, /settings/branches…), drawn by this one component.
// Only those this person can open are offered (the sidebar lists the same).
// The router opens Branches when there are none yet (see router/index.ts).
const sections = computed(() =>
  [
    { key: 'rate', route: 'settings-rate', label: t('settings.tabRate') },
    { key: 'branches', route: 'settings-branches', label: t('settings.tabBranches') },
    { key: 'tables', route: 'settings-tables', label: t('tables.tab') },
    { key: 'payments', route: 'settings-payments', label: t('settings.tabPayments') },
    { key: 'tax', route: 'settings-tax', label: t('tax.tab') },
    { key: 'company', route: 'settings-company', label: t('settings.tabCompany') },
    { key: 'receipt', route: 'settings-receipt', label: t('settings.tabReceipt') },
    { key: 'alerts', route: 'settings-alerts', label: t('alerts.tab') },
    { key: 'system', route: 'settings-system', label: t('settings.tabSystem') },
  ].filter((s) => canOpen(s.route, auth.hasPermission)),
)
const section = useRouteSection(() => sections.value.map((s) => s.key))
const pageTitle = computed(() => sections.value.find((s) => s.key === section.value)?.label ?? t('settings.title'))

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
// These lists come whole (the POS and other pages need them complete), so
// search and pages are worked out here.
const branchName = (id: number) => branches.value.find((b) => b.id === id)?.name ?? '—'
const rateList = useLocalList(() => settings.rateHistory, { text: (h) => `${h.rate} ${h.setBy}` })
const branchList = useLocalList(() => branches.value, { text: (b) => `${b.name} ${b.code} ${b.address}` })
const tillList = useLocalList(() => tills.value, { text: (d) => `${d.name} ${d.deviceKey} ${branchName(d.branchId)}` })
const paymentList = useLocalList(() => paymentMethodsList.value, { text: (p) => `${p.name} ${paymentTypeLabel(p.type)}` })

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
    canViewTills ? loadTills() : Promise.resolve(),
    loadPayments(),
    canManageSystem ? loadNotify() : Promise.resolve(),
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
        // Not editable through this form — PUT /settings never touches them
        // server-side either (see UpdateSettings) — passed through as-is so
        // this call satisfies AppSettings without silently resetting them.
        allowOutOfStockSale: settings.app.allowOutOfStockSale,
        defaultCustomerId: settings.app.defaultCustomerId,
        defaultCustomerName: settings.app.defaultCustomerName,
        taxDefaults: settings.app.taxDefaults,
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

// --- Document numbering ---------------------------------------------------------

const numberSequences = ref<NumberSequence[]>([])
const numberForms = reactive<Record<DocType, { prefix: string; nextNumber: number }>>({
  SALE: { prefix: '', nextNumber: 1 },
  EXPENSE: { prefix: '', nextNumber: 1 },
  PURCHASE_ORDER: { prefix: '', nextNumber: 1 },
  INVOICE: { prefix: '', nextNumber: 1 },
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

// --- Audit log retention: the system administrator sets it, the company sees it ---

const retentionMonths = ref(0)

async function loadRetention() {
  retentionMonths.value = (await settingsApi.getActivityLogRetention()).retentionMonths
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

</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <h1 class="font-heading text-2xl">{{ pageTitle }}</h1>

    <div v-if="section === 'rate'" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        <SearchInput v-model="rateList.search" :placeholder="$t('common.search')" class="mb-3" />
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted border-b border-line">
                <th class="py-2 font-medium">{{ $t('col.rate') }}</th>
                <th class="py-2 font-medium">{{ $t('col.setBy') }}</th>
                <th class="py-2 font-medium">{{ $t('col.effectiveFrom') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in rateList.rows" :key="h.id" class="border-b border-line last:border-0">
                <td class="py-2 font-mono">៛ {{ h.rate.toLocaleString() }}</td>
                <td class="py-2">{{ h.setBy }}</td>
                <td class="py-2 font-mono text-xs">{{ formatDateTime(h.effectiveAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Pagination v-model:page="rateList.page" :total-pages="rateList.totalPages" :total="rateList.total" :per-page="rateList.perPage" :noun="$t('settings.rateNoun')" />
      </div>
    </div>

    <div v-else-if="section === 'branches'" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <p v-if="auth.branches.length === 0" class="lg:col-span-2 rounded-control bg-primary-tint text-primary-tint-text px-4 py-3 text-sm">
        {{ $t('settings.noBranchesYetHint') }}
      </p>
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-heading text-base">{{ $t('settings.branches') }}</h2>
          <button v-if="canCreateBranch" type="button" class="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm" @click="newBranch">
            <Plus :stroke-width="1.8" class="w-3.5 h-3.5" /> {{ $t('settings.newBranch') }}
          </button>
        </div>
        <SearchInput v-model="branchList.search" :placeholder="$t('settings.searchBranchesPlaceholder')" class="mb-3" />
        <div class="overflow-x-auto">
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
              <tr v-for="b in branchList.rows" :key="b.id" class="border-b border-line last:border-0 group">
                <td class="py-2">
                  <p>{{ b.name }}</p>
                  <p class="text-xs text-muted">{{ b.address }}</p>
                </td>
                <td class="py-2 font-mono">{{ b.code }}</td>
                <td class="py-2"><StatusBadge :tone="b.active ? 'success' : 'neutral'" :label="b.active ? $t('common.active') : $t('settings.inactive')" /></td>
                <td class="py-2">
                  <div v-if="canEditBranch || canDeleteBranch" class="flex items-center gap-1">
                    <button v-if="canEditBranch" type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('settings.editBranchAria')" @click="editBranch(b)">
                      <Pencil :stroke-width="1.8" class="w-4 h-4" />
                    </button>
                    <ConfirmDelete v-if="canDeleteBranch" :item-label="$t('entity.branch')" :item-name="b.name" @confirm="deleteBranch(b.id)" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Pagination v-model:page="branchList.page" :total-pages="branchList.totalPages" :total="branchList.total" :per-page="branchList.perPage" :noun="$t('settings.branchesNoun')" />
      </div>
      <div v-if="canViewTills" class="card">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-heading text-base">{{ $t('settings.tills') }}</h2>
          <button v-if="canCreateBranch" type="button" class="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm" @click="newTill">
            <Plus :stroke-width="1.8" class="w-3.5 h-3.5" /> {{ $t('settings.newTill') }}
          </button>
        </div>
        <SearchInput v-model="tillList.search" :placeholder="$t('settings.searchTillsPlaceholder')" class="mb-3" />
        <div class="overflow-x-auto">
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
              <tr v-for="d in tillList.rows" :key="d.id" class="border-b border-line last:border-0">
                <td class="py-2">{{ d.name }}</td>
                <td class="py-2 text-muted">{{ branchName(d.branchId) }}</td>
                <td class="py-2 font-mono text-xs">{{ d.deviceKey }}</td>
                <td class="py-2 font-mono text-xs">{{ formatDateTime(d.lastSeenAt) }}</td>
                <td class="py-2"><StatusBadge :tone="d.active ? 'success' : 'neutral'" :label="d.active ? $t('common.active') : $t('settings.inactive')" /></td>
                <td class="py-2">
                  <div v-if="canEditBranch || canDeleteBranch" class="flex items-center gap-1">
                    <button v-if="canEditBranch" type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('settings.editTillAria')" @click="editTill(d)">
                      <Pencil :stroke-width="1.8" class="w-4 h-4" />
                    </button>
                    <ConfirmDelete v-if="canDeleteBranch" :item-label="$t('entity.till')" :item-name="d.name" @confirm="deleteTill(d.id)" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Pagination v-model:page="tillList.page" :total-pages="tillList.totalPages" :total="tillList.total" :per-page="tillList.perPage" :noun="$t('settings.tillsNoun')" />
      </div>
    </div>

    <DiningTablesPanel v-else-if="section === 'tables'" />

    <div v-else-if="section === 'payments'" class="card max-w-2xl">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-heading text-base">{{ $t('settings.payments') }}</h2>
        <button v-if="canCreatePayment" type="button" class="btn-primary flex items-center gap-2" @click="newPaymentMethod">
          <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('settings.newPayment') }}
        </button>
      </div>
      <SearchInput v-model="paymentList.search" :placeholder="$t('settings.searchPaymentsPlaceholder')" class="mb-3" />
      <div class="overflow-x-auto">
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
            <tr v-for="p in paymentList.rows" :key="p.id" class="border-b border-line last:border-0">
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
                  :disabled="!canEditPayment"
                  @click="togglePaymentEnabled(p)"
                >
                  <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="p.enabled ? 'left-4' : 'left-0.5'" />
                </button>
              </td>
              <td class="py-2">
                <div v-if="canEditPayment || canDeletePayment" class="flex items-center gap-1">
                  <button v-if="canEditPayment" type="button" class="p-1.5 text-muted hover:text-ink" :aria-label="$t('settings.editPaymentAria')" @click="editPaymentMethod(p)">
                    <Pencil :stroke-width="1.8" class="w-4 h-4" />
                  </button>
                  <ConfirmDelete v-if="canDeletePayment" :item-label="$t('entity.paymentMethod')" :item-name="p.name" @confirm="deletePaymentMethod(p.id)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination v-model:page="paymentList.page" :total-pages="paymentList.totalPages" :total="paymentList.total" :per-page="paymentList.perPage" :noun="$t('settings.paymentsNoun')" />
    </div>

    <TaxRatesPanel v-else-if="section === 'tax'" />

    <CompanyPanel v-else-if="section === 'company'" />

    <div v-else-if="section === 'receipt'" class="card max-w-xl space-y-4">
      <div>
        <label class="block text-sm text-muted mb-1">{{ $t('settings.receiptHeader') }}</label>
        <input v-model="receiptForm.header" type="text" class="input" />
        <p class="text-xs text-muted mt-1">{{ $t('settings.receiptHeaderHint') }}</p>
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
        <button type="button" class="btn-primary" :disabled="!canEditCompany" @click="saveReceipt">{{ $t('common.save') }}</button>
      </div>
    </div>

    <div v-else-if="section === 'alerts'" class="max-w-2xl">
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
            <label v-for="type in COMPANY_ALERT_TYPES" :key="type" class="flex items-center gap-2 text-sm cursor-pointer">
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
    </div>

    <div v-else-if="section === 'system'" class="space-y-4">
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
          <div v-if="retentionMonths > 0" class="space-y-1">
            <p class="text-sm">{{ $t('settings.retentionKeptFor', { n: retentionMonths }, retentionMonths) }}</p>
            <p class="text-xs text-muted">{{ $t('settings.retentionSetByAdmin') }}</p>
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
      </div>
    </div>

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
