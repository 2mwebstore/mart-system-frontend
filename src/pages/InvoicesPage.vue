<script setup lang="ts">
// Invoices: back-office sales to a customer, paid over time (Due → Pending →
// Paid). Separate from POS receipts. See components/invoices/* and
// handlers/invoices.go.
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Ban, Pencil, Plus, Wallet } from 'lucide-vue-next'
import * as invoiceApi from '@/api/invoices'
import { listPaymentMethods } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useDebounced, usePagedList } from '@/composables/usePagedList'
import Modal from '@/components/Modal.vue'
import Pagination from '@/components/Pagination.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import DateRangePicker from '@/components/DateRangePicker.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import InvoiceDetail from '@/components/invoices/InvoiceDetail.vue'
import InvoicePaymentForm from '@/components/invoices/InvoicePaymentForm.vue'
import { t } from '@/i18n'
import { formatUSD } from '@/utils/format'
import type { Invoice, InvoicePaymentInput, InvoiceSummary, PaymentMethodRow } from '@/types/domain'

const auth = useAuthStore()
const toast = useToast()
const branchId = computed(() => auth.activeBranchId ?? auth.branches[0]?.id ?? 1)
const branchName = computed(() => auth.branches.find((b) => b.id === branchId.value)?.name ?? '')
const canManage = auth.hasPermission('invoice.manage')

// ---- List ---------------------------------------------------------------------
type Filter = 'open' | 'DUE' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'all'
const filter = ref<Filter>('open')
const filters: { key: Filter; label: string }[] = [
  { key: 'open', label: t('invoices.filter.open') },
  { key: 'DUE', label: t('invoices.status.DUE') },
  { key: 'PENDING', label: t('invoices.status.PENDING') },
  { key: 'PAID', label: t('invoices.status.PAID') },
  { key: 'OVERDUE', label: t('invoices.status.OVERDUE') },
  { key: 'CANCELLED', label: t('invoices.status.CANCELLED') },
  { key: 'all', label: t('invoices.filter.all') },
]
const filterOptions = computed(() => filters.map((f) => ({ value: f.key, label: f.label })))
const search = ref('')
const debouncedSearch = useDebounced(search)
const range = ref<{ from: string; to: string } | null>(null)

const list = reactive(
  usePagedList<Invoice, InvoiceSummary>(
    ({ page, perPage }) => {
      const f = filter.value
      return invoiceApi.pageInvoices(branchId.value, {
        page,
        perPage,
        q: debouncedSearch.value.trim(),
        status: f === 'CANCELLED' ? 'cancelled' : f === 'all' ? 'all' : 'open',
        paymentStatus: ['DUE', 'PENDING', 'PAID', 'OVERDUE'].includes(f) ? f : null,
        dateFrom: range.value?.from,
        dateTo: range.value?.to,
      })
    },
    { deps: [branchId, filter, debouncedSearch, range] },
  ),
)

const today = new Date().toISOString().slice(0, 10)
function isOverdue(i: Invoice) {
  return i.status === 'OPEN' && i.paymentStatus !== 'PAID' && !!i.dueDate && i.dueDate < today
}
function tone(i: Invoice) {
  return i.status === 'CANCELLED' ? 'neutral' : i.paymentStatus === 'PAID' ? 'success' : isOverdue(i) ? 'danger' : 'warning'
}
function statusLabel(i: Invoice) {
  if (i.status === 'CANCELLED') return t('invoices.status.CANCELLED')
  return isOverdue(i) ? t('invoices.status.OVERDUE') : t(`invoices.status.${i.paymentStatus}`)
}

// ---- Reference data (loaded when first needed) ---------------------------------
const paymentMethods = ref<PaymentMethodRow[]>([])
async function ensurePaymentMethods() {
  if (paymentMethods.value.length === 0) paymentMethods.value = await listPaymentMethods()
}

// ---- Create / edit: their own page (InvoiceEditPage) ------------------------------
const router = useRouter()
function newInvoice() {
  router.push({ name: 'invoice-new' })
}
function editInvoice(inv: Invoice) {
  detail.value = null
  router.push({ name: 'invoice-edit', params: { id: inv.id } })
}

