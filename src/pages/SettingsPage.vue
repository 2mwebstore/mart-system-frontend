<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Pencil, Plus } from 'lucide-vue-next'
import * as settingsApi from '@/api/settings'
import type { Branch, PaymentMethodRow, Till } from '@/types/domain'
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
const toast = useToast()
const activeTab = ref('rate')
const tabs = computed(() => [
  { key: 'rate', label: t('settings.tabRate') },
  { key: 'branches', label: t('settings.tabBranches') },
  { key: 'payments', label: t('settings.tabPayments') },
  { key: 'receipt', label: t('settings.tabReceipt') },
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
  await Promise.allSettled([loadBranches(), canManage ? loadTills() : Promise.resolve(), loadPayments()])
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
  const ok = await attempt(
    () => (id === null ? settingsApi.createBranch({ ...branchForm }) : settingsApi.updateBranch(id, { ...branchForm })),
    loadBranches,
  )
  if (ok) {
    toast.success(id === null ? t('settings.branchCreated') : t('settings.branchUpdated'))
    showBranchModal.value = false
  }
}
async function deleteBranch(id: number) {
  if (await attempt(() => settingsApi.deleteBranch(id), loadBranches)) toast.success(t('settings.branchDeleted'))
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
    () => settings.saveApp({ receiptHeader: receiptForm.header, receiptFooter: receiptForm.footer, loyaltyPointsPerUsd: Number(receiptForm.loyaltyRate) || 0 }),
    () => undefined,
  )
  if (ok) toast.success(t('settings.receiptSaved'))
}
</script>

<template>
  <div class="p-8 space-y-6">
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

    <div v-else class="card max-w-xl space-y-4">
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