// ---- Detail ---------------------------------------------------------------------
const detail = ref<Invoice | null>(null)
const busy = ref(false)
async function openInvoice(i: Invoice) {
  try {
    const [inv] = await Promise.all([invoiceApi.getInvoice(i.id), ensurePaymentMethods()])
    detail.value = inv
  } catch {
    // toasted
  }
}
async function act(fn: () => Promise<Invoice>, message: string) {
  busy.value = true
  try {
    detail.value = await fn()
    toast.success(message)
    await list.reload()
  } catch {
    // toasted
  } finally {
    busy.value = false
  }
}
function addPayment(input: InvoicePaymentInput) {
  const inv = detail.value
  if (!inv) return
  void act(() => invoiceApi.addInvoicePayment(inv.id, input), t('invoices.paymentSaved', { amount: formatUSD(input.amountCents) }))
}
function deletePayment(paymentId: number) {
  const inv = detail.value
  if (!inv) return
  void act(() => invoiceApi.deleteInvoicePayment(inv.id, paymentId), t('invoices.paymentDeleted'))
}
function cancelInvoice(reason: string) {
  const inv = detail.value
  if (!inv) return
  void act(() => invoiceApi.cancelInvoice(inv.id, reason), t('invoices.cancelled', { code: inv.code }))
}
// ---- Row buttons: Payment / Edit / Cancel ---------------------------------------
const canPay = (i: Invoice) => canManage && i.status === 'OPEN' && i.balanceCents > 0
const canEdit = (i: Invoice) => canManage && i.status === 'OPEN'
const canCancel = (i: Invoice) => canManage && i.status === 'OPEN' && i.paidCents === 0
const paying = ref<Invoice | null>(null)
async function openPayment(i: Invoice) {
  try {
    await ensurePaymentMethods()
    paying.value = i
  } catch {
    // toasted
  }
}
async function savePayment(input: InvoicePaymentInput) {
  const inv = paying.value
  if (!inv) return
  busy.value = true
  try {
    await invoiceApi.addInvoicePayment(inv.id, input)
    toast.success(t('invoices.paymentSaved', { amount: formatUSD(input.amountCents) }))
    paying.value = null
    await list.reload()
  } catch {
    // toasted
  } finally {
    busy.value = false
  }
}
async function cancelFromRow(i: Invoice) {
  const reason = window.prompt(t('invoices.cancelPrompt', { code: i.code }), '')
  if (reason === null) return
  try {
    await invoiceApi.cancelInvoice(i.id, reason.trim())
    toast.success(t('invoices.cancelled', { code: i.code }))
    await list.reload()
  } catch {
    // toasted
  }
}

function printInvoice() {
  if (detail.value) window.open(`/print/invoice/${detail.value.id}`, '_blank')
}
</script>

<template>
  <div class="p-4 sm:p-8 space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="font-heading text-2xl">{{ $t('invoices.title') }}</h1>
        <p class="text-muted text-sm">{{ branchName }} · {{ $t('invoices.subtitle') }}</p>
      </div>
      <button v-if="canManage" type="button" class="btn-primary flex items-center gap-2" @click="newInvoice">
        <Plus :stroke-width="1.8" class="w-4 h-4" /> {{ $t('invoices.new') }}
      </button>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="card">
        <p class="text-sm text-muted">{{ $t('invoices.kpiInvoiced') }}</p>
        <p class="font-mono text-2xl mt-1">{{ formatUSD(list.summary?.totalCents ?? 0) }}</p>
        <p class="text-xs text-muted mt-1">{{ $t('invoices.kpiCount', { n: list.summary?.count ?? 0 }, list.summary?.count ?? 0) }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-muted">{{ $t('invoices.kpiCollected') }}</p>
        <p class="font-mono text-2xl mt-1 text-success-text">{{ formatUSD(list.summary?.paidCents ?? 0) }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-muted">{{ $t('invoices.kpiOutstanding') }}</p>
        <p class="font-mono text-2xl mt-1">{{ formatUSD(list.summary?.balanceCents ?? 0) }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-muted">{{ $t('invoices.kpiOverdue') }}</p>
        <p class="font-mono text-2xl mt-1" :class="(list.summary?.overdue ?? 0) > 0 ? 'text-danger-strong' : ''">{{ list.summary?.overdue ?? 0 }}</p>
      </div>
    </div>

    <div class="card space-y-3">
      <div class="flex flex-wrap items-end gap-3">
        <input v-model="search" type="search" class="input max-w-xs" :placeholder="$t('invoices.searchPlaceholder')" />
        <SearchableSelect
          :model-value="filter"
          class="w-full sm:w-52"
          :label="$t('col.status')"
          :options="filterOptions"
          :clearable="false"
          @update:model-value="(v) => (filter = (v ?? 'open') as Filter)"
        />
        <div>
          <label class="block text-sm text-muted mb-1">{{ $t('invoices.invoiceDate') }}</label>
          <DateRangePicker v-model="range" clearable @clear="range = null" />
        </div>
      </div>
      <!-- relative: keeps the screen-reader-only "Actions" header (absolutely
           positioned) inside this scroll box instead of widening the page -->
      <div class="relative overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-line">
              <th class="py-2 font-medium">{{ $t('invoices.invoice') }}</th>
              <th class="py-2 font-medium">{{ $t('col.date') }}</th>
              <th class="py-2 font-medium">{{ $t('invoices.customer') }}</th>
              <th class="py-2 font-medium">{{ $t('invoices.dueDate') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('col.total') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('invoices.paid') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('invoices.balance') }}</th>
              <th class="py-2 font-medium">{{ $t('col.status') }}</th>
              <th v-if="canManage" class="py-2 font-medium"><span class="sr-only">{{ $t('invoices.actions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in list.rows" :key="i.id" class="border-b border-line last:border-0 hover:bg-surface-subtle cursor-pointer" @click="openInvoice(i)">
              <td class="py-2 font-mono text-xs">{{ i.code }}</td>
              <td class="py-2 font-mono text-xs">{{ i.invoiceDate }}</td>
              <td class="py-2">
                <p>{{ i.customerName }}</p>
                <p class="text-xs text-muted font-mono">{{ i.customerPhone }}</p>
              </td>
              <td class="py-2 font-mono text-xs" :class="isOverdue(i) ? 'text-danger-strong font-medium' : ''">{{ i.dueDate ?? '—' }}</td>
              <td class="py-2 text-right font-mono">{{ formatUSD(i.totalCents) }}</td>
              <td class="py-2 text-right font-mono text-success-text">{{ formatUSD(i.paidCents) }}</td>
              <td class="py-2 text-right font-mono font-medium">{{ i.status === 'OPEN' ? formatUSD(i.balanceCents) : '—' }}</td>
              <td class="py-2"><StatusBadge :tone="tone(i)" :label="statusLabel(i)" /></td>
              <td v-if="canManage" class="py-2" @click.stop>
                <div class="flex items-center justify-end gap-1">
                  <button
                    v-if="canPay(i)"
                    type="button"
                    class="btn-primary p-2 flex items-center justify-center"
                    :aria-label="$t('invoices.payAria', { code: i.code })"
                    :title="$t('invoices.payBtn')"
                    @click="openPayment(i)"
                  >
                    <Wallet class="w-4 h-4" />
                  </button>
                  <button
                    v-if="canEdit(i)"
                    type="button"
                    class="btn-secondary p-2 flex items-center justify-center"
                    :aria-label="$t('invoices.editAria', { code: i.code })"
                    :title="$t('invoices.edit')"
                    @click="editInvoice(i)"
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button
                    v-if="canCancel(i)"
                    type="button"
                    class="btn-secondary p-2 flex items-center justify-center text-danger-strong"
                    :aria-label="$t('invoices.cancelAria', { code: i.code })"
                    :title="$t('invoices.cancelBtn')"
                    @click="cancelFromRow(i)"
                  >
                    <Ban class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!list.loading && list.rows.length === 0">
              <td :colspan="canManage ? 9 : 8" class="py-6 text-center text-muted">{{ $t('invoices.none') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination v-model:page="list.page" :total-pages="list.totalPages" :total="list.total" :per-page="list.perPage" :noun="$t('invoices.noun')" />
    </div>


    <Modal v-if="paying" :title="$t('invoices.payTitle', { code: paying.code })" wide @close="paying = null">
      <div class="space-y-4">
        <div class="rounded-control bg-surface-subtle p-3 text-sm space-y-1">
          <p class="font-medium">{{ paying.customerName }} <span class="text-muted font-mono font-normal">{{ paying.customerPhone }}</span></p>
          <div class="flex justify-between"><span class="text-muted">{{ $t('col.total') }}</span><span class="font-mono">{{ formatUSD(paying.totalCents) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">{{ $t('invoices.paid') }}</span><span class="font-mono text-success-text">{{ formatUSD(paying.paidCents) }}</span></div>
          <div class="flex justify-between font-medium"><span>{{ $t('invoices.balance') }}</span><span class="font-mono">{{ formatUSD(paying.balanceCents) }}</span></div>
        </div>
        <InvoicePaymentForm :balance-cents="paying.balanceCents" :reset-key="paying.paidCents" :payment-methods="paymentMethods" :busy="busy" @submit="savePayment" />
      </div>
    </Modal>

    <Modal v-if="detail" :title="detail.code" wide @close="detail = null">
      <InvoiceDetail
        :invoice="detail"
        :payment-methods="paymentMethods"
        :can-manage="canManage"
        :busy="busy"
        @edit="editInvoice(detail)"
        @cancel="cancelInvoice"
        @add-payment="addPayment"
        @delete-payment="deletePayment"
        @print="printInvoice"
      />
    </Modal>
  </div>
</template>
